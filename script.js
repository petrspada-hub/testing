
(() => {
  /* =========================
     SUPABASE
     ========================= */

  const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxamZ3Y3NydWdvcG1vdHR3bXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTMyMjIsImV4cCI6MjA4MTQyOTIyMn0.OztHP1F8II2zSKJb1biDqKs1xvO6Z8rWYsI2WSK8St8";

  async function sbGet(path) {
    const url = SUPABASE_URL + path;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: "Bearer " + SUPABASE_ANON
      }
    });
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) {
      console.error("Supabase GET error:", r.status, url, body);
      throw body || { error: `HTTP ${r.status}` };
    }
    return body;
  }

  async function sbUpsert(row) {
    const url = SUPABASE_URL + "/rest/v1/scores?on_conflict=nick,difficulty";
    const r = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: "Bearer " + SUPABASE_ANON,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(row)
    });
    let body = null;
    try { body = await r.json(); } catch (_) {}
    if (!r.ok) {
      console.error("Supabase UPSERT error:", r.status, url, body);
      throw body || { error: `HTTP ${r.status}` };
    }
  }

  /* =========================
     NICK
     ========================= */

  const nickInput = document.getElementById("nick");
  const nickBtn = document.getElementById("saveNick");

  function getNick() {
    return localStorage.getItem("nick") || "";
  }

  function setNick(nick) {
    localStorage.setItem("nick", nick);
  }

  // Inicializace pole
  nickInput.value = getNick();

  // Uložení nicku
  nickBtn.onclick = () => {
    const n = nickInput.value.trim();
    if (!n) return;
    setNick(n);
  };

  /* =========================
     GAME DATA (napoj si na hru)
     ========================= */

  // Lokální besty pro filtr duplicit
  const best = {
    easy: 0,
    medium: 0,
    hard: 0
  };

  // Tuto funkci volejte z vaší hry po dohrání levelu:
  // window.saveScore("easy"|"medium"|"hard", number)
  window.saveScore = async function (difficulty, score) {
    try {
      const nick = getNick();
      if (!nick) {
        console.warn("Score neuložen – není nastaven nick.");
        return;
      }

      if (!["easy", "medium", "hard"].includes(difficulty)) {
        console.warn("Neplatná obtížnost:", difficulty);
        return;
      }

      if (typeof score !== "number" || !isFinite(score)) {
        console.warn("Neplatné skóre:", score);
        return;
      }

      // Jen když je lepší než lokální best
      if (score <= best[difficulty]) return;
      best[difficulty] = score;

      await sbUpsert({ nick, difficulty, score });
      // Po uložení můžete případně refreshnout leaderboard:
      // await renderLeaderboard();
    } catch (e) {
      console.error("Ukládání skóre selhalo:", e);
    }
  };

  /* =========================
     LEADERBOARD
     ========================= */

  async function fetchTop(diff) {
    return sbGet(
      `/rest/v1/scores?difficulty=eq.${diff}` +
      `&select=nick,score&order=score.desc&limit=3`
    );
  }

  async function fetchMyBest(diff) {
    const nick = getNick();
    if (!nick) return "—";

    const r = await sbGet(
      `/rest/v1/scores?nick=eq.${nick}&difficulty=eq.${diff}` +
      `&select=score&order=score.desc&limit=1`
    );
    return r[0]?.score ?? "—";
  }

  function renderList(el, rows) {
    el.innerHTML = rows.length
      ? rows.map(r => `<li>${escapeHtml(r.nick)} — ${escapeHtml(r.score)}</li>`).join("")
      : "<li>—</li>";
  }

  // Jednoduchý escape pro bezpečné vykreslení
  function escapeHtml(v) {
    return String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function renderLeaderboard() {
    try {
      const [topE, topM, topH] = await Promise.all([
        fetchTop("easy"),
        fetchTop("medium"),
        fetchTop("hard")
      ]);

      renderList(document.getElementById("lb-easy"),   topE);
      renderList(document.getElementById("lb-medium"), topM);
      renderList(document.getElementById("lb-hard"),   topH);

      const [meE, meM, meH] = await Promise.all([
        fetchMyBest("easy"),
        fetchMyBest("medium"),
        fetchMyBest("hard")
      ]);

      document.getElementById("me-easy").textContent   = meE;
      document.getElementById("me-medium").textContent = meM;
      document.getElementById("me-hard").textContent   = meH;
    } catch (e) {
      console.error("Render leaderboard selhal:", e);
      // Zobrazit placeholdery, ať UI není prázdné
      renderList(document.getElementById("lb-easy"),   []);
      renderList(document.getElementById("lb-medium"), []);
      renderList(document.getElementById("lb-hard"),   []);
      document.getElementById("me-easy").textContent   = "—";
      document.getElementById("me-medium").textContent = "—";
      document.getElementById("me-hard").textContent   = "—";
    }
  }

  const lbBtn   = document.getElementById("lbToggle");
  const lbPanel = document.getElementById("lbPanel");

  lbBtn.onclick = () => {
    const nowHidden = lbPanel.classList.toggle("hidden");
    // ARIA pro přístupnost
    lbBtn.setAttribute("aria-expanded", (!nowHidden).toString());
    lbPanel.setAttribute("aria-hidden", nowHidden.toString());
    if (!nowHidden) renderLeaderboard();
  };

  /* =========================
     (Volitelné) základ hry
     ========================= */

  // Pokud zatím nemáte napojené, zde je skeleton pro canvas,
  // ať stránka nepůsobí prázdně.
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#888";
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText("Hra běží zde. Po dokončení levelu zavolejte window.saveScore(difficulty, score).", 14, 24);

})();
``
