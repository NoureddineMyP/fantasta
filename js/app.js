async function loadTeams() {
  const res = await fetch('./data/teams.json');
  const teams = await res.json();
  document.querySelector('#teams').innerHTML = teams.map(t => `
    <article class="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div class="font-semibold">${t.name}</div>
      <div class="text-3xl font-bold mt-2">${t.credits}</div>
      <div class="text-slate-500 text-sm">crediti disponibili</div>
    </article>
  `).join('');
}
loadTeams();
