(() => {
    const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
    const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

    async function sbGet(path) {
        const r = await fetch(SUPABASE_URL + path, { 
            headers: { apikey: SUPABASE_ANON, Authorization: "Bearer " + SUPABASE_ANON } 
        });
        let body = null; try { body = await r.json(); } catch (_) {}
        if (!r.ok) throw body ?? { error: `HTTP ${r.status}` };
        return body;
    }

    async function sbGetWithMeta(path, opts = {}) {
        const r = await fetch(SUPABASE_URL + path, {
            headers: {
                apikey: SUPABASE_ANON,
                Authorization: "Bearer " + SUPABASE_ANON,
                ...(opts.headers ?? {})
            }
        });
        let body = null; try { body = await r.json(); } catch (_) {}
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
            headers: {
                apikey: SUPABASE_ANON,
                Authorization: "Bearer " + SUPABASE_ANON,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates"
            },
            body: JSON.stringify(row)
        });
        let body = null; try { body = await r.json(); } catch (_) {}
        if (!r.ok) throw body ?? { error: `HTTP ${r.status}` };
    }

    const DEVICE_KEY = "CasuaSlicerDeviceId";
    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = (crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : String(Date.now()) + Math.random().toString(36).slice(2);
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    }
    const DEVICE_ID = getDeviceId();

    const nickInput = document.getElementById("nick");
    const nickBtn = document.getElementById("saveNick");
    function getNick() { return localStorage.getItem("nick") ?? ""; }
    function setNick(v) { localStorage.setItem("nick", v); }
    function clearNick() { localStorage.removeItem("nick"); }

    if (nickInput) nickInput.value = getNick();
    if (nickBtn) {
        nickBtn.onclick = async () => {
            const n = (nickInput?.value ?? "").trim();
            if (!n) {
                try {
                    clearNick();
                    if (nickInput) nickInput.value = "";
                    await sbDeleteDeviceScores();
                    await renderLeaderboard();
                } catch (e) {}
                return;
            }
            try {
                setNick(n);
                await renameScoresForThisDevice(n);
                await ensureAllDifficultiesUpsert(n);
                await renderLeaderboard();
            } catch (e) {}
        };
    }

    const lbPanel = document.getElementById("lbPanel");

    function escapeHtml(v) {
        return String(v)
            .replaceAll("&", "&")
            .replaceAll("<", "<")
            .replaceAll(">", ">")
            .replaceAll('"', "\"")
            .replaceAll("'", "'");
    }

    // ========== CANVAS + HRA ==========

    const W = 700, H = 300;
    const c = document.getElementById("game");
    const x = c.getContext("2d");

    const img = new Image();
    img.src = "obrazek.png";

    // ===== HLAVA – NASTAVENÍ =====
    let headVisible = false;
    let headPending = false;
    let headTimer = null;
    let headAnim = 0;

    const HEAD_X_RATIO = 0.80;
    const HEAD_Y_RATIO = 0.66;
    const HEAD_SIZE = 50;
    const HEAD_SPEED = 0.05;

    const head = new Image();
    head.src = "head.png";

    const colors = [
        [0,255,255],[0,255,0],[255,255,0],[255,127,0],
        [255,0,0],[255,0,255],[127,0,255],[0,0,255]
    ];
    const modes = ["easy","medium","hard"];
    let mi = 0, mode = modes[0];

    const diff = {
        easy:   { tolerancePct:0.10, speed:1, acc:0.05 },
        medium: { tolerancePct:0.05, speed:2, acc:0.125 },
        hard:   { tolerancePct:0.025, speed:3, acc:0.25 }
    };

    let iw=0, ih=0, ix=0, iy=100;
    let SV=0, TOL=0, base=0, spd=0, co=0;
    let ly=iy, dir=1, cut=null, hit=false, score=0, first=true;

    function setMode(m){
        const d = diff[m];
        base = d.speed;
        spd  = base - d.acc;
        co   = base - 1;
        TOL  = Math.floor(ih * d.tolerancePct);
    }

    function reset(full=false){
        cut=null;
        hit=false;
        ly=iy;
        dir=1;

        headVisible=false;
        headPending=false;
        headAnim=0;

        if(full){
            score=0;
            first=true;
            spd = base - diff[mode].acc;
        }
    }

 function clamp(v,l,h){ return Math.max(l, Math.min(h, v)); }

    function drawText(t,xp,yp,col="#fff",s=18,a="left"){
        x.font = `${s}px system-ui,-apple-system,Segoe UI,Roboto,Arial`;
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
        if(cut === null){
            ly += spd * dir;
            if (ly <= iy){ ly=iy; dir=1; }
            if (ly >= iy+ih){ ly=iy+ih; dir=-1; }
        }
    }

    function render(){
        x.fillStyle="#1e1e1e";
        x.fillRect(0,0,W,H);

        if(cut === null){
            x.drawImage(img, ix, iy, iw, ih);
        } else {
            const srcH = img.naturalHeight;
            const scale = ih / srcH;
            const realCut = Math.round(cut / scale);

            x.drawImage(
                img,
                0, realCut,
                img.naturalWidth, srcH - realCut,
                ix, iy + cut,
                iw, ih - cut
            );
        }

        if(cut === null){
            const step = Math.trunc((spd - base) / 0.5);
            const idx = clamp(co + step, 0, colors.length - 1);
            drawLine(Math.round(ly), colors[idx], 2);
        }

        drawText(mode.toUpperCase(),10,10);
        drawText(`Score: ${score}`,W-10,10,"#fff",16,"right");
        drawText(`Best: ${bestLocal?.[mode] ?? 0}`,W-10,28,"#fff",16,"right");

        if(first)
            drawText("Stiskni mezerník nebo klikni na CASUA",W/2,10,"#fff",18,"center");
        else if(cut !== null)
            drawText(hit ? "PERFECT!" : "FAIL!",W/2,10,hit?"#0f0":"#f00",20,"center");

        // ===== ANIMACE HLAVY =====
        if (headVisible) {
            headAnim = Math.min(1, headAnim + HEAD_SPEED);
        } else {
            headAnim = Math.max(0, headAnim - HEAD_SPEED);
        }

        if (headAnim > 0 && head.complete) {
            const hx = ix + Math.floor(iw * HEAD_X_RATIO);
            const hy = iy + Math.floor(ih * HEAD_Y_RATIO);
            const hs = HEAD_SIZE * headAnim;

            x.drawImage(head, hx - hs/2, hy - hs/2, hs, hs);
        }
    }

    function loop(){ update(); render(); requestAnimationFrame(loop); }

    async function triggerSlice(){
        first = false;

        if(cut === null){
            let r = Math.round(ly - iy);
            r = clamp(r, 0, ih - 1);

            if (Math.abs(r - SV) <= TOL){
                hit = true;
                score++;
                spd += diff[mode].acc;
                r = SV;

                // ===== PERFECT – POČKAT 3s → PAK VYSUNOUT HLAVU =====
                headVisible = false;
                headPending = true;
                headAnim = 0;

                clearTimeout(headTimer);
                headTimer = setTimeout(() => {
                    if (headPending) headVisible = true;
                }, 3000);

            } else {
                hit = false;
                headVisible = false;
                headPending = false;
                headAnim = 0;

                const wasBetter = score > bestLocal[mode];
                if (wasBetter) saveBestLocal();
                if (wasBetter) await saveBestGlobal();

                spd = base - diff[mode].acc;
            }

            cut = r;

        } else {
            cut = null;
            if (!hit) score = 0;
            hit = false;
            ly = iy; 
            dir = 1;

            // ===== SCHOVÁNÍ HLAVY PŘI POKRAČOVÁNÍ =====
            headVisible = false;
            headPending = false;
            headAnim = 0;
        }
    }

    window.addEventListener("keydown", e => {
        if(e.code === "Space"){
            e.preventDefault();
            triggerSlice();
        }
    });

 function handle(mx, my){
        if(mx>=10 && mx<=140 && my>=10 && my<=40){
            mi = (mi+1) % modes.length;
            mode = modes[mi];
            setMode(mode);
            reset(true);
            return;
        }

        const rightWidth = 180, topHeight = 40;
        if(mx >= W-rightWidth && mx <= W && my >= 10 && my <= 10+topHeight){
            toggleLeaderboard();
            return;
        }

        if(mx >= ix && mx <= ix+iw && my >= iy && my <= iy+ih){
            triggerSlice();
        }
    }

    const hitbox = document.createElement("div");
    hitbox.className = "hitbox";

    const parent = c.parentElement ?? document.body;
    if(getComputedStyle(parent).position === "static")
        parent.style.position = "relative";

    parent.appendChild(hitbox);

    hitbox.addEventListener("pointerdown", e=>{
        e.preventDefault();
        const r = c.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (c.width / r.width);
        const my = (e.clientY - r.top)  * (c.height / r.height);
        handle(mx,my);
    });

    function placeHitbox(){
        hitbox.style.left   = `${c.offsetLeft}px`;
        hitbox.style.top    = `${c.offsetTop}px`;
        hitbox.style.width  = `${c.offsetWidth}px`;
        hitbox.style.height = `${c.offsetHeight}px`;
    }

    const ro = new ResizeObserver(placeHitbox);
    ro.observe(c);

    img.onload = () => {
        const ow = img.naturalWidth;
        const oh = img.naturalHeight;
        const nw = 600;
        const sc = nw / ow;
        const nh = Math.round(oh * sc);

        iw = nw;
        ih = nh;
        ix = Math.floor((W - iw) / 2);
        iy = 100;

        SV = Math.floor(ih * 0.334);
        setMode(mode);
        reset(true);

        requestAnimationFrame(loop);
        placeHitbox();
    };

    img.onerror = ()=>{
        x.fillStyle="#1e1e1e";
        x.fillRect(0,0,W,H);
        drawText("Chybí soubor obrazek.png",W/2,H/2-10,"#f88",18,"center");
        placeHitbox();
    };

})();
