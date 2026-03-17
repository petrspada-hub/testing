(() => {
  const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxamZ3Y3NydWdvcG1vdHR3bXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTMyMjIsImV4cCI6MjA4MTQyOTIyMn0.OztHP1F8II2zSKJb1biDqKs1xvO6Z8rWYsI2WSK8St8";

  async function sbGet(path) {
    const r = await fetch(SUPABASE_URL + path, { headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON } });
    let body = null; try { body = await r.json(); } catch(_) {}
    if (!r.ok) throw body ?? { error: `HTTP ${r.status}` };
    return body;
  }
  async function sbGetWithMeta(path, opts = {}) {
    const r = await fetch(SUPABASE_URL + path, {
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, ...(opts.headers || {}) }
    });
    let body = null; try { body = await r.json(); } catch(_) {}
    if (!r.ok) throw body ?? { error: `HTTP ${r.status}` };
    return { body, headers: r.headers };
  }
  async function sbCount(path) {
    const { headers } = await sbGetWithMeta(path, { headers: { Prefer: "count=exact" } });
    const cr = headers.get("content-range");
    const total = cr && cr.includes("/") ? parseInt(cr.split("/")[1], 10) : NaN;
    return Number.isFinite(total) ? total : 0;
  }

  async function sbUpsert(row) {
    const r = await fetch(SUPABASE_URL + "/rest/v1/scores?on_conflict=device_id,difficulty", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(row)
    });
    let body = null; try { body = await r.json(); } catch(_) {}
    if (!r.ok) throw body ?? { error: `HTTP ${r.status}` };
  }
  async function renameScoresForThisDevice(newNick) {
    const r = await fetch(SUPABASE_URL + `/rest/v1/scores?device_id=eq.${DEVICE_ID}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ nick: newNick })
    });
    if (!r.ok) { let body=null; try{body=await r.json();}catch(_){ } console.error("Rename failed:", r.status, body); }
  }
  async function sbDeleteDeviceScores() {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/delete_scores_for_device", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ p_device_id: DEVICE_ID })
    });
    if (!r.ok) { let body=null; try{body=await r.json();}catch(_){ } throw body ?? { error: `HTTP ${r.status}` }; }
  }

  const DEVICE_KEY = "CasuaSlicerDeviceId";
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  }
  const DEVICE_ID = getDeviceId();

  const nickInput = document.getElementById("nick");
  const nickBtn = document.getElementById("saveNick");
  function getNick() { return localStorage.getItem("nick") ?? ""; }
  function setNick(v) { localStorage.setItem("nick", v); }
  function clearNick(){ localStorage.removeItem("nick"); }
  if (nickInput) nickInput.value = getNick();
  if (nickBtn) {
    nickBtn.onclick = async () => {
      const n = (nickInput?.value ?? "").trim();
      if (!n) {
        try { clearNick(); if (nickInput) nickInput.value = ""; await sbDeleteDeviceScores(); await renderLeaderboard(); } catch(e) { console.error("Delete on empty nick failed:", e); }
        return;
      }
      try { setNick(n); await renameScoresForThisDevice(n); await ensureAllDifficultiesUpsert(n); await renderLeaderboard(); } catch(e) { console.error("Save nick failed:", e); }
    };
  }

  const lbBtn = document.getElementById("lbToggle");
  const lbPanel = document.getElementById("lbPanel");
  if (lbBtn) lbBtn.style.display = "none";
  document.querySelectorAll("#lbPanel .me").forEach(el => el.remove());
  const nickRow = document.getElementById("nickRow");
  function setNickVisible(show) {
    if (nickRow) { nickRow.style.display = show ? "" : "none"; }
    else { if (nickInput) nickInput.style.display = show ? "" : "none"; if (nickBtn) nickBtn.style.display = show ? "" : "none"; }
  }
  setNickVisible(lbPanel && !lbPanel.classList.contains("hidden"));
  function toggleLeaderboard() {
    const nowHidden = lbPanel.classList.toggle("hidden");
    lbPanel.setAttribute("aria-hidden", nowHidden.toString());
    lbBtn?.setAttribute("aria-expanded", (!nowHidden).toString());
    setNickVisible(!nowHidden);
    if (!nowHidden) renderLeaderboard();
  }
  if (lbBtn) lbBtn.onclick = toggleLeaderboard;

  function escapeHtml(v) {
    return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
  }

  function renderList(el, rows, meRow = null, meRank = null) {
    if (!rows.length && !meRow) {
      el.innerHTML = "<li><div class=\"lb-row\"><span class=\"name\">—</span><span class=\"score\"></span></div></li>";
      return;
    }
    const base = rows.map((r, i) => `
        <li>
          <div class="lb-row">
            <span class="rank">${i + 1}.</span>
            <span class="name">${escapeHtml(r.nick)}</span>
            <span class="score">${escapeHtml(r.score)}</span>
          </div>
        </li>`).join("");

    const me =
      (meRow && Number.isFinite(meRank) && meRank > 3)
        ? `
        <li class="me" style="margin-top:6px;">
          <div class="lb-row" style="opacity:.95;">
            <span class="rank">${meRank}.</span>
            <span class="name">${escapeHtml(meRow.nick)}</span>
            <span class="score">${escapeHtml(meRow.score)}</span>
          </div>
        </li>`
        : "";

    el.innerHTML = base + me;
  }

  async function fetchTop(diff) {
    return sbGet(`/rest/v1/scores?difficulty=eq.${diff}&select=nick,score&order=score.desc&limit=3`);
  }
  async function fetchMeRow(diff) {
    const rows = await sbGet(`/rest/v1/scores?device_id=eq.${DEVICE_ID}&difficulty=eq.${diff}&select=score,device_id,nick&order=score.desc&limit=1`);
    return rows?.[0] ?? null;
  }
  async function fetchMyRank(diff, myScore) {
    const greater = await sbCount(`/rest/v1/scores?difficulty=eq.${diff}&score=gt.${encodeURIComponent(myScore)}&select=score`);
    return greater + 1;
  }

  async function renderLeaderboard() {
    try {
      const [topE, topM, topH] = await Promise.all([fetchTop("easy"), fetchTop("medium"), fetchTop("hard")]);
      const [meE, meM, meH] = await Promise.all([fetchMeRow("easy"), fetchMeRow("medium"), fetchMeRow("hard")]);

      const [rankE, rankM, rankH] = await Promise.all([
        meE ? fetchMyRank("easy", meE.score) : Promise.resolve(null),
        meM ? fetchMyRank("medium", meM.score) : Promise.resolve(null),
        meH ? fetchMyRank("hard", meH.score) : Promise.resolve(null),
      ]);

      renderList(document.getElementById("lb-easy"), topE, meE, rankE);
      renderList(document.getElementById("lb-medium"), topM, meM, rankM);
      renderList(document.getElementById("lb-hard"), topH, meH, rankH);

    } catch(e) {
      console.error("Render leaderboard failed:", e);
    }
  }

  const W = 700, H = 300;
  const c = document.getElementById("game");
  const x = c.getContext("2d");
  const img = new Image();
  img.src = "obrazek.png";

  const headImg = new Image();
  headImg.src = "head.png";

  let lastSliceTime = 0;
  let showHead = false;
  let headOffset = 0;
  const HEAD_DELAY = 800;
  const HEAD_MAX = 40;
  const HEAD_SPEED = 2;

  const colors = [[0,255,255],[0,255,0],[255,255,0],[255,127,0],[255,0,0],[255,0,255],[127,0,255],[0,0,255]];
  const modes = ["easy","medium","hard"];
  let mi = 0, mode = modes[mi];
  const diff = { easy:{ tolerancePct:0.10, speed:1, acc:0.05 }, medium:{ tolerancePct:0.05, speed:2, acc:0.125 }, hard:{ tolerancePct:0.025, speed:3, acc:0.25 } };

  let iw=0, ih=0, ix=0, iy=100;
  let SV=0, TOL=0, base=0, spd=0, co=0;
  let ly=iy, dir=1, cut=null, hit=false, score=0, first=true;

  function setMode(m){
    const d = diff[m];
    base = d.speed;
    spd = base - d.acc;
    co = base - 1;
    TOL = Math.floor(ih * d.tolerancePct);
  }

  function reset(full=false){
    cut = null;
    hit = false;
    showHead = false;
    headOffset = 0;
    ly = iy;
    dir = 1;
    if(full){
      score = 0;
      first = true;
      spd = base - diff[mode].acc;
    }
  }

  function update(){
    if(cut===null){
      ly += spd * dir;
      if(ly <= iy){ ly = iy; dir = 1; }
      if(ly >= iy+ih){ ly = iy+ih; dir = -1; }
    }

    if (cut !== null && hit) {
      if (performance.now() - lastSliceTime > HEAD_DELAY) {
        showHead = true;
      }
      if (showHead && headOffset < HEAD_MAX) {
        headOffset += HEAD_SPEED;
      }
    }
  }

  function render(){
    x.fillStyle = "#1e1e1e";
    x.fillRect(0,0,W,H);

    if(cut === null){
      x.drawImage(img, ix, iy, iw, ih);
    } else {
      const srcH = img.naturalHeight;
      const scale = ih / srcH;
      const realCut = Math.round(cut / scale);

      if (showHead && hit) {
        x.drawImage(
          headImg,
          ix,
          iy + cut - headOffset,
          iw,
          50
        );
      }

      x.drawImage(
        img,
        0,
        realCut,
        img.naturalWidth,
        srcH - realCut,
        ix,
        iy + cut,
        iw,
        ih - cut
      );
    }
  }

  async function triggerSlice(){
    first=false;
    if(cut===null){
      let r = Math.round(ly - iy);

      if(Math.abs(r - SV) <= TOL){
        hit = true;
        score++;
        spd += diff[mode].acc;
        r = SV;

        lastSliceTime = performance.now();
        showHead = false;
        headOffset = 0;

      } else {
        hit = false;
        showHead = false;
        headOffset = 0;
        spd = base - diff[mode].acc;
      }
      cut = r;
    } else {
      cut = null;
      if(!hit) score = 0;
      hit=false;
      showHead = false;
      headOffset = 0;
      ly=iy;
      dir=1;
    }
  }

  function loop(){
    update();
    render();
    requestAnimationFrame(loop);
  }

  img.onload = ()=>{
    iw = 600;
    ih = 200;
    ix = 50;
    iy = 100;
    SV = Math.floor(ih * 0.334);

    setMode(mode);
    reset(true);
    requestAnimationFrame(loop);
  };
})();
