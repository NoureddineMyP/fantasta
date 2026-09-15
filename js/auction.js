const AuctionApp = (() => {
    let players = [], teams = [], settings = {}, selected = null, state = {
        purchases: []
    };

    const $ = id => document.getElementById(id), n = v => Number(v) || 0, m = v => n(v).toLocaleString('it-IT');
    const roles = {
        P: 'Portiere', D: 'Difensore', C: 'Centrocampista', A: 'Attaccante'
    }, goals = {
        P: 3, D: 8, C: 8, A: 6
    };

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
    const roster = id => state.purchases.filter(p => String(p.teamId) === String(id));
    const count = (id, role) => roster(id).filter(p => p.playerRole === role).length;
    const selectedBuyer = () => teams.find(t => String(t.id) === String($('buyerTeam').value));
    const myTeam = () => teams.find(t => String(t.id) === '1');
    const remaining = t => Math.max(0, 25 - roster(t.id).length);
    const available = () => {
        const sold = new Set(state.purchases.map(p => String(p.playerId))); return players.filter(p => !p.out_of_list && !sold.has(String(p.id)))
    };

    function pricePlan(p, t) {
        const initial = n(settings.initialCredits || 750);
        const open = Math.max(1, remaining(t));
        const affordable = Math.max(1, Math.floor(n(t.credits) - Math.max(0, open - 1)));
        const need = Math.max(0, goals[p.role] - count(t.id, p.role));
        const suggested = Math.min(affordable, Math.max(1, Math.round(n(p.fvm) * initial / 1000)));
        const premium = need >= 4 ? 1.18 : need <= 1 ? 1.06 : 1.12;

        return {
            suggested,
            maximum: Math.min(affordable, Math.round(suggested * premium)),
            affordable,
            need
        };
    }
    function renderSelect() {
        const old = $('buyerTeam').value; $('buyerTeam').innerHTML = teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${m(t.credits)} cr</option>`).join(''); $('buyerTeam').value = old || '1'
    }
    function renderPlayer() {
        if (!selected) {
            $('selectedPlayer').innerHTML = '<p class="text-sm text-slate-500">Nessun giocatore selezionato.</p>'; return
        } $('selectedPlayer').innerHTML = `<div class="flex items-start justify-between gap-4"><div><span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">${selected.role} · ${roles[selected.role]}</span><h2 class="mt-2 text-2xl font-black">${esc(selected.name)}</h2><p class="text-sm text-slate-500">${esc(selected.team)}</p></div><div class="text-right"><b class="text-xl">FM ${n(selected.fm).toFixed(2)}</b><p class="text-sm text-slate-500">FVM ${m(selected.fvm)} · Quot ${m(selected.quot)}</p></div></div>`
    }
    function search() {
        const q = $('playerSearch').value.trim().toLowerCase(), box = $('playerSuggestions'); if (!q) {
            box.classList.add('hidden'); return
        } const items = available().filter(p => p.name.toLowerCase().includes(q) || String(p.team).toLowerCase().includes(q)).slice(0, 15); box.innerHTML = items.length ? items.map(p => `<button data-id="${esc(p.id)}" class="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50"><b>${esc(p.name)}</b><span class="ml-2 text-xs text-slate-500">${esc(p.team)} · ${p.role} · FM ${n(p.fm).toFixed(2)}</span></button>`).join('') : '<p class="p-4 text-sm text-slate-500">Nessun giocatore disponibile.</p>'; box.classList.remove('hidden'); box.querySelectorAll('[data-id]').forEach(x => x.onclick = () => {
            selected = available().find(p => String(p.id) === x.dataset.id); $('playerSearch').value = selected.name; box.classList.add('hidden'); renderAll()
        })
    }
    function advice() {
        const me = myTeam(); if (!me) return;
        const myGoalkeepers = roster(me.id).filter(p => p.playerRole === 'P');
        const coverages = available().filter(p => p.role === 'P' && myGoalkeepers.some(g => (g.playerTeam || players.find(x => String(x.id) === String(g.playerId))?.team) === p.team));
        if (!selected) {
            if (coverages.length) {
                $('strategicAdvice').innerHTML = `<p class="text-xs font-bold uppercase text-violet-500">Copertura portieri · Squadra 1</p><p class="mt-1 text-xl font-black">Completa il blocco ${esc(coverages[0].team)}</p><p class="mt-2 text-sm text-slate-600">Hai già ${myGoalkeepers.map(p => esc(p.playerName)).join(' · ')}. Porta a casa: <b>${coverages.map(p => esc(p.name)).join(' · ')}</b>.</p>`;
            }
            return;
        }
        const plan = pricePlan(selected, me), max = plan.maximum, price = Math.floor(n($('purchasePrice').value)), need = plan.need, priorities = Object.keys(goals).map(role => ({
            role, need: Math.max(0, goals[role] - count(me.id, role))
        })).filter(x => x.need).sort((a, b) => b.need - a.need), alts = available().filter(p => p.id !== selected.id && p.role === selected.role).sort((a, b) => n(b.fvm) - n(a.fvm)).slice(0, 3); let label = 'SEGUI', color = 'sky', msg = `Per la tua Squadra 1 puoi rilanciare fino a ${m(max)} crediti.`; if (price && price <= max * .65) {
            label = 'OTTIMO AFFARE'; color = 'emerald'; msg = 'Prezzo molto sotto il valore stimato per la tua rosa.'
        } else if (price > max) {
            label = price <= max * 1.15 && need <= 1 ? 'VALUTA' : 'FERMATI'; color = label === 'VALUTA' ? 'amber' : 'red'; msg = label === 'VALUTA' ? 'Ruolo quasi scoperto: un piccolo extra è sostenibile.' : `Supera il tetto di ${m(max)} crediti per Squadra 1.`
        } $('bidAdvice').innerHTML = `<div class="flex justify-between gap-3"><div><p class="text-xs font-bold uppercase text-indigo-500">Il tuo assistente · Squadra 1</p><div class="mt-1 flex gap-5"><div><p class="text-3xl font-black">${m(plan.suggested)} cr</p><p class="text-xs text-slate-600">prezzo suggerito</p></div><div><p class="text-3xl font-black">${m(max)} cr</p><p class="text-xs text-slate-600">massimo da offrire</p></div></div><p class="mt-2 text-xs text-slate-500">FVM ${m(selected.fvm)} medio su 1.000 cr · budget protetto per ${remaining(me) - 1} slot</p></div><b class="rounded-full bg-${color}-100 px-3 py-1 text-xs text-${color}-900">${label}</b></div><p class="mt-3 text-sm font-semibold">${msg}</p>`; $('strategicAdvice').innerHTML = `<p class="text-xs font-bold uppercase text-violet-500">Piano per rendere forte Squadra 1</p><p class="mt-1 text-xl font-black">${need ? `${need} slot ${roles[selected.role].toLowerCase()} da coprire` : 'Reparto già completo'}</p><p class="mt-2 text-sm text-slate-600"><b>Priorità rosa:</b> ${priorities.map(x => `${roles[x.role]} (${x.need})`).join(' · ') || 'rosa completa'}</p>${coverages.length ? `<p class="mt-2 rounded-xl bg-white p-3 text-sm text-violet-900"><b>Copertura portieri:</b> dopo ${myGoalkeepers.map(p => esc(p.playerName)).join(' · ')}, cerca ${coverages.map(p => esc(p.name)).join(' · ')} (${esc(coverages[0].team)}).</p>` : ''}<p class="mt-2 text-sm text-slate-600">Piano B: ${alts.map(p => esc(p.name)).join(' · ') || 'nessuna alternativa disponibile'}</p>`
    }
    function stats() {
        $('availableCount').textContent = m(available().length); $('purchaseCount').textContent = m(state.purchases.length); $('spentCount').textContent = m(state.purchases.reduce((a, p) => a + n(p.price), 0)); $('teamCredits').textContent = `${m(selectedBuyer()?.credits)} cr`
    }
    function auditRoster() {
        const box = $('rosterAudit');
        const me = myTeam();
        if (!box || !me) return;

        const own = roster(me.id);
        const byRole = role => own.filter(p => p.playerRole === role);
        const teamCounts = own.reduce((map, p) => {
            const club = p.playerTeam || players.find(x => String(x.id) === String(p.playerId))?.team || 'Sconosciuta';
            map[club] = (map[club] || 0) + 1;
            return map;
        }, {});
        const overloaded = Object.entries(teamCounts).filter(([, amount]) => amount > 4);
        const secure = own.filter(p => {
            const source = players.find(x => String(x.id) === String(p.playerId));
            return n(source?.pgv) >= 20;
        }).length;
        const goalkeepers = byRole('P');
        const goalkeeperTeams = [...new Set(goalkeepers.map(p => p.playerTeam || players.find(x => String(x.id) === String(p.playerId))?.team))];
        const sameClubPair = goalkeeperTeams.some(club => goalkeepers.filter(p => (p.playerTeam || players.find(x => String(x.id) === String(p.playerId))?.team) === club).length >= 2);
        const slots = Object.keys(goals).map(role => `${roles[role]}: ${byRole(role).length}/${goals[role]}`).join(' · ');
        const alerts = [];

        if (sameClubPair && goalkeeperTeams.length < 2) alerts.push('Hai la coppia di portieri ma manca un terzo titolare di un’altra squadra.');
        if (!sameClubPair && goalkeepers.length > 0) alerts.push('Per la porta valuta titolare + riserva della stessa squadra.');
        if (overloaded.length) alerts.push(`Diversifica: ${overloaded.map(([club, amount]) => `${club} (${amount})`).join(', ')} supera il limite indicativo di 4 giocatori.`);
        if (secure < Math.min(own.length, 11)) alerts.push(`Hai ${secure}/${own.length} giocatori con almeno 20 presenze storiche: aggiungi titolari affidabili per coprire assenze e turnover.`);
        if (!alerts.length) alerts.push('Struttura attuale equilibrata: continua a privilegiare titolarità, bonus e diversificazione.');

        box.innerHTML = `<p class="text-xs font-bold uppercase text-emerald-600">Audit costruzione rosa · Squadra 1</p><p class="mt-1 text-xl font-black">${own.length ? 'Controlli strategici attivi' : 'Inizia a costruire la rosa'}</p><p class="mt-2 text-sm text-slate-700"><b>Composizione:</b> ${slots}</p><div class="mt-3 space-y-2">${alerts.map(text => `<p class="rounded-xl bg-white p-3 text-sm text-emerald-950">${text}</p>`).join('')}</div><p class="mt-3 text-xs text-slate-600">Le presenze storiche sono un indicatore di affidabilità. Rigoristi, infortuni, ballottaggi e calendario richiedono dati aggiuntivi prima di poterli valutare automaticamente.</p>`;
    }
    function squads() {
        $('squads').innerHTML = teams.map(t => {
            const r = roster(t.id), mine = String(t.id) === '1'; return `<article class="rounded-2xl border p-4 ${mine ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200'}"><div class="flex justify-between"><b>${mine ? '★ La tua squadra · ' : ''}${esc(t.name)}</b><b>${m(t.credits)} cr</b></div><p class="mt-1 text-xs text-slate-500">${r.length}/25 · P ${count(t.id, 'P')} · D ${count(t.id, 'D')} · C ${count(t.id, 'C')} · A ${count(t.id, 'A')}</p><p class="mt-3 text-xs text-slate-600">${r.length ? r.slice(-5).map(p => `${esc(p.playerName)} (${p.price})`).join(' · ') : 'Nessun acquisto'}</p></article>`
        }).join('')
    }
    function recent() {
        $('recentPurchases').innerHTML = state.purchases.length ? state.purchases.slice().reverse().slice(0, 12).map(p => `<div class="flex justify-between border-b border-slate-100 py-3"><span><b>${esc(p.playerName)}</b><small class="block text-slate-500">${esc(p.teamName)}</small></span><b>${m(p.price)} cr</b></div>`).join('') : '<p class="py-6 text-center text-sm text-slate-400">Ancora nessun acquisto.</p>'
    }
    function renderAll() {
        renderPlayer(); stats(); squads(); recent(); advice(); auditRoster()
    };
    function save() {
        localStorage.setItem('fantaAuctionState', JSON.stringify({
            purchases: state.purchases, teams
        }))
    }
    function buy() {
        const buyer = selectedBuyer(), price = Math.floor(n($('purchasePrice').value)); if (!selected) return alert('Seleziona un giocatore.'); if (!price) return alert('Inserisci un prezzo valido.'); if (price > buyer.credits) return alert(`${buyer.name} non ha abbastanza crediti.`); buyer.credits -= price; state.purchases.push({
            playerId: selected.id, playerName: selected.name, playerRole: selected.role, playerTeam: selected.team, teamId: buyer.id, teamName: buyer.name, price, time: new Date().toISOString()
        }); selected = null; $('playerSearch').value = ''; $('purchasePrice').value = ''; save(); renderSelect(); renderAll()
    }
    function reset() {
        if (!confirm('Azzerare tutti gli acquisti salvati in questo browser?')) return; teams.forEach(t => t.credits = n(settings.initialCredits || 750)); state.purchases = []; selected = null; save(); renderSelect(); renderAll()
    }
    async function init() {
        [players, teams, settings] = await Promise.all([fetch('./data/players.json').then(r => r.json()), fetch('./data/teams.json').then(r => r.json()), fetch('./data/settings.json').then(r => r.json())]); try {
            const saved = JSON.parse(localStorage.getItem('fantaAuctionState')); if (saved) {
                state.purchases = Array.isArray(saved.purchases) ? saved.purchases : []; if (Array.isArray(saved.teams)) teams = teams.map(t => ({
                    ...t, credits: n(saved.teams.find(x => String(x.id) === String(t.id))?.credits ?? t.credits)
                }))
            }
        } catch {

        } renderSelect(); renderAll(); $('playerSearch').oninput = search; $('buyerTeam').onchange = renderAll; $('purchasePrice').oninput = advice; $('buyButton').onclick = buy; $('resetAuction').onclick = reset; document.addEventListener('click', x => {
            if (!x.target.closest('#playerSearch') && !x.target.closest('#playerSuggestions')) $('playerSuggestions').classList.add('hidden')
        })
    }
    return {
        init
    }
})();
document.addEventListener('DOMContentLoaded', () => AuctionApp.init().catch(error => {
    document.querySelector('#app').innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-red-700">Errore di caricamento: ${error.message}</p>`
}));
