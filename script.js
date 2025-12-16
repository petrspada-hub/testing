
(() => {
  "use strict";

  /* =========================
     KONFIGURACE SUPABASE
     ========================= */
  const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_n9N-pUl_fZpIFm9BccU7zQ_0ZPpLNsv";

  /* =========================
     IDENTITA HRÁČE (UID + NICK)
     ========================= */
  const UID_LS = "CasuaSlicerUID";
  const NICK_LS = "CasuaSlicerNick";

  function ensureUID() {
    let uid = localStorage.getItem(UID_LS);
    if (!uid) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      uid = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
      // formát uuid v4 (pro vzhled)
      uid = `${uid.slice(0,8)}-${uid.slice(8,12)}-${uid.slice(12,16)}-${uid.slice(16,20)}-${uid.slice(20)}`;
      localStorage.setItem(UID_LS, uid);
    }
    return uid;
  }
  const UID = ensureUID();

  function getNick() {
    const el = document.getElementById("nick");
    const fromInput = (el?.value ?? "").trim();
    if (fromInput) {
      localStorage.setItem(NICK_LS, fromInput);
      return fromInput;
    }
    const saved = localStorage.getItem(NICK_LS) ?? "";
    if (el && !el.value) el.value = saved;
    return saved;
  }

  /* =========================
     POMOCNÉ FUNKCE (PostgREST)
     ========================= */
  async function sbPost(path, body, headers = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        ...headers
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function sbPatch(path, body) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  /* =========================
     HRA (plátno a logika)
     ========================= */
  const W = 700, H = 300;
  const c = document.getElementById("game");
  const x = c.getContext("2d");

  const img = new Image();
  img.src = "obrazek.png";

  const colors = [
    [0,255,255],[0,255,0],[255,255,0],[255,127,0],
    [255,0,0],[255,0,255],[127,0,255],[0,0,255]
  ];
  const modes = ["easy","medium","hard"];
  let mi = 0, mode = modes[mi];

  const diff = {
    easy:   { tolerancePct: 0.10, speed: 1, acc: 0.05 },
    medium: { tolerancePct: 0.05, speed: 2, acc: 0.125 },
    hard:   { tolerancePct: 0.025, speed: 3, acc: 0.25 }
  };

  const LS = "CasuaSlicerBest";
  let best = { easy:0, medium:0, hard:0 };
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    if (s && typeof s === "object") best = { ...best, ...s };
  } catch {}

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

  function clamp(v,l,h){ return Math.max(l, Math.min(h, v)); }

  function drawText(t,xp,yp,col="#fff",s=18,a="left"){
    x.font = `${s}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
    x.textBaseline = "top"; x.textAlign = a; x.fillStyle = col; x.fillText(t,xp,yp);
  }

  function drawLine(y,col,w=2){
    x.strokeStyle=`rgb(${col[0]},${col[1]},${col[2]})`; x.lineWidth=w;
    x.beginPath(); x.moveTo(ix,y); x.lineTo(ix+iw,y); x.stroke();
  }

  function update(){
    if(cut===null){
      ly += spd * dir;
      if(ly <= iy){ ly = iy; dir = 1; }
      if(ly >= iy+ih){ ly = iy+ih; dir = -1; }
    }
  }

  function render(){
    x.fillStyle = "#1e1e1e"; x.fillRect(0,0,W,H);

    if(cut === null){
      x.drawImage(img, ix, iy, iw, ih);
    } else {
      const srcH = img.naturalHeight;
      const scale = ih / srcH;
      const realCut = Math.round(cut / scale);
      x.drawImage(img, 0, realCut, img.naturalWidth, srcH - realCut, ix, iy + cut, iw, ih - cut);
    }

    if(cut === null){
      const step = Math.trunc((spd - base) / 0.5);
      const idx = clamp(co + step, 0, colors.length - 1);
      drawLine(Math.round(ly), colors[idx], 2);
    }

    drawText(mode.toUpperCase(),10,10,"#fff",16,"left");
    drawText(`Score: ${score}`,W-10,10,"#fff",16,"right");
    drawText(`Best: ${best[mode]}`,W-10,28,"#fff",16,"right");

    if(first){ drawText("Stiskni mezerník",W/2,10,"#fff",18,"center"); }
    else if(cut !== null){ drawText(hit ? "PERFECT!" : "FAIL!", W/2,10, hit?"#0f0":"#f00",20,"center"); }
  }

  function loop(){ update(); render(); requestAnimationFrame(loop); }

  window.addEventListener("keydown", e=>{
    if(e.code==="Space"){
      first=false;
      if(cut===null){
        let r = Math.round(ly - iy);
        r = clamp(r, 0, ih - 1);
        if(Math.abs(r - SV) <= TOL){
          hit=true; score++; spd += diff[mode].acc; r = SV;
        } else {
          hit=false; saveBest(); spd = base - diff[mode].acc;
        }
        cut = r;
      } else {
        cut = null;
        if(!hit) score = 0;
        hit=false; ly=iy; dir=1;
      }
    }
  });

  c.addEventListener("mousedown", e=>{
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    // klik na oblast režimu vlevo nahoře (10..140, 10..40)
    if(mx>=10 && mx<=140 && my>=10 && my<=40){
      saveBest();
      mi = (mi+1) % modes.length; mode = modes[mi];
      setMode(mode); reset(true);
    }
  });

  img.onload = ()=>{
    const ow = img.naturalWidth, oh = img.naturalHeight;
    const nw = 600, sc = nw / ow, nh = Math.round(oh * sc);
    iw = nw; ih = nh; ix = Math.floor((W - iw) / 2); iy = 100;
    SV = Math.floor(ih * 0.334);
    setMode(mode); reset(true);
    requestAnimationFrame(loop);
  };

  img.onerror = ()=>{
    x.fillStyle="#1e1e1e"; x.fillRect(0,0,W,H);
    drawText("Chybí soubor obrazek.png",W/2,H/2-10,"#f88",18,"center");
  };

  /* =========================
     ODESLÁNÍ BEST DO SUPABASE
     ========================= */
  async function sendBestIfImproved(nick, difficulty, scoreVal) {
    if (!nick) return;
    try {
      await sbPost(`/rest/v1/scores`, { uid: UID, nick, difficulty, score: scoreVal }, { "Prefer":"return=representation" });
    } catch(e) { console.error("sendBestIfImproved:", e); }
  }

  function saveBest(){
    if(score > best[mode]){
      best[mode] = score;
      localStorage.setItem(LS, JSON.stringify(best));
      const nick = getNick();
      sendBestIfImproved(nick, mode, best[mode]);
    }
  }

  /* =========================
     ŽEBŘÍČEK (TOP3 + moje BEST)
     ========================= */
  function escapeHtml(s){
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
    return String(s).replace(/[&<>"']/g, c => map[c]);
  }

  // stáhneme top řádky a na klientu je zjednodušíme na unikátní UID
  async function fetchTop3(difficulty) {
    const q = `/rest/v1/scores?difficulty=eq.${difficulty}&select=uid,nick,score&order=score.desc&limit=100`;
    const rows = await sbGet(q);
    const byUid = new Map();
    for (const r of rows) {
      if (!byUid.has(r.uid)) byUid.set(r.uid, r); // první výskyt = nejvyšší score díky order=desc
    }
    return Array.from(byUid.values()).slice(0,3);
  }

  async function fetchMyBest(difficulty) {
    const q = `/rest/v1/scores?uid=eq.${UID}&difficulty=eq.${difficulty}&select=score&order=score.desc&limit=1`;
    const d = await sbGet(q);
    return d[0]?.score ?? null;
  }

  async function updateNickEverywhere(newNick) {
    // přepíše nick u všech záznamů daného UID (skóre zůstávají)
    return sbPatch(`/rest/v1/scores?uid=eq.${UID}`, { nick:newNick });
  }

  function renderList(listEl, rows) {
    listEl.innerHTML = rows.length
      ? rows.map(r => `<li>${escapeHtml(r.nick)} — ${r.score}</li>`).join("")
      : "<li>—</li>";
  }

  function renderMe(meEl, top3Rows, myBest) {
    const iAmInTop3 = top3Rows.some(r => r.uid === UID);
    if (iAmInTop3) meEl.textContent = "";
    else meEl.textContent = (myBest ?? "—");
  }

  async function renderLeaderboard() {
    try {
      const [tEasy, tMed, tHard] = await Promise.all([ fetchTop3("easy"), fetchTop3("medium"), fetchTop3("hard") ]);
      const [mEasy, mMed, mHard] = await Promise.all([ fetchMyBest("easy"), fetchMyBest("medium"), fetchMyBest("hard") ]);
      renderList(document.getElementById("lb-easy"),   tEasy);
      renderList(document.getElementById("lb-medium"), tMed);
      renderList(document.getElementById("lb-hard"),   tHard);
      renderMe(document.getElementById("me-easy"),   tEasy, mEasy);
      renderMe(document.getElementById("me-medium"), tMed,  mMed);
      renderMe(document.getElementById("me-hard"),   tHard, mHard);
    } catch(e) { console.error("renderLeaderboard:", e); }
  }

  /* =========================
     TOGGLE PANELU ŽEBŘÍČKU
     ========================= */
  function toggleLeaderboard(show=null) {
    const panel = document.getElementById("lbPanel");
    const btn = document.getElementById("lbToggle");
    const willShow = show ?? panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !willShow);
    panel.setAttribute("aria-hidden", (!willShow).toString());
    btn?.setAttribute("aria-expanded", willShow.toString());
    if (willShow) { getNick(); renderLeaderboard(); }
  }

  // Události panelu
  document.getElementById("lbToggle")?.addEventListener("click", () => toggleLeaderboard());
  document.getElementById("saveNick")?.addEventListener("click", async () => {
    const n = getNick();
    if (!n) { alert("Zadej jméno (nick)."); return; }
    try { await updateNickEverywhere(n); await renderLeaderboard(); }
    catch(e){ console.error(e); alert("Nepodařilo se uložit jméno."); }
  });
})();
``
