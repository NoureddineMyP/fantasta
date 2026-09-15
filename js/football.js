const FootballData = (() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const status = document.querySelector('#footballDataStatus');
  const button = document.querySelector('#syncFootballData');
  const dayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function myPlayers() {
    try {
      const state = JSON.parse(localStorage.getItem('fantaAuctionState') || '{}');
      return (state.purchases || []).filter(player => String(player.teamId) === '1');
    } catch { return []; }
  }

  function clubMatches(mine, matches) {
    const clubs = [...new Set(mine.map(p => p.playerTeam).filter(Boolean))];
    return clubs.map(club => {
      const own = normalize(club);
      const next = matches
        .filter(match => {
          const home = normalize(match.homeTeam), away = normalize(match.awayTeam);
          return own && (home.includes(own) || own.includes(home) || away.includes(own) || own.includes(away));
        })
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];
      const players = mine.filter(p => p.playerTeam === club).map(p => p.playerName);
      return { club, next, players };
    }).sort((a, b) => (a.next ? new Date(a.next.utcDate) : Infinity) - (b.next ? new Date(b.next.utcDate) : Infinity));
  }

  function matchLabel(club, match) {
    const home = normalize(match.homeTeam), own = normalize(club);
    const isHome = home.includes(own) || own.includes(home);
    const opponent = isHome ? match.awayTeam : match.homeTeam;
    return `${isHome ? 'vs' : '@'} ${opponent} · ${dayFormatter.format(new Date(match.utcDate))}`;
  }

  function show(payload) {
    const mine = myPlayers();
    if (!mine.length) {
      status.innerHTML = 'Acquista prima un giocatore per Squadra 1: mostrerò qui i prossimi impegni dei suoi club.';
      return;
    }
    const rows = clubMatches(mine, payload.matches || []);
    const updated = new Date(payload.fetchedAt).toLocaleString('it-IT');
    if (!rows.length) {
      status.innerHTML = `Nessun club identificato nella rosa. Aggiornato: ${updated}.`;
      return;
    }
    status.innerHTML = `
      <div class="space-y-2">
        ${rows.map(row => `
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2">
            <div>
              <p class="text-sm font-bold text-slate-800">${row.club}</p>
              <p class="text-xs text-slate-500">${row.players.join(' · ')}</p>
            </div>
            <p class="text-xs font-semibold ${row.next ? 'text-sky-700' : 'text-slate-400'}">${row.next ? matchLabel(row.club, row.next) : 'Nessuna partita in calendario'}</p>
          </div>`).join('')}
      </div>
      <p class="mt-3 text-xs text-slate-500">Calendario Serie A aggiornato: ${updated}.</p>`;
  }

  async function sync() {
    button.disabled = true; button.textContent = 'Aggiornamento…';
    try {
      const response = await fetch('./api/live-data', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Errore nel recupero dei dati.');
      show(payload);
    } catch (error) {
      status.textContent = `Dati live non disponibili: ${error.message}`;
    } finally {
      button.disabled = false; button.textContent = 'Aggiorna dati';
    }
  }
  async function load() {
    try {
      const response = await fetch('./api/live-data');
      if (response.ok) show(await response.json());
    } catch { /* Nessun aggiornamento salvato finora. */ }
  }
  if (button) button.addEventListener('click', sync);
  load();
  return { sync };
})();
