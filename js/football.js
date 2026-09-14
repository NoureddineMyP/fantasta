const FootballData = (() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const status = document.querySelector('#footballDataStatus');
  const button = document.querySelector('#syncFootballData');

  function myPlayers() {
    try {
      const state = JSON.parse(localStorage.getItem('fantaAuctionState') || '{}');
      return (state.purchases || []).filter(player => String(player.teamId) === '1');
    } catch { return []; }
  }
  function show(payload) {
    const items = payload.injuries || [];
    const mine = myPlayers();
    const unavailable = items.filter(item => {
      const name = normalize(item.player?.name);
      return mine.some(player => {
        const own = normalize(player.playerName);
        return own && name && (name.includes(own) || own.includes(name));
      });
    });
    if (!mine.length) {
      status.innerHTML = 'Acquista prima un giocatore per Squadra 1: controllerò automaticamente eventuali indisponibilità.';
      return;
    }
    if (!unavailable.length) {
      status.innerHTML = `<b>Nessuna indisponibilità trovata</b> per i ${mine.length} giocatori della tua rosa. Dati aggiornati: ${new Date(payload.fetchedAt).toLocaleString('it-IT')}.`;
      return;
    }
    status.innerHTML = `<b>Attenzione:</b> ${unavailable.map(item => `${item.player.name} — ${item.player.reason || item.player.type || 'indisponibile'}`).join(' · ')}. Aggiornato: ${new Date(payload.fetchedAt).toLocaleString('it-IT')}.`;
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
    } catch { /* An update has not been saved yet. */ }
  }
  if (button) button.addEventListener('click', sync);
  load();
  return { sync };
})();
