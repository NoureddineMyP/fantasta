// Proxy verso l'istanza pubblica di transfermarkt-api (github.com/felipeall/transfermarkt-api).
// Centralizza le chiamate lato server per evitare CORS ed evitare di superare il rate limit
// pubblico (2 richieste ogni 3 secondi): per l'azione "full" le richieste vengono spaziate.
const BASE = process.env.TRANSFERMARKT_API_BASE_URL || 'https://transfermarkt-api.fly.dev';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(path, attempt = 1) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  } catch (networkError) {
    throw new Error(`Impossibile raggiungere ${BASE} (${networkError.message}).`);
  }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* risposta non JSON (es. pagina di errore) */ }

  if (!response.ok) {
    // Le richieste alla demo pubblica falliscono spesso per "cold start" di Fly.io
    // o per blocchi temporanei da parte di Transfermarkt: un retry aiuta parecchio.
    if (response.status >= 500 && attempt < 2) {
      await sleep(1500);
      return fetchJson(path, attempt + 1);
    }
    const detail = data.detail || (raw ? raw.slice(0, 200) : null);
    throw new Error(`Errore ${response.status} da transfermarkt-api su ${path}${detail ? `: ${detail}` : ' (nessun dettaglio restituito, probabile sovraccarico della demo pubblica).'}`);
  }
  return data;
}

module.exports = async (req, res) => {
  const { action, q, id } = req.query;
  try {
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Parametro "q" mancante.' });
      const data = await fetchJson(`/players/search/${encodeURIComponent(q)}?page_number=1`);
      return res.status(200).json(data);
    }
    if (action === 'full') {
      if (!id) return res.status(400).json({ error: 'Parametro "id" mancante.' });
      const sections = [
        ['profile', `/players/${id}/profile`],
        ['marketValue', `/players/${id}/market_value`],
        ['stats', `/players/${id}/stats`],
        ['injuries', `/players/${id}/injuries`],
        ['transfers', `/players/${id}/transfers`],
        ['achievements', `/players/${id}/achievements`]
      ];
      const payload = { id, updatedAt: new Date().toISOString() };
      for (const [key, path] of sections) {
        try {
          payload[key] = await fetchJson(path);
        } catch (error) {
          payload[key] = { error: error.message };
        }
        await sleep(800); // rispetta il rate limit pubblico (2 richieste/3s)
      }
      return res.status(200).json(payload);
    }
    return res.status(400).json({ error: 'Azione non valida: usare "search" o "full".' });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Errore nel recupero dati da Transfermarkt.' });
  }
};
