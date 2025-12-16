(() => {
  "use strict";

  /* =========================
     SUPABASE
     ========================= */
  const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxamZ3Y3NydWdvcG1vdHR3bXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTMyMjIsImV4cCI6MjA4MTQyOTIyMn0.OztHP1F8II2zSKJb1biDqKs1xvO6Z8rWYsI2WSK8St8";

  async function sbGet(path) {
    const r = await fetch(`${SUPABASE_URL}${path}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function sbUpsertScore(row) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/scores?on_conflict=vscore,difficulty`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(row)
      }
    );
  }

  /* =========================
     IDENTITA
     ========================= */
  const UID_LS = "CasuaSlicerUID";
  const NICK_LS = "CasuaSlicerNick";

  function ensureUID() {
    let id = localStorage.getItem(UID_LS);
    if (!id) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(UID_LS, id);
    }
    return id;
  }
  const VSCORE = ensureUID();

  function getNick() {
    const el = document.getElementById("nick");
    const v = (el?.value ?? "").trim();
    if (v) {
      localStorage.setItem(NICK_LS, v);
      return v;
    }
    const s = localStorage.getItem(NICK_LS) ?? "";
    if (el && !el.value) el.value = s;
    return s;
  }

  /* =========================
     HRA
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
    easy:{tolerancePct:0.10,speed:1,acc:0.05},
    medium:{tolerancePct:0.05,speed:2,acc:0.125},
    hard:{tolerancePct:0.025,speed:3,acc:0.25}
  };

  const LS = "CasuaSlicerBest";
  let best = { easy:0, medium:0, hard:0 };
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    if (s) best = {...best, ...s};
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
    cut=null; hit=false; ly=iy; dir=1;
    if(full){
      score=0; first=true;
      spd = base - diff[mode].acc;
    }
  }

  function saveBest(){
    if(score > best[mode]){
      best[mode] = score;
      localStorage.setItem(LS, JSON.stringify(best));
      const nick = getNick();
      if (nick) {
        sbUpsertScore({
          vscore: VSCORE,
          nick,
          difficulty: mode,
          score: best[mode]
        }).catch(console.error);
      }
    }
  }

  function clamp(v,l,h){ return Math.max(l, Math.min(h, v)); }

  function drawText(t,xp,yp,col="#fff",s=18,a="left"){
    x.font = `${s}px system-ui`;
    x.textBaseline="top";
    x.textAlign=a;
    x.fillStyle=col;
    x.fillText(t,xp,yp);
  }

  function drawLine(y,col,w=2){
    x.strokeStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    x.lineWidth=w;
    x.beginPath();
    x.moveTo(ix,y);
    x.lineTo(ix+iw,y);
    x.stroke();
  }

  function update(){
    if(cut===null){
      ly += spd * dir;
      if(ly<=iy){ ly=iy; dir=1; }
      if(ly>=iy+ih){ ly=iy+ih; dir=-1; }
    }
  }

  function render(){
    x.fillStyle="#1e1e1e";
    x.fillRect(0,0,W,H);

    if(cut===null){
      x.drawImage(img,ix,iy,iw,ih);
    } else {
      const sc = ih / img.naturalHeight;
      const rc = Math.round(cut / sc);
      x.drawImage(
        img,0,rc,img.naturalWidth,img.naturalHeight-rc,
        ix,iy+cut,iw,ih-cut
      );
    }

    if(cut===null){
      const step = Math.trunc((spd-base)/0.5);
      const idx = clamp(co+step,0,colors.length-1);
      drawLine(Math.round(ly),colors[idx],2);
    }

    drawText(mode.toUpperCase(),10,10);
    drawText(`Score: ${score}`,W-10,10,"#fff",16,"right");
    drawText(`Best: ${best[mode]}`,W-10,28,"#fff",16,"right");

    if(first) drawText("Stiskni mezerník",W/2,10,"#fff",18,"center");
    else if(cut!==null)
      drawText(hit?"PERFECT!":"FAIL!",W/2,10,hit?"#0f0":"#f00",20,"center");
  }

  function loop(){ update(); render(); requestAnimationFrame(loop); }

  window.addEventListener("keydown",e=>{
    if(e.code==="Space"){
      first=false;
      if(cut===null){
        let r = clamp(Math.round(ly-iy),0,ih-1);
        if(Math.abs(r-SV)<=TOL){
          hit=true; score++; spd+=diff[mode].acc; r=SV;
        } else {
          hit=false; saveBest(); spd=base-diff[mode].acc;
        }
        cut=r;
      } else {
        cut=null;
        if(!hit) score=0;
        hit=false; ly=iy; dir=1;
      }
    }
  });

  c.addEventListener("mousedown",e=>{
    const r=c.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    if(mx>=10&&mx<=140&&my>=10&&my<=40){
      saveBest();
      mi=(mi+1)%modes.length;
      mode=modes[mi];
      setMode(mode);
      reset(true);
    }
  });

  img.onload=()=>{
    const sc=600/img.naturalWidth;
    iw=600; ih=Math.round(img.naturalHeight*sc);
    ix=(W-iw)>>1; iy=100;
    SV=Math.floor(ih*0.334);
    setMode(mode);
    reset(true);
    requestAnimationFrame(loop);
  };

  /* =========================
     LEADERBOARD
     ========================= */
  async function fetchTop3(d) {
    return sbGet(
      `/rest/v1/scores?difficulty=eq.${d}` +
      `&select=nick,score&order=score.desc&limit=3`
    );
  }

  async function fetchMyBest(d) {
    const r = await sbGet(
      `/rest/v1/scores?vscore=eq.${VSCORE}&difficulty=eq.${d}` +
      `&select=score&limit=1`
    );
    return r[0]?.score ?? "—";
  }

  function renderList(el, rows) {
    el.innerHTML = rows.length
      ? rows.map(r => `<li>${r.nick} — ${r.score}</li>`).join("")
      : "<li>—</li>";
  }

  async function renderLeaderboard() {
    renderList(document.getElementById("lb-easy"),   await fetchTop3("easy"));
    renderList(document.getElementById("lb-medium"), await fetchTop3("medium"));
    renderList(document.getElementById("lb-hard"),   await fetchTop3("hard"));

    document.getElementById("me-easy").textContent   = await fetchMyBest("easy");
    document.getElementById("me-medium").textContent = await fetchMyBest("medium");
    document.getElementById("me-hard").textContent   = await fetchMyBest("hard");
  }

  function toggleLeaderboard() {
    const p = document.getElementById("lbPanel");
    p.classList.toggle("hidden");
    if (!p.classList.contains("hidden")) {
      getNick();
      renderLeaderboard();
    }
  }

  document.getElementById("lbToggle")
    ?.addEventListener("click", toggleLeaderboard);

})();
