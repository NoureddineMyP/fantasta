
const AuctionApp = (() => {
  let players = [];
  let teams = [];
  let settings = {};
  let selectedPlayer = null;
  let state = {
    currentTeamId: null,
    purchases: [],
    bids: []
  };

  const $ = id => document.getElementById(id);
  const roleNames = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };

  function esc(v) {
    return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function money(v) { return Number(v || 0).toLocaleString("it-IT"); }
  function num(v) { return Number(v || 0); }

  async function load() {
    const [p,t,s] = await Promise.all([
      fetch("./data/players.json").then(r => r.json()),
      fetch("./data/teams.json").then(r => r.json()),
      fetch("./data/settings.json").then(r => r.json())
    ]);
    players = p;
    teams = t;
    settings = s;
    state.currentTeamId = teams[0]?.id || null;
    renderTeamSelect();
    renderStats();
    renderRecent();
    bind();
  }

  function renderTeamSelect() {
    $("buyerTeam").innerHTML = teams.map(t =>
      `<option value="${esc(t.id)}">${esc(t.name)} · ${money(t.credits)} cr</option>`
    ).join("");
    $("buyerTeam").value = state.currentTeamId;
  }

  function availablePlayers() {
    const bought = new Set(state.purchases.map(x => x.playerId));
    return players.filter(p => !bought.has(p.id) && !p.out_of_list);
  }

  function searchPlayers(q) {
    const query = q.trim().toLowerCase();
    return availablePlayers()
      .filter(p => !query || p.name.toLowerCase().includes(query) || p.team.toLowerCase().includes(query))
      .slice(0, 20);
  }

  function showSuggestions() {
    const q = $("playerSearch").value;
    const list = $("playerSuggestions");
    const results = searchPlayers(q);
    if (!q.trim()) {
      list.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    list.innerHTML = results.length ? results.map(p => `
      <button type="button" data-player="${esc(p.id)}"
        class="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50">
        <div class="flex items-center justify-between gap-3">
          <div><b>${esc(p.name)}</b><div class="text-xs text-slate-500">${esc(p.team)} · ${roleNames[p.role]}</div></div>
          <span class="text-xs font-semibold text-slate-500">FM ${num(p.fm).toFixed(2)} · Q ${money(p.quot)}</span>
        </div>
      </button>`).join("") : `<div class="px-4 py-3 text-sm text-slate-500">Nessun giocatore disponibile</div>`;
    list.classList.remove("hidden");
    list.querySelectorAll("[data-player]").forEach(b => b.addEventListener("click", () => selectPlayer(b.dataset.player)));
  }

  function selectPlayer(id) {
    selectedPlayer = availablePlayers().find(p => p.id === id) || null;
    $("playerSuggestions").classList.add("hidden");
    $("playerSearch").value = selectedPlayer ? selectedPlayer.name : "";
    renderPlayer();
  }

  function renderPlayer() {
    const box = $("selectedPlayer");
    if (!selectedPlayer) {
      box.innerHTML = `<div class="text-sm text-slate-500">Nessun giocatore selezionato.</div>`;
      return;
    }
    const recommendations = getRecommendations(selectedPlayer);
    box.innerHTML = `
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">${esc(selectedPlayer.role)}</span>
            <span class="text-xs font-semibold text-slate-500">${esc(selectedPlayer.team)}</span>
          </div>
          <h2 class="mt-2 text-2xl font-black">${esc(selectedPlayer.name)}</h2>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="rounded-xl bg-slate-50 px-3 py-2"><b>${num(selectedPlayer.mv).toFixed(2)}</b><div class="text-[10px] text-slate-400">MV</div></div>
          <div class="rounded-xl bg-slate-50 px-3 py-2"><b>${num(selectedPlayer.fm).toFixed(2)}</b><div class="text-[10px] text-slate-400">FM</div></div>
          <div class="rounded-xl bg-slate-50 px-3 py-2"><b>${money(selectedPlayer.quot)}</b><div class="text-[10px] text-slate-400">QUOT</div></div>
        </div>
      </div>
      ${recommendations.length ? `
      <div class="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
        <div class="text-sm font-black text-indigo-900">💡 Assistente asta</div>
        <p class="mt-1 text-xs text-indigo-700">Alternative/coppie utili da valutare con ${esc(selectedPlayer.name)}.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          ${recommendations.map(p => `<span class="rounded-full bg-white px-3 py-2 text-xs font-semibold text-indigo-900 shadow-sm">${esc(p.name)} · ${esc(p.team)} · Q ${money(p.quot)}</span>`).join("")}
        </div>
      </div>` : ""}
    `;
  }

  function getRecommendations(player) {
    const avail = availablePlayers().filter(p => p.id !== player.id);
    if (player.role === "P") {
      // Goalkeeper coverage: prioritize teammates first, then similar budget/role profiles.
      const sameTeam = avail.filter(p => p.role === "P" && p.team === player.team);
      if (sameTeam.length) return sameTeam.slice(0, 4);
      return avail.filter(p => p.role === "P")
        .sort((a,b) => Math.abs(num(a.quot)-num(player.quot)) - Math.abs(num(b.quot)-num(player.quot)))
        .slice(0, 4);
    }
    // For outfield players, suggest same-team alternatives first, then similar role/value.
    const sameTeam = avail.filter(p => p.role === player.role && p.team === player.team);
    if (sameTeam.length) return sameTeam.slice(0, 3);
    return avail.filter(p => p.role === player.role)
      .sort((a,b) => Math.abs(num(a.fvm)-num(player.fvm)) - Math.abs(num(b.fvm)-num(player.fvm)))
      .slice(0, 3);
  }

  function currentTeam() {
    return teams.find(t => t.id === $("buyerTeam").value);
  }

  
function teamRoster(teamId) {
  return state.purchases.filter(x => x.teamId === teamId);
}

function roleCount(teamId, role) {
  return teamRoster(teamId).filter(x => x.playerRole === role).length;
}

function roleTarget(role) {
  return { P: 3, D: 8, C: 8, A: 6 }[role] || 0;
}

function remainingSlots(teamId, role) {
  return Math.max(0, roleTarget(role) - roleCount(teamId, role));
}

function estimateMaxBid(player, team) {
  const credits = num(team.credits);
  const targets = { P: 3, D: 8, C: 8, A: 6 };
  const rosterSize = teamRoster(team.id).length;
  const totalSlots = Object.values(targets).reduce((a, b) => a + b, 0);
  const openSlots = Math.max(1, totalSlots - rosterSize);
  const reserve = Math.max(openSlots - 1, 0);
  const spendable = Math.max(1, credits - reserve);

  const roleWeights = { P: 0.10, D: 0.18, C: 0.22, A: 0.38 };
  const roleWeight = roleWeights[player.role] || 0.15;
  const quot = Math.max(1, num(player.quot));
  const fvm = num(player.fvm);
  const fm = num(player.fm);

  const quality = Math.max(
    0.55,
    Math.min(1.55, (fvm / quot) * 0.55 + Math.max(0, fm - 4.5) * 0.10)
  );

  const roleNeed = remainingSlots(team.id, player.role);
  const urgency = roleNeed <= 1 ? 0.85 : roleNeed >= 4 ? 1.08 : 1.0;

  const raw = spendable * roleWeight * quality * urgency;
  return Math.max(
    1,
    Math.min(Math.floor(credits - reserve), Math.round(raw))
  );
}

function bidVerdict(player, price, team) {
  const max = estimateMaxBid(player, team);

  if (price <= max * 0.65) {
    return {
      color: "emerald",
      label: "OTTIMO",
      text: `Prezzo molto interessante: sei ben sotto il tetto consigliato di ${money(max)} crediti.`
    };
  }

  if (price <= max) {
    return {
      color: "sky",
      label: "BUONO",
      text: `Sei dentro il budget consigliato: tetto ${money(max)} crediti.`
    };
  }

  if (price <= max * 1.25) {
    return {
      color: "amber",
      label: "ALTO",
      text: `Stai pagando sopra il tetto consigliato (${money(max)}). Valuta le alternative.`
    };
  }

  return {
    color: "red",
    label: "STOP",
    text: `Prezzo molto alto: supera il tetto consigliato di ${money(max)}. Meglio conservare crediti.`
  };
}

function renderBidAdvice() {
  const box = $("bidAdvice");
  if (!box) return;

  if (!selectedPlayer) {
    box.innerHTML = `<div class="text-sm text-slate-500">Seleziona un giocatore per ottenere il prezzo massimo consigliato.</div>`;
    return;
  }

  const team = currentTeam();
  if (!team) return;

  const price = Math.floor(num($("purchasePrice").value));
  const max = estimateMaxBid(selectedPlayer, team);
  const verdict = price > 0 ? bidVerdict(selectedPlayer, price, team) : null;
  const need = remainingSlots(team.id, selectedPlayer.role);

  const verdictClasses = {
    emerald: "bg-emerald-100 text-emerald-800",
    sky: "bg-sky-100 text-sky-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800"
  };

  const textClasses = {
    emerald: "text-emerald-900",
    sky: "text-sky-900",
    amber: "text-amber-900",
    red: "text-red-900"
  };

  const verdictHtml = verdict
    ? `<div>
        <span class="rounded-full ${verdictClasses[verdict.color]} px-3 py-1 text-xs font-black">${verdict.label}</span>
        <p class="mt-2 text-sm font-semibold ${textClasses[verdict.color]}">${verdict.text}</p>
      </div>`
    : `<p class="text-sm text-slate-600">Inserisci una cifra per ricevere il giudizio in tempo reale.</p>`;

  box.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-xs font-bold uppercase tracking-wide text-slate-400">Assistente budget</div>
        <div class="mt-1 text-2xl font-black">${money(max)} cr</div>
        <div class="text-xs text-slate-500">tetto consigliato per ${esc(selectedPlayer.name)}</div>
      </div>
      ${verdictHtml}
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rounded-xl bg-white p-3">
        <div class="text-xs text-slate-400">Crediti</div>
        <b>${money(team.credits)}</b>
      </div>
      <div class="rounded-xl bg-white p-3">
        <div class="text-xs text-slate-400">Slot ${esc(selectedPlayer.role)}</div>
        <b>${need}</b>
      </div>
      <div class="rounded-xl bg-white p-3">
        <div class="text-xs text-slate-400">QUOT</div>
        <b>${money(selectedPlayer.quot)}</b>
      </div>
      <div class="rounded-xl bg-white p-3">
        <div class="text-xs text-slate-400">FM</div>
        <b>${num(selectedPlayer.fm).toFixed(2)}</b>
      </div>
    </div>
  `;
}

function renderStats() {
  renderBidAdvice();
    const totalSpent = state.purchases.reduce((s,p) => s + num(p.price), 0);
    $("availableCount").textContent = money(availablePlayers().length);
    $("purchaseCount").textContent = money(state.purchases.length);
    $("spentCount").textContent = money(totalSpent);
    $("teamCredits").textContent = money(currentTeam()?.credits ?? 0);
    renderSquads();
  }

  function renderSquads() {
    $("squads").innerHTML = teams.map(t => {
      const roster = state.purchases.filter(p => p.teamId === t.id);
      return `
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex justify-between gap-3">
            <div class="font-bold">${esc(t.name)}</div>
            <div class="font-black">${money(t.credits)} cr</div>
          </div>
          <div class="mt-2 text-xs text-slate-500">${roster.length} acquisti</div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            ${roster.slice(-8).map(x => `<span class="rounded-full bg-slate-100 px-2 py-1 text-xs">${esc(x.playerName)} · ${x.price}</span>`).join("") || '<span class="text-xs text-slate-400">Nessun acquisto</span>'}
          </div>
        </div>`;
    }).join("");
  }

  function renderRecent() {
    $("recentPurchases").innerHTML = state.purchases.length
      ? state.purchases.slice().reverse().slice(0, 12).map(x => `
        <div class="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
          <div><div class="font-semibold">${esc(x.playerName)}</div><div class="text-xs text-slate-500">${esc(x.teamName)}</div></div>
          <div class="font-black">${money(x.price)} cr</div>
        </div>`).join("")
      : '<div class="py-6 text-center text-sm text-slate-400">Ancora nessun acquisto.</div>';
  }

  function buyPlayer() {
    if (!selectedPlayer) return alert("Seleziona prima un giocatore.");
    const team = currentTeam();
    const price = Math.floor(num($("purchasePrice").value));
    if (!team) return alert("Seleziona un fantallenatore.");
    if (!Number.isInteger(price) || price < 1) return alert("Inserisci un prezzo valido.");
    if (price > team.credits) return alert(`${team.name} non ha abbastanza crediti.`);
    if (state.purchases.some(x => x.playerId === selectedPlayer.id)) return alert("Giocatore già acquistato.");

    team.credits -= price;
    state.purchases.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      playerRole: selectedPlayer.role,
      playerTeam: selectedPlayer.team,
      teamId: team.id,
      teamName: team.name,
      price,
      time: new Date().toISOString()
    });

    state.bids.push({ playerId: selectedPlayer.id, teamId: team.id, price, time: new Date().toISOString() });

    selectedPlayer = null;
    $("playerSearch").value = "";
    $("purchasePrice").value = "";
    renderPlayer();
    renderStats();
    renderRecent();
    save();
  }

  function save() {
    localStorage.setItem("fantaAuctionState", JSON.stringify(state));
    localStorage.setItem("fantaAuctionTeams", JSON.stringify(teams));
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem("fantaAuctionState") || "null");
      const savedTeams = JSON.parse(localStorage.getItem("fantaAuctionTeams") || "null");
      if (saved) state = {...state, ...saved};
      if (Array.isArray(savedTeams)) {
        savedTeams.forEach(st => {
          const t = teams.find(x => x.id === st.id);
          if (t) t.credits = st.credits;
        });
      }
    } catch {}
  }

  function resetAuction() {
    if (!confirm("Azzerare tutti gli acquisti dell'asta su questo browser?")) return;
    state = { currentTeamId: teams[0]?.id || null, purchases: [], bids: [] };
    teams.forEach(t => t.credits = num(settings.initialCredits || 750));
    save();
    selectedPlayer = null;
    $("playerSearch").value = "";
    $("purchasePrice").value = "";
    renderPlayer();
    renderStats();
    renderRecent();
  }

  function bind() {
    $("playerSearch").addEventListener("input", showSuggestions);
    $("buyerTeam").addEventListener("change", renderStats);
    $("buyButton").addEventListener("click", buyPlayer);
    $("resetAuction").addEventListener("click", resetAuction);
    document.addEventListener("click", e => {
      if (!e.target.closest("#playerSearch") && !e.target.closest("#playerSuggestions")) $("playerSuggestions").classList.add("hidden");
    });
  }

  async function init() {
    try {
      await load();
      restore();
      renderTeamSelect();
      renderPlayer();
      renderStats();
      renderRecent();
    } catch (e) {
      $("app").innerHTML = `<div class="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">Errore caricamento: ${esc(e.message)}</div>`;
    }
  }

  return { init };
})();
document.addEventListener("DOMContentLoaded", AuctionApp.init);

document.addEventListener("input", (event) => {
  if (event.target && event.target.id === "purchasePrice") {
    renderBidAdvice();
  }
});
