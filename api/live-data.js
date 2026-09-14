const { list, put } = require('@vercel/blob');

const path = 'live/serie-a-2026.json';
const footballApi = 'https://v3.football.api-sports.io';

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

async function football(resource, key) {
  const params = new URLSearchParams({ league: '135', season: '2026' });
  if (resource === 'fixtures') params.set('next', '10');
  const response = await fetch(`${footballApi}/${resource}?${params}`, {
    headers: { 'x-apisports-key': key }
  });
  const data = await response.json();
  if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
    throw new Error('API-Football non ha restituito dati validi.');
  }
  return data.response || [];
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
  if (!process.env.API_FOOTBALL_KEY) return res.status(503).json({ error: 'API_FOOTBALL_KEY non configurata.' });

  try {
    const [injuries, fixtures] = await Promise.all([
      football('injuries', process.env.API_FOOTBALL_KEY),
      football('fixtures', process.env.API_FOOTBALL_KEY)
    ]);
    const payload = { season: '2026/27', fetchedAt: new Date().toISOString(), injuries, fixtures };
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
