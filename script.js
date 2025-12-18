
(() => {
  const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
  const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxamZ3Y3NydWdvcG1vdHR3bXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTMyMjIsImV4cCI6MjA4MTQyOTIyMn0.OztHP1F8II2zSKJb1biDqKs1xvO6Z8rWYsI2WSK8St8";

  async function sbGet(path) {
    const r = await fetch(SUPABASE_URL + path, { headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON } });
    let body = null; try { body = await r.json(); } catch(_) {}
    if (!r.ok) throw body ?? { error: `HTTP ${r.status}` };
    return body;
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
    if (!r.ok) { let body=null; try{body=await r.json();}catch(_){} console.error("Rename failed:", r.status, body); }
  }

  async function sbDeleteDeviceScores() {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/delete_scores_for_device", {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ p_device_id: DEVICE_ID })
    });
    if (!r.ok) { let body=null; try{body=await r.json();}catch(_){} throw body ?? { error: `HTTP ${r.status}` }; }
  }

  const DEVICE_KEY = "CasuaSlicerDeviceId";
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  }
  const DEVICE_ID = getDeviceId();

  const nickInput = document.getElementById("nick");
  const nickBtn   = document.getElementById("saveNick");
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

  const lbBtn   = document.getElementById("lbToggle");
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
  function renderList(el, rows) {
    el.innerHTML = rows.length ? rows.map(r => `<li>${escapeHtml(r.nick)} — ${escapeHtml(r.score)}</li>`).join("") : "<li>—</li>";
  }
  async function fetchTop(diff) {
    return sbGet(`/rest/v1/scores?difficulty=eq.${diff}&select=nick,score&order=score.desc&limit=3`);
  }
  async function renderLeaderboard() {
    try {
      const [topE, topM, topH] = await Promise.all([fetchTop("easy"), fetchTop("medium"), fetchTop("hard")]);
      renderList(document.getElementById("lb-easy"),   topE);
      renderList(document.getElementById("lb-medium"), topM);
      renderList(document.getElementById("lb-hard"),   topH);
    } catch(e) {
      console.error("Render leaderboard failed:", e);
      renderList(document.getElementById("lb-easy"),   []);
      renderList(document.getElementById("lb-medium"), []);
      renderList(document.getElementById("lb-hard"),   []);
    }
  }

  const W = 700, H = 300;
  const c = document.getElementById("game");
  const x = c.getContext("2d");
  const img = new Image();
  img.src = "obrazek.png";

  (function(){
    const css = `
html, body, canvas, #game, .hitbox { -webkit-tap-highlight-color: rgba(0,0,0,0) !important; -webkit-user-select: none !important; user-select: none !important; outline: none !important; }
.hitbox { position: absolute; background: transparent; touch-action: none; -webkit-touch-callout: none; z-index: 9999; }`;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  })();

  const hitbox = document.createElement('div');
  hitbox.className = 'hitbox';
  const parent = c.parentElement ?? document.body;
  const ps = getComputedStyle(parent);
  if (ps.position === 'static') parent.style.position = 'relative';
  c.setAttribute('tabindex', '-1');
  c.style.outline = 'none';
  c.style.userSelect = 'none';
  c.style.webkitUserSelect = 'none';
  c.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
  c.style.touchAction = 'none';
  c.addEventListener('contextmenu', e => e.preventDefault());
  parent.appendChild(hitbox);

  const colors = [[0,255,255],[0,255,0],[255,255,0],[255,127,0],[255,0,0],[255,0,255],[127,0,255],[0,0,255]];
  const modes = ["easy","medium","hard"];
  let mi = 0, mode = modes[mi];
  const diff = { easy:{ tolerancePct:0.10, speed:1, acc:0.05 }, medium:{ tolerancePct:0.05, speed:2, acc:0.125 }, hard:{ tolerancePct:0.025, speed:3, acc:0.25 } };

  const LS = "CasuaSlicerBest";
  let bestLocal = { easy:0, medium:0, hard:0 };
  try { const s = JSON.parse(localStorage.getItem(LS)); if (s && typeof s === "object") bestLocal = { ...bestLocal, ...s }; } catch {}

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
    cut = null; hit = false; ly = iy; dir = 1;
    if(full){ score = 0; first = true; spd = base - diff[mode].acc; }
  }
  function saveBestLocal(){
    if (score > bestLocal[mode]) { bestLocal[mode] = score; localStorage.setItem(LS, JSON.stringify(bestLocal)); }
  }
  async function saveBestGlobal() {
    try { const nick = getNick(); if (!nick) return; await sbUpsert({ device_id: DEVICE_ID, nick, difficulty: mode, score }); }
    catch(e) { console.error("Save global score failed:", e); }
  }

  function drawText(t,xp,yp,col="#fff",s=18,a="left"){
    x.font = `${s}px system-ui,-apple-system,Segoe UI,Roboto,Arial`; x.textBaseline = "top"; x.textAlign = a; x.fillStyle = col; x.fillText(t,xp,yp);
  }
  function drawLine(y,col,w=2){ x.strokeStyle=`rgb(${col[0]},${col[1]},${col[2]})`; x.lineWidth=w; x.beginPath(); x.moveTo(ix,y); x.lineTo(ix+iw,y); x.stroke(); }
  function clamp(v,l,h){ return Math.max(l, Math.min(h, v)); }

  function update(){
    if(cut===null){ ly += spd * dir; if(ly <= iy){ ly = iy; dir = 1; } if(ly >= iy+ih){ ly = iy+ih; dir = -1; } }
  }
  function render(){
    x.fillStyle = "#1e1e1e"; x.fillRect(0,0,W,H);
    if(cut === null){ x.drawImage(img, ix, iy, iw, ih); }
    else {
      const srcH = img.naturalHeight; const scale = ih / srcH; const realCut = Math.round(cut / scale);
      x.drawImage(img, 0, realCut, img.naturalWidth, srcH - realCut, ix, iy + cut, iw, ih - cut);
    }
    if(cut === null){
      const step = Math.trunc((spd - base) / 0.5); const idx = clamp(co + step, 0, colors.length - 1);
      drawLine(Math.round(ly), colors[idx], 2);
    }
    drawText(mode.toUpperCase(),10,10,"#fff",16,"left");
    drawText(`Score: ${score}`, W-10, 10, "#fff", 16, "right");
    drawText(`Best: ${bestLocal[mode]}`, W-10, 28, "#fff", 16, "right");
    if(first) drawText("Stiskni mezerník nebo klikni na CASUA", W/2, 10, "#fff", 18, "center");
    else if(cut !== null) drawText(hit ? "PERFECT!" : "FAIL!", W/2, 10, hit?"#0f0":"#f00", 20, "center");
  }
  function loop(){ update(); render(); requestAnimationFrame(loop); }

  async function triggerSlice(){
    first=false;
    if(cut===null){
      let r = Math.round(ly - iy); r = clamp(r, 0, ih - 1);
      if(Math.abs(r - SV) <= TOL){ hit=true; score++; spd += diff[mode].acc; r = SV; }
      else { hit=false; const wasBetter = score > bestLocal[mode]; saveBestLocal(); if (wasBetter) await saveBestGlobal(); spd = base - diff[mode].acc; }
      cut = r;
    } else {
      cut = null; if(!hit) score = 0; hit=false; ly=iy; dir=1;
    }
  }

  window.addEventListener("keydown", e=>{ if(e.code==="Space"){ e.preventDefault(); triggerSlice(); } });

  function handle(mx, my){
    if(mx>=10 && mx<=140 && my>=10 && my<=40){
      const wasBetter = score > bestLocal[mode]; saveBestLocal(); if (wasBetter) saveBestGlobal().catch(()=>{});
      mi = (mi+1) % modes.length; mode = modes[mi]; setMode(mode); reset(true); return;
    }
    const rightWidth = 180, topHeight = 40;
    if (mx >= W - rightWidth && mx <= W && my >= 10 && my <= 10 + topHeight) { toggleLeaderboard(); return; }
    if(mx >= ix && mx <= ix+iw && my >= iy && my <= iy+ih){ triggerSlice(); }
  }

  hitbox.addEventListener("pointerdown", e=>{ e.preventDefault(); const r = c.getBoundingClientRect(); handle(e.clientX - r.left, e.clientY - r.top); });
  hitbox.addEventListener("click", e=> { e.preventDefault(); e.stopPropagation(); }, { capture:true });
  hitbox.addEventListener("pointermove", e=>{
    if(e.pointerType === 'touch') return;
    const r = c.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top;
    const overImage = (mx >= ix && mx <= ix+iw && my >= iy && my <= iy+ih);
    hitbox.style.cursor = overImage ? "pointer" : "default";
  });

  function placeHitbox(){ hitbox.style.left = `${c.offsetLeft}px`; hitbox.style.top = `${c.offsetTop}px`; hitbox.style.width = `${c.offsetWidth}px`; hitbox.style.height = `${c.offsetHeight}px`; }
  const ro = new ResizeObserver(placeHitbox); ro.observe(c);
  window.addEventListener('resize', placeHitbox, { passive:true });
  window.addEventListener('orientationchange', placeHitbox, { passive:true });
  parent.addEventListener('scroll', placeHitbox, { passive:true });

  img.onload = ()=>{
    const ow = img.naturalWidth, oh = img.naturalHeight, nw = 600, sc = nw / ow, nh = Math.round(oh * sc);
    iw = nw; ih = nh; ix = Math.floor((W - iw) / 2); iy = 100; SV = Math.floor(ih * 0.334);
    setMode(mode); reset(true); requestAnimationFrame(loop); placeHitbox();
  };
  img.onerror = ()=>{ x.fillStyle="#1e1e1e"; x.fillRect(0,0,W,H); drawText("Chybí soubor obrazek.png", W/2, H/2-10, "#f88", 18, "center"); placeHitbox(); };

  window.saveScore = async function (difficulty, newScore) {
    const nick = getNick(); if (!nick) return;
    if (!["easy","medium","hard"].includes(difficulty)) return;
    if (typeof newScore !== "number" || !isFinite(newScore)) return;
    if (newScore > (bestLocal[difficulty] ?? 0)) {
      bestLocal[difficulty] = newScore; localStorage.setItem(LS, JSON.stringify(bestLocal));
      try { await sbUpsert({ device_id: DEVICE_ID, nick, difficulty, score: newScore }); } catch(e) { console.error("saveScore failed", e); }
    }
  };

  async function ensureAllDifficultiesUpsert(nick) {
    const localBest = { easy: bestLocal.easy, medium: bestLocal.medium, hard: bestLocal.hard };
    for (const d of ["easy","medium","hard"]) {
      const s = localBest[d] ?? 0;
      await sbUpsert({ device_id: DEVICE_ID, nick, difficulty: d, score: s });
    }
  }

  (async () => { const n = getNick(); if (n) { try { await ensureAllDifficultiesUpsert(n); } catch {} } })();

  const hitboxParent = c.parentElement ?? document.body;
  hitboxParent.appendChild(hitbox);
})();
