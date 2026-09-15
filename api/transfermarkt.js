const Transfermarkt = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const n = v => Number(v) || 0;
  const normalize = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const surname = name => String(name || '').replace(/\s+[A-Za-zÀ-ÿ]\.$/, '').trim();
  const cacheKey = 'tmIdCache';

  function idCache() { try { return JSON.parse(localStorage.getItem(cacheKey) || '{}'); } catch { return {}; } }
  function saveId(key, id) { const c = idCache(); c[key] = id; localStorage.setItem(cacheKey, JSON.stringify(c)); }

  function eur(v) {
    if (v === null || v === undefined) return '—';
    const value = Number(v);
    if (!Number.isFinite(value)) return '—';
    if (value >= 1000000) return `€${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}M`;
    if (value >= 1000) return `€${Math.round(value / 1000)}k`;
    return `€${value}`;
  }
  function fdate(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const loading = msg => `<p class="text-sm text-slate-500">${esc(msg)}</p>`;
  const errorBox = msg => `<p class="text-sm text-red-600">${esc(msg)}</p>`;

  async function search(query) {
    const response = await fetch(`./api/transfermarkt?action=search&q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ricerca non riuscita.');
    return data.results || [];
  }
  async function fullData(id) {
    const response = await fetch(`./api/transfermarkt?action=full&id=${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Recupero dati non riuscito.');
    return data;
  }

  function render(data) {
    const p = data.profile, mv = data.marketValue, st = data.stats, inj = data.injuries, tr = data.transfers, ach = data.achievements;
    const sections = [];

    if (p && !p.error) {
      sections.push(`<div class="flex items-center gap-3">
        ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" class="h-14 w-14 rounded-full bg-slate-100 object-cover" onerror="this.remove()">` : ''}
        <div><p class="text-lg font-extrabold">${esc(p.name)}</p>
        <p class="text-xs text-slate-500">${esc(p.club?.name || '')}${p.position?.main ? ' · ' + esc(p.position.main) : ''}${p.shirtNumber ? ' · #' + esc(p.shirtNumber) : ''}</p></div>
        <div class="ml-auto text-right"><p class="text-lg font-extrabold text-gold-500">${eur(p.marketValue)}</p><p class="text-xs text-slate-500">valore di mercato</p></div>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
        <div class="rounded-xl bg-white p-2"><b class="block text-sm text-slate-900">${p.age ?? '—'}</b>età</div>
        <div class="rounded-xl bg-white p-2"><b class="block text-sm text-slate-900">${esc(p.foot || '—')}</b>piede</div>
        <div class="rounded-xl bg-white p-2"><b class="block text-sm text-slate-900">${p.height ? p.height + ' cm' : '—'}</b>altezza</div>
      </div>`);
    } else if (p?.error) sections.push(`<p class="text-xs text-amber-700">Profilo non disponibile (${esc(p.error)}).</p>`);

    if (inj && !inj.error) {
      const today = new Date();
      const list = inj.injuries || [];
      const active = list.find(i => !i.untilDate || new Date(i.untilDate) >= today);
      sections.push(active
        ? `<div class="rounded-xl border border-red-100 bg-red-50 p-3"><p class="text-xs font-bold uppercase text-red-600">Infortunio in corso</p><p class="mt-1 text-sm font-semibold text-red-900">${esc(active.injury)}</p><p class="text-xs text-red-700">dal ${fdate(active.fromDate)}${active.untilDate ? ' al ' + fdate(active.untilDate) : ' · rientro non ancora stimato'}</p></div>`
        : `<p class="text-xs font-semibold text-emerald-700">✓ Nessun infortunio in corso su Transfermarkt.</p>`);
      const recent = list.filter(i => i !== active).slice(0, 3);
      if (recent.length) sections.push(`<div><p class="text-xs font-bold uppercase text-slate-400">Storico infortuni recenti</p><div class="mt-1 space-y-1">${recent.map(i => `<p class="text-xs text-slate-600">${esc(i.injury)} — ${fdate(i.fromDate)}${i.untilDate ? ' → ' + fdate(i.untilDate) : ''}${i.gamesMissed ? ` (${i.gamesMissed} partite saltate)` : ''}</p>`).join('')}</div></div>`);
    } else if (inj?.error) sections.push(`<p class="text-xs text-amber-700">Infortuni non disponibili (${esc(inj.error)}).</p>`);

    if (st && !st.error && st.stats?.length) {
      const rows = st.stats.filter(s => n(s.appearances) > 0 || n(s.minutesPlayed) > 0);
      const totals = rows.reduce((a, s) => ({ app: a.app + n(s.appearances), goals: a.goals + n(s.goals), assists: a.assists + n(s.assists), yellow: a.yellow + n(s.yellowCards), red: a.red + n(s.redCards), min: a.min + n(s.minutesPlayed) }), { app: 0, goals: 0, assists: 0, yellow: 0, red: 0, min: 0 });
      sections.push(`<div><p class="text-xs font-bold uppercase text-slate-400">Rendimento per competizione</p>
        <div class="mt-1 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400"><th class="text-left font-semibold">Competizione</th><th>PG</th><th>G</th><th>A</th><th>Amm.</th><th>Esp.</th><th>Min.</th></tr></thead><tbody>
        ${rows.map(s => `<tr class="border-t border-slate-100"><td class="py-1 text-left">${esc(s.competitionName)}</td><td class="text-center">${n(s.appearances)}</td><td class="text-center">${n(s.goals)}</td><td class="text-center">${n(s.assists)}</td><td class="text-center">${n(s.yellowCards)}</td><td class="text-center">${n(s.redCards)}</td><td class="text-center">${n(s.minutesPlayed)}</td></tr>`).join('')}
        ${rows.length > 1 ? `<tr class="border-t border-slate-200 font-bold"><td class="py-1 text-left">Totale</td><td class="text-center">${totals.app}</td><td class="text-center">${totals.goals}</td><td class="text-center">${totals.assists}</td><td class="text-center">${totals.yellow}</td><td class="text-center">${totals.red}</td><td class="text-center">${totals.min}</td></tr>` : ''}
        </tbody></table></div></div>`);
    } else if (st?.error) sections.push(`<p class="text-xs text-amber-700">Statistiche non disponibili (${esc(st.error)}).</p>`);

    if (mv && !mv.error && mv.marketValueHistory?.length) {
      const peak = mv.marketValueHistory.reduce((a, h) => n(h.marketValue) > n(a?.marketValue) ? h : a, mv.marketValueHistory[0]);
      sections.push(`<p class="text-xs text-slate-500">Valore massimo storico: <b class="text-slate-700">${eur(peak?.marketValue)}</b> (${fdate(peak?.date)}${peak?.clubName ? ', ' + esc(peak.clubName) : ''})</p>`);
    } else if (mv?.error) sections.push(`<p class="text-xs text-amber-700">Valore di mercato non disponibile (${esc(mv.error)}).</p>`);

    if (tr && !tr.error && tr.transfers?.length) {
      const last = tr.transfers.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      sections.push(`<div><p class="text-xs font-bold uppercase text-slate-400">Ultimo trasferimento</p><p class="mt-1 text-xs text-slate-600">${esc(last.clubFrom?.name)} → ${esc(last.clubTo?.name)} · ${fdate(last.date)}${last.fee ? ` · ${eur(last.fee)}` : ''}${last.upcoming ? ' · operazione futura' : ''}</p></div>`);
    } else if (tr?.error) sections.push(`<p class="text-xs text-amber-700">Trasferimenti non disponibili (${esc(tr.error)}).</p>`);

    if (ach && !ach.error && ach.achievements?.length) {
      sections.push(`<p class="text-xs text-slate-500"><b class="text-slate-700">Palmarès:</b> ${ach.achievements.slice(0, 4).map(a => `${esc(a.title)} (${a.count})`).join(' · ')}</p>`);
    }

    sections.push(`<p class="text-[11px] text-slate-400">Dati da Transfermarkt (fonte non ufficiale) · aggiornato ${new Date(data.updatedAt).toLocaleString('it-IT')}</p>`);
    return `<div class="space-y-3">${sections.join('')}</div>`;
  }

  function pickerHtml(candidates, key, container) {
    container.innerHTML = `<p class="text-sm text-slate-600">Più giocatori trovati, scegli quello giusto:</p>
      <div class="mt-2 space-y-1">${candidates.map(c => `<button data-tm-pick="${esc(c.id)}" class="block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:bg-slate-50"><b>${esc(c.name)}</b> <span class="text-xs text-slate-500">${esc(c.club?.name || '')}${c.position ? ' · ' + esc(c.position) : ''}${c.age ? ` · ${c.age} anni` : ''}</span></button>`).join('')}</div>`;
    container.querySelectorAll('[data-tm-pick]').forEach(btn => btn.onclick = async () => {
      saveId(key, btn.dataset.tmPick);
      container.innerHTML = loading('Recupero statistiche… può richiedere alcuni secondi.');
      try { container.innerHTML = render(await fullData(btn.dataset.tmPick)); }
      catch (error) { container.innerHTML = errorBox(error.message); }
    });
  }

  async function lookup(name, club, container) {
    const key = `${name}|${club || ''}`;
    container.innerHTML = loading('Ricerca su Transfermarkt…');
    try {
      const cached = idCache()[key];
      if (cached) {
        container.innerHTML = loading('Recupero statistiche… può richiedere alcuni secondi.');
        return void (container.innerHTML = render(await fullData(cached)));
      }
      const results = await search(surname(name));
      if (!results.length) throw new Error(`Nessun risultato su Transfermarkt per "${surname(name)}".`);
      const ownClub = normalize(club);
      const match = results.find(r => ownClub && normalize(r.club?.name).includes(ownClub)) || (results.length === 1 ? results[0] : null);
      if (!match) return void pickerHtml(results.slice(0, 6), key, container);
      saveId(key, match.id);
      container.innerHTML = loading('Recupero statistiche… può richiedere alcuni secondi.');
      container.innerHTML = render(await fullData(match.id));
    } catch (error) {
      container.innerHTML = errorBox(error.message);
    }
  }

  return { lookup };
})();
