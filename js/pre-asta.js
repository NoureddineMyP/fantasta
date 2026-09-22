const PreAsta = (() => {
  const STORAGE = 'fantaPreAstaState';
  const GOALS = { P: 3, D: 8, C: 8, A: 6 };
  const ROLE_ORDER = ['P', 'D', 'C', 'A'];
  const ROLE_NAMES = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };
  const DEFAULT_PCT = { P: 8, D: 20, C: 32, A: 40 };

  const $ = id => document.getElementById(id);
  const n = v => Number(v) || 0;
  const m = v => n(v).toLocaleString('it-IT');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  let players = [];
  let settings = {};
  let budget = 750;
  let pct = { ...DEFAULT_PCT };
  let list = [];
  let tmStats = {};
  let tmBusy = false;

  const byId = id => players.find(p => String(p.id) === String(id));
  const estimate = p => Math.max(1, Math.round(n(p.fvm) * budget / 1000));
  const itemPrice = item => {
    const p = byId(item.playerId);
    return item.price != null ? n(item.price) : (p ? estimate(p) : 1);
  };
  const listed = () => list.map(item => ({ item, player: byId(item.playerId) })).filter(x => x.player);
  const roleCap = role => Math.round(budget * n(pct[role]) / 100);
  const roleSpend = role => listed().filter(x => x.player.role === role).reduce((s, x) => s + itemPrice(x.item), 0);
  const totalSpend = () => listed().reduce((s, x) => s + itemPrice(x.item), 0);
  const isBig = (player, price) => price >= Math.round(budget * 0.12) || n(player.fvm) >= 100;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      if (saved.pct) pct = { ...DEFAULT_PCT, ...saved.pct };
      if (Array.isArray(saved.list)) list = saved.list;
      if (saved.tmStats && typeof saved.tmStats === 'object') tmStats = saved.tmStats;
    } catch { /* ignore */ }
  }
  function saveState() {
    localStorage.setItem(STORAGE, JSON.stringify({ pct, list, tmStats }));
  }

  function adviceItems() {
    const rows = listed();
    const tips = [];
    const spend = totalSpend();
    const leftCredits = budget - spend;
    const leftSlots = Math.max(0, 25 - rows.length);
    const bigs = rows.filter(x => isBig(x.player, itemPrice(x.item)));
    const pctSum = ROLE_ORDER.reduce((s, r) => s + n(pct[r]), 0);

    if (pctSum !== 100) {
      tips.push({ level: 'warn', title: 'Quote reparto', text: `La somma delle percentuali è ${pctSum}%, non 100%. I tetti per ruolo restano comunque quelli impostati.` });
    }

    if (bigs.length >= 2) {
      const names = bigs.map(x => `${x.player.name} (${m(itemPrice(x.item))} cr)`).join(', ');
      const after = budget - bigs.reduce((s, x) => s + itemPrice(x.item), 0);
      const others = Math.max(0, 25 - bigs.length);
      const avg = others ? Math.floor(after / others) : after;
      tips.push({
        level: 'danger',
        title: 'Troppi big in lista',
        text: `Hai ${bigs.length} valutazioni alte: ${names}. Dopo di loro restano ${m(after)} cr per ${others} slot (media ${m(avg)} cr). In asta rischi di non chiudere la rosa se partono tutti vicini alla stima.`
      });
    } else if (bigs.length === 1) {
      const x = bigs[0];
      const share = Math.round(itemPrice(x.item) / budget * 100);
      tips.push({
        level: 'info',
        title: 'Un big in lista',
        text: `${x.player.name} pesa circa ${share}% del budget. Tieni gli altri target del suo reparto più bassi, altrimenti la quota ${ROLE_NAMES[x.player.role].toLowerCase()} scoppia in asta.`
      });
    }

    if (rows.length && leftSlots > 0 && leftCredits < leftSlots) {
      tips.push({ level: 'danger', title: 'Lista non sostenibile', text: `Con i prezzi stimati restano ${m(leftCredits)} cr per ${leftSlots} slot: sotto 1 credito a testa. Taglia un big o rivedi i prezzi.` });
    } else if (rows.length && leftSlots > 0 && leftCredits / leftSlots < 4) {
      tips.push({ level: 'warn', title: 'Margine stretto', text: `Restano ${m(leftCredits)} cr per ${leftSlots} slot (media ${m(Math.floor(leftCredits / leftSlots))} cr). In asta i minimi salgono in fretta.` });
    }

    ROLE_ORDER.forEach(role => {
      const group = rows.filter(x => x.player.role === role);
      const spent = roleSpend(role);
      const cap = roleCap(role);
      const need = GOALS[role];
      const missing = Math.max(0, need - group.length);
      if (spent > cap * 1.08 && group.length) {
        tips.push({
          level: 'danger',
          title: `${ROLE_NAMES[role]} oltre la quota`,
          text: `Stima ${m(spent)} cr su un tetto di ${m(cap)} cr (${pct[role]}%). Togli un nominativo alto o alza la percentuale di questo reparto.`
        });
      } else if (spent > cap && group.length) {
        tips.push({
          level: 'warn',
          title: `${ROLE_NAMES[role]} un filo sopra`,
          text: `${m(spent)} cr stimati vs ${m(cap)} cr di quota. In asta resta poco scarto.`
        });
      }
      if (group.length > need) {
        tips.push({ level: 'warn', title: `${ROLE_NAMES[role]}: troppi nominativi`, text: `${group.length} in lista, lo slot da coprire è ${need}. È una shortlist: in asta dovrai scegliere, non prenderli tutti.` });
      } else if (missing && rows.length >= 8) {
        tips.push({ level: 'info', title: `${ROLE_NAMES[role]} incompleti`, text: `Mancano ${missing} slot (obiettivo ${need}). Aggiungi alternative di fascia media, non solo titolari costosi.` });
      }
      const roleBigs = group.filter(x => isBig(x.player, itemPrice(x.item)));
      if (roleBigs.length >= 2) {
        tips.push({
          level: 'warn',
          title: `Doppio big nei ${ROLE_NAMES[role].toLowerCase()}`,
          text: `${roleBigs.map(x => x.player.name).join(' e ')} insieme bruciano la quota ${ROLE_NAMES[role].toLowerCase()}. Meglio un titolare di fascia alta e un secondo più economico.`
        });
      }
    });

    const clubs = rows.reduce((map, x) => {
      map[x.player.team] = (map[x.player.team] || 0) + 1;
      return map;
    }, {});
    const overloaded = Object.entries(clubs).filter(([, c]) => c > 4);
    if (overloaded.length) {
      tips.push({
        level: 'warn',
        title: 'Troppi della stessa squadra',
        text: `${overloaded.map(([club, c]) => `${club} (${c})`).join(', ')}: oltre 4 nominativi dallo stesso club aumentano il rischio squalifiche/calendario.`
      });
    }

    const keepers = rows.filter(x => x.player.role === 'P');
    const gkClubs = [...new Set(keepers.map(x => x.player.team))];
    if (keepers.length >= 2 && !keepers.some(a => keepers.some(b => a.player.id !== b.player.id && a.player.team === b.player.team))) {
      tips.push({ level: 'info', title: 'Portieri', text: 'Non hai una coppia della stessa squadra. In classico conviene titolare + riserva dello stesso club, più un terzo di un’altra porta.' });
    } else if (keepers.length >= 2 && gkClubs.length < 2) {
      tips.push({ level: 'info', title: 'Terzo portiere', text: 'Hai già la coppia della stessa porta: aggiungi un terzo titolare di un altro club.' });
    }

    rows.forEach(({ player }) => {
      const tm = tmStats[player.id];
      if (!tm || tm.error) return;
      if (tm.injured) {
        tips.push({ level: 'danger', title: `${player.name} infortunato`, text: `Infortunio in corso su Transfermarkt: ${tm.injured}. Tienilo in lista solo se hai un sostituto nello stesso ruolo.` });
      }
      const last = tm.last || {}, cur = tm.current || {};
      if (n(last.app) >= 20 && n(cur.app) === 0) {
        tips.push({ level: 'warn', title: `${player.name}: fermo a inizio 26/27`, text: `Nel 25/26 ha ${last.app} PG, ${last.goals} gol e ${last.assists} assist, ma zero presenze nel 26/27. Rischio panchina o infortunio.` });
      } else if (n(last.app) >= 25 && n(cur.app) > 0 && n(cur.app) <= 2 && n(last.missed) >= 8) {
        tips.push({ level: 'warn', title: `${player.name}: fragilità`, text: `Nel 25/26 ha saltato ${last.missed} partite per infortunio. Non costruirci sopra l’intera quota del reparto.` });
      } else if (n(last.goals) + n(last.assists) >= 12 && n(cur.app) >= 3 && n(cur.goals) + n(cur.assists) === 0 && player.role !== 'P' && player.role !== 'D') {
        tips.push({ level: 'info', title: `${player.name}: partenza lenta`, text: `Bonus 25/26: ${last.goals} gol e ${last.assists} assist. In 26/27 ancora a zero dopo ${cur.app} PG: aspetta conferme prima di alzare il tetto.` });
      } else if (n(cur.app) >= 3 && n(cur.goals) + n(cur.assists) > 0 && n(last.app) >= 15) {
        const delta = (n(cur.goals) + n(cur.assists)) - Math.round(((n(last.goals) + n(last.assists)) / Math.max(1, last.app)) * cur.app);
        if (delta >= 2) {
          tips.push({ level: 'ok', title: `${player.name}: in crescita`, text: `26/27: ${cur.app} PG, ${cur.goals} gol, ${cur.assists} assist. Meglio del ritmo 25/26 (${last.goals}G + ${last.assists}A in ${last.app} PG).` });
        }
      }
      if (n(last.app) > 0 && n(last.app) < 12 && n(player.fvm) >= 40) {
        tips.push({ level: 'warn', title: `${player.name}: poca titolarità 25/26`, text: `Solo ${last.app} PG l’anno scorso a fronte di FVM ${m(player.fvm)}. Il prezzo sconta un salto di ruolo: non darlo per scontato.` });
      }
    });

    if (!rows.length) {
      tips.push({ level: 'info', title: 'Inizia la shortlist', text: 'Aggiungi i nominativi che vorresti in rosa. I prezzi partono dalla FVM rapportata ai 750 crediti; puoi modificarli.' });
    } else if (!tips.some(t => t.level === 'danger' || t.level === 'warn')) {
      tips.push({ level: 'ok', title: 'Shortlist equilibrata', text: 'Quote e slot sono sostenibili sulla carta. Resta il rischio asta: i big possono costare più della stima FVM.' });
    }

    const rank = { danger: 0, warn: 1, info: 2, ok: 3 };
    return tips.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 12);
  }

  function renderPct() {
    ROLE_ORDER.forEach(role => {
      const input = $(`pct${role}`);
      if (input) input.value = pct[role];
      const cap = roleCap(role);
      const spent = roleSpend(role);
      const bar = $(`bar${role}`);
      const label = $(`barLabel${role}`);
      const pctUsed = cap ? Math.min(100, Math.round(spent / cap * 100)) : 0;
      if (bar) {
        bar.style.width = `${pctUsed}%`;
        bar.className = `h-2 rounded-full ${spent > cap * 1.08 ? 'bg-red-500' : spent > cap ? 'bg-amber-400' : 'bg-brand-600'}`;
      }
      if (label) label.textContent = `${m(spent)} / ${m(cap)} cr · ${listed().filter(x => x.player.role === role).length}/${GOALS[role]}`;
    });
    const sum = ROLE_ORDER.reduce((s, r) => s + n(pct[r]), 0);
    const sumEl = $('pctSum');
    if (sumEl) {
      sumEl.textContent = `${sum}%`;
      sumEl.className = `text-sm font-extrabold ${sum === 100 ? 'text-brand-700' : 'text-amber-600'}`;
    }
  }

  function renderStats() {
    $('listCount').textContent = `${listed().length}/25`;
    $('spendCount').textContent = m(totalSpend());
    $('leftCount').textContent = m(Math.max(0, budget - totalSpend()));
  }

  function renderList() {
    const box = $('wishList');
    const rows = listed();
    if (!rows.length) {
      box.innerHTML = '<p class="py-8 text-center text-sm text-slate-400">Nessun giocatore in shortlist. Cerca e aggiungi i nominativi pre-asta.</p>';
      return;
    }
    box.innerHTML = ROLE_ORDER.map(role => {
      const group = rows.filter(x => x.player.role === role);
      if (!group.length) return '';
      return `<section class="mb-5 last:mb-0">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-xs font-bold uppercase tracking-wide text-slate-400">${esc(ROLE_NAMES[role])}</h3>
          <span class="text-xs text-slate-500">${group.length}/${GOALS[role]} · ${m(roleSpend(role))} cr</span>
        </div>
        <div class="space-y-2">${group.map(({ item, player }) => {
        const price = itemPrice(item);
        const tm = tmStats[player.id];
        const tmLine = !tm ? '' : tm.error
          ? `<p class="text-[11px] text-amber-700">${esc(tm.error)}</p>`
          : `<p class="text-[11px] text-slate-500">25/26 ${tm.last?.app || 0} PG · ${tm.last?.goals || 0}G · ${tm.last?.assists || 0}A${tm.last?.missed ? ` · ${tm.last.missed} salt.` : ''} → 26/27 ${tm.current?.app || 0} PG · ${tm.current?.goals || 0}G · ${tm.current?.assists || 0}A${tm.injured ? ` · infortunio: ${esc(tm.injured)}` : ''}</p>`;
        const big = isBig(player, price);
        return `<article class="flex flex-wrap items-center gap-3 rounded-2xl border ${big ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'} px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="font-bold leading-tight">${esc(player.name)} ${big ? '<span class="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-900">big</span>' : ''}</p>
            <p class="text-xs text-slate-500">${esc(player.team)} · FVM ${m(player.fvm)} · Quot ${m(player.quot)}</p>
            ${tmLine}
          </div>
          <label class="text-[10px] font-bold uppercase text-slate-400">stima cr
            <input data-price="${esc(player.id)}" type="number" min="1" step="1" value="${price}" class="mt-0.5 block w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-900">
          </label>
          <button data-remove="${esc(player.id)}" class="rounded-xl px-2 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">Togli</button>
        </article>`;
      }).join('')}</div>
      </section>`;
    }).join('');

    box.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => {
        list = list.filter(x => String(x.playerId) !== String(btn.dataset.remove));
        saveState();
        renderAll();
      };
    });
    box.querySelectorAll('[data-price]').forEach(input => {
      input.onchange = () => {
        const id = input.dataset.price;
        const value = Math.max(1, Math.floor(n(input.value)));
        const row = list.find(x => String(x.playerId) === String(id));
        if (row) row.price = value;
        saveState();
        renderAll();
      };
    });
  }

  function renderAdvice() {
    const tips = adviceItems();
    const tone = {
      danger: 'border-red-100 bg-red-50 text-red-950',
      warn: 'border-amber-100 bg-amber-50 text-amber-950',
      info: 'border-indigo-100 bg-indigo-50 text-indigo-950',
      ok: 'border-emerald-100 bg-emerald-50 text-emerald-950'
    };
    const badge = { danger: 'Rischio', warn: 'Attenzione', info: 'Consiglio', ok: 'Ok' };
    $('advicePanel').innerHTML = tips.map(t => `
      <article class="rounded-2xl border p-3 ${tone[t.level]}">
        <p class="text-[10px] font-extrabold uppercase tracking-wide">${badge[t.level]}</p>
        <p class="mt-0.5 font-extrabold">${esc(t.title)}</p>
        <p class="mt-1 text-sm leading-5">${esc(t.text)}</p>
      </article>`).join('');
  }

  function renderAll() {
    renderPct();
    renderStats();
    renderList();
    renderAdvice();
  }

  function addPlayer(player) {
    if (list.some(x => String(x.playerId) === String(player.id))) return;
    list.push({ playerId: player.id, price: estimate(player) });
    saveState();
    $('playerSearch').value = '';
    $('playerSuggestions').classList.add('hidden');
    renderAll();
  }

  function search() {
    const q = $('playerSearch').value.trim().toLowerCase();
    const box = $('playerSuggestions');
    const role = $('roleFilter').value;
    if (!q) { box.classList.add('hidden'); return; }
    const taken = new Set(list.map(x => String(x.playerId)));
    const items = players.filter(p => !p.out_of_list && !taken.has(String(p.id))
      && (!role || p.role === role)
      && (p.name.toLowerCase().includes(q) || String(p.team).toLowerCase().includes(q))).slice(0, 12);
    box.innerHTML = items.length
      ? items.map(p => `<button data-id="${esc(p.id)}" class="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"><b>${esc(p.name)}</b><span class="ml-2 text-xs text-slate-500">${esc(p.team)} · ${p.role} · FVM ${m(p.fvm)} · ~${m(estimate(p))} cr</span></button>`).join('')
      : '<p class="p-4 text-sm text-slate-500">Nessun giocatore trovato.</p>';
    box.classList.remove('hidden');
    box.querySelectorAll('[data-id]').forEach(btn => {
      btn.onclick = () => addPlayer(byId(btn.dataset.id));
    });
  }

  async function refreshTm() {
    const rows = listed();
    if (!rows.length || tmBusy) return;
    if (typeof Transfermarkt === 'undefined' || !Transfermarkt.fetchSummary) {
      $('tmStatus').textContent = 'Modulo Transfermarkt non disponibile.';
      return;
    }
    tmBusy = true;
    const btn = $('tmRefresh');
    btn.disabled = true;
    let done = 0;
    for (const { player } of rows) {
      $('tmStatus').textContent = `Prestazioni Transfermarkt ${++done}/${rows.length}: ${player.name}…`;
      try {
        tmStats[player.id] = await Transfermarkt.fetchSummary(player.name, player.team);
      } catch (error) {
        tmStats[player.id] = { error: error.message };
      }
      saveState();
      renderAll();
    }
    $('tmStatus').textContent = `Aggiornate ${done} schede · 25/26 vs 26/27.`;
    btn.disabled = false;
    tmBusy = false;
    renderAll();
  }

  function bind() {
    $('playerSearch').oninput = search;
    $('roleFilter').onchange = () => { if ($('playerSearch').value.trim()) search(); };
    ROLE_ORDER.forEach(role => {
      $(`pct${role}`).onchange = () => {
        pct[role] = Math.max(0, Math.min(100, Math.round(n($(`pct${role}`).value))));
        saveState();
        renderAll();
      };
    });
    $('tmRefresh').onclick = refreshTm;
    $('resetList').onclick = () => {
      if (!confirm('Svuotare la shortlist pre-asta? Le percentuali restano.')) return;
      list = [];
      tmStats = {};
      saveState();
      renderAll();
    };
    document.addEventListener('click', e => {
      if (!e.target.closest('#playerSearch') && !e.target.closest('#playerSuggestions')) {
        $('playerSuggestions').classList.add('hidden');
      }
    });
  }

  async function init() {
    [players, settings] = await Promise.all([
      fetch('./data/players.json').then(r => r.json()),
      fetch('./data/settings.json').then(r => r.json())
    ]);
    budget = n(settings.initialCredits || 750);
    loadState();
    bind();
    renderAll();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => PreAsta.init().catch(error => {
  document.querySelector('#app').innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-red-700">Errore di caricamento: ${error.message}</p>`;
}));
