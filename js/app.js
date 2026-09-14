const Dashboard = (() => {
    const m = v => Number(v || 0).toLocaleString('it-IT'),
        e = v => String(v ?? '').replace(/[&<>"']/g,
            c => (
                { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
                [c]));
    async function init() {
        const [t,
            s] = await Promise.all([fetch('./data/teams.json').then(r => r.json()),
            fetch('./data/settings.json').then(r => r.json())]);
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem('fantaAuctionState'))
        }
        catch {
        }
        const p = saved?.purchases || [],
            credits = new Map((saved?.teams || []).map(x => [String(x.id),
            x.credits])),
            teams = t.map(x => ({
                ...x,
                credits: credits.has(String(x.id)) ? credits.get(String(x.id)) : x.credits
            }
            )),
            spent = p.reduce((a,
                x) => a + Number(x.price || 0),
                0);
        document.querySelector('#summary').innerHTML = [['Squadre',
            teams.length,
            'fantallenatori'],
        ['Acquisti',
            p.length,
            'giocatori assegnati'],
        ['Crediti spesi',
            m(spent),
            `su ${m(teams.length * Number(s.initialCredits || 750))}`]].map(x => `<article class="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p class="text-xs font-bold uppercase tracking-wide text-slate-500">${x[0]}</p><p class="mt-2 text-3xl font-black">${x[1]}</p><p class="mt-1 text-sm text-slate-400">${x[2]}</p></article>`).join('');
        document.querySelector('#teams').innerHTML = teams.map(team => {
            const r = p.filter(x => String(x.teamId) === String(team.id));
            return `<article class="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div class="flex items-start justify-between gap-3"><h3 class="font-bold">${e(team.name)}</h3><span class="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">${r.length}/25</span></div><p class="mt-5 text-3xl font-black text-emerald-300">${m(team.credits)}</p><p class="text-sm text-slate-400">crediti disponibili</p><p class="mt-4 truncate text-xs text-slate-500">${r.length ? r.slice(-3).map(x => e(x.playerName)).join(' · ') : 'Nessun acquisto'}</p></article>`
        }
        ).join('')
    }
    init().catch(error => document.querySelector('#teams').innerHTML = `<p class="text-red-300">Impossibile caricare i dati: ${e(error.message)}</p>`);
}
)();
