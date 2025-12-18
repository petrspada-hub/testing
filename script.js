(() => {
  /* =========================
     SUPABASE
     ========================= */

  const SUPABASE_URL = "https://wqjfwcsrugopmottwmtl.supabase.co";
  const SUPABASE_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxamZ3Y3NydWdvcG1vdHR3bXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NTMyMjIsImV4cCI6MjA4MTQyOTIyMn0.OztHP1F8II2zSKJb1biDqKs1xvO6Z8rWYsI2WSK8St8";

  async function sbGet(path) {
    const r = await fetch(SUPABASE_URL + path, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: "Bearer " + SUPABASE_ANON
      }
    });
    if (!r.ok) throw await r.json();
    return r.json();
  }

  async function sbUpsert(row) {
    const r = await fetch(
      SUPABASE_URL + "/rest/v1/scores?on_conflict=nick,difficulty",
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: "Bearer " + SUPABASE_ANON,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify(row)
      }
    );
    if (!r.ok) throw await r.json();
  }

  /* =========================
     NICK
     ========================= */

  const nickInput = document.getElementById("nickInput");
  const nickBtn = document.getElementById("nickSave");

  function getNick() {
    return localStorage.getItem("nick") || "";
  }

  function setNick(nick) {
    localStorage.setItem("nick", nick);
  }

  nickInput.value = getNick();

  nickBtn.onclick = () => {
    const n = nickInput.value.trim();
    if (n) setNick(n);
  };

  /* =========================
     GAME DATA (napoj si na hru)
     ========================= */

  const best = {
    easy: 0,
    medium: 0,
    hard: 0
  };

  window.saveScore = async function (difficulty, score) {
    const nick = getNick();
    if (!nick) return;

    if (score <= best[difficulty]) return;
    best[difficulty] = score;

    await sbUpsert({
      nick,
      difficulty,
      score
    });
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
      `/rest/v1/scores?nick=eq.${nick}&difficulty=eq.${diff}&select=score&limit=1`
    );
    return r[0]?.score ?? "—";
  }

  function renderList(el, rows) {
    el.innerHTML = rows.length
      ? rows.map(r => `<li>${r.nick} — ${r.score}</li>`).join("")
      : "<li>—</li>";
  }

  async function renderLeaderboard() {
    renderList(document.getElementById("lb-easy"),   await fetchTop("easy"));
    renderList(document.getElementById("lb-medium"), await fetchTop("medium"));
    renderList(document.getElementById("lb-hard"),   await fetchTop("hard"));

    document.getElementById("me-easy").textContent   = await fetchMyBest("easy");
    document.getElementById("me-medium").textContent = await fetchMyBest("medium");
    document.getElementById("me-hard").textContent   = await fetchMyBest("hard");
  }

  const lbBtn = document.getElementById("lbToggle");
  const lbPanel = document.getElementById("lbPanel");

  lbBtn.onclick = () => {
    lbPanel.classList.toggle("hidden");
    if (!lbPanel.classList.contains("hidden")) {
      renderLeaderboard();
    }
  };

})();
