// Proxy verso l'istanza pubblica di transfermarkt-api (github.com/felipeall/transfermarkt-api).
// Centralizza le chiamate lato server per evitare CORS ed evitare di superare il rate limit
// pubblico (2 richieste ogni 3 secondi): per l'azione "full" le richieste vengono spaziate.
const BASE = process.env.TRANSFERMARKT_API_BASE_URL || 'https://transfermarkt-api.fly.dev';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchOnce(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { signal: controller.signal });
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'Timeout nel contattare transfermarkt-api (il servizio pubblico potrebbe essere lento o offline).'
      : `Impossibile contattare transfermarkt-api: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { /* risposta non JSON (es. pagina di errore html) */ }
  if (!response.ok) {
    if (response.status === 403) {
      const err = new Error('Transfermarkt ha bloccato le richieste provenienti dall\'IP condiviso dell\'istanza pubblica (403 Forbidden) — non è un problema del progetto. Serve ospitare una propria istanza di transfermarkt-api su un IP non ancora bloccato.');
      err.status = 403;
      throw err;
    }
    const detail = data.detail || (raw ? raw.slice(0, 200) : null);
    const err = new Error(detail ? `${detail} (HTTP ${response.status})` : `Errore ${response.status} da transfermarkt-api.`);
    err.status = response.status;
    throw err;
  }
  return data;
}

// L'istanza pubblica gratuita a volte restituisce 500/502/503 in modo transitorio
// (scraping fallito, rate limit, cold start): un solo retry con breve attesa risolve
// la maggior parte dei casi senza mascherare un errore persistente.
async function fetchJson(path, attempt = 1) {
  try {
    return await fetchOnce(path);
  } catch (error) {
    const transient = !error.status || error.status >= 500;
    if (transient && attempt < 2) {
      await sleep(1000);
      return fetchJson(path, attempt + 1);
    }
    throw error;
  }
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
