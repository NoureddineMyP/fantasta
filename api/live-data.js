const { list, put } = require('@vercel/blob');

const path = 'live/serie-a-2026.json';
const footballDataApi = 'https://api.football-data.org/v4';
const competition = 'SA'; // Serie A, inclusa nel piano gratuito di football-data.org

async function currentBlob() {
  const { blobs } = await list({ prefix: path, limit: 1 });
  return blobs.find(blob => blob.pathname === path) || null;
}

async function readCurrent() {
  const blob = await currentBlob();
  if (!blob) return null;
  const response = await fetch(blob.url, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

async function footballData(resource, key, params = {}) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${footballDataApi}/${resource}${query.toString() ? `?${query}` : ''}`, {
    headers: { 'X-Auth-Token': key }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'football-data.org non ha restituito dati validi.');
  }
  return data;
}

module.exports = async (req, res) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN non configurato: collega uno store Blob al progetto e fai redeploy.' });
  }
  if (req.method === 'GET') {
    try {
      const data = await readCurrent();
      return data ? res.status(200).json(data) : res.status(404).json({ error: 'Nessun aggiornamento live ancora salvato.' });
    } catch (error) {
      return res.status(503).json({ error: `Impossibile accedere a Vercel Blob: ${error.message}` });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito.' });
  if (!process.env.FOOTBALL_DATA_API_KEY) return res.status(503).json({ error: 'FOOTBALL_DATA_API_KEY non configurata.' });

  try {
    // football-data.org (piano free) espone calendario e classifica, ma non gli infortuni:
    // usiamo le prossime partite di Serie A per segnalare gli impegni della rosa.
    const key = process.env.FOOTBALL_DATA_API_KEY;
    const upcoming = await footballData(`competitions/${competition}/matches`, key, { status: 'SCHEDULED', limit: '60' });
    const matches = (upcoming.matches || []).map(match => ({
      id: match.id,
      utcDate: match.utcDate,
      matchday: match.matchday,
      status: match.status,
      homeTeam: match.homeTeam?.name,
      awayTeam: match.awayTeam?.name
    }));
    const payload = { season: '2026/27', fetchedAt: new Date().toISOString(), matches };
    await put(path, JSON.stringify(payload), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60
    });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Impossibile aggiornare i dati live.' });
  }
};
