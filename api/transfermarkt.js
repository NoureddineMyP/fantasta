// Proxy verso l'API interna JSON di Transfermarkt (stessa usata dal sito).
// Normalizza le risposte nello shape atteso da js/transfermarkt.js.
const BASE = process.env.TRANSFERMARKT_API_BASE_URL || 'https://tmapi-alpha.transfermarkt.technology';
const TM_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
  Origin: 'https://www.transfermarkt.it',
  Referer: 'https://www.transfermarkt.it/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
};

function n(v) {
  const value = Number(v);
  return Number.isFinite(value) ? value : 0;
}

function unwrap(json, fallbackMessage) {
  if (json && json.success === false) {
    const err = new Error(json.message || fallbackMessage);
    err.status = 502;
    throw err;
  }
  return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
}

async function fetchTm(path, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: TM_HEADERS, signal: controller.signal });
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'Timeout nel contattare Transfermarkt.'
      : `Impossibile contattare Transfermarkt: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.text();
  let json = {};
  try { json = raw ? JSON.parse(raw) : {}; } catch { /* html di errore */ }
  if (!response.ok) {
    const err = new Error(json.message || `Errore ${response.status} da Transfermarkt.`);
    err.status = response.status;
    throw err;
  }
  return unwrap(json, 'Risposta Transfermarkt non valida.');
}

async function safe(fn) {
  try {
    return await fn();
  } catch (error) {
    return { error: error.message };
  }
}

function idsQuery(ids) {
  return [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))]
    .slice(0, 40)
    .map(id => `ids[]=${encodeURIComponent(id)}`)
    .join('&');
}

async function clubNames(ids) {
  const query = idsQuery(ids);
  if (!query) return {};
  const clubs = await fetchTm(`/clubs?${query}`);
  const map = {};
  for (const club of Array.isArray(clubs) ? clubs : []) {
    map[String(club.id)] = club.name || club.baseDetails?.shortName || '';
  }
  return map;
}

function currentClub(player) {
  const assignments = player.clubAssignments || [];
  return assignments.find(a => a.type === 'current') || assignments[0] || null;
}

function heightCm(height) {
  const value = n(height);
  if (!value) return null;
  return value < 3 ? Math.round(value * 100) : Math.round(value);
}

function mapSearchPlayer(player, clubs) {
  const club = currentClub(player);
  return {
    id: String(player.id),
    name: player.name || player.displayName || player.shortName || '',
    age: player.lifeDates?.age ?? null,
    position: player.attributes?.position?.name || player.attributes?.positionGroupName || '',
    club: { name: (club && clubs[String(club.clubId)]) || '' }
  };
}

function mapProfile(player, clubs) {
  const club = currentClub(player);
  const mv = player.marketValueDetails?.current?.value;
  return {
    name: player.name || '',
    imageUrl: player.portraitUrl || null,
    age: player.lifeDates?.age ?? null,
    foot: player.attributes?.preferredFoot?.name || '',
    height: heightCm(player.attributes?.height),
    shirtNumber: club?.shirtNumber || null,
    marketValue: mv ?? null,
    position: { main: player.attributes?.position?.name || player.attributes?.positionGroupName || '' },
    club: { name: (club && clubs[String(club.clubId)]) || '' }
  };
}

function mapMarketValue(data) {
  const history = (data.history || []).map(item => ({
    marketValue: item.marketValue?.value ?? null,
    date: item.marketValue?.determined || null,
    clubName: ''
  }));
  return { marketValueHistory: history };
}

function mapInjuries(data) {
  return {
    injuries: (data.injuries || []).map(item => ({
      injury: item.name || '',
      fromDate: item.start || null,
      untilDate: item.end || null,
      gamesMissed: n(item.missedGamesCount),
      seasonId: item.seasonId != null ? String(item.seasonId) : null
    }))
  };
}

function mapTransfers(data, clubs) {
  const history = data.history || {};
  const row = (item, upcoming) => ({
    date: item.details?.date || null,
    fee: item.details?.fee?.value ?? null,
    upcoming,
    clubFrom: { name: clubs[String(item.transferSource?.clubId)] || '' },
    clubTo: { name: clubs[String(item.transferDestination?.clubId)] || '' }
  });
  return {
    transfers: [
      ...(history.terminated || []).map(item => row(item, Boolean(item.details?.isPending))),
      ...(history.pending || []).map(item => row(item, true))
    ]
  };
}

function aggregateStats(data) {
  const bySeason = {};
  for (const game of data.performance || []) {
    const seasonID = String(game.gameInformation?.seasonId ?? game.gameInformation?.season?.id ?? '');
    if (!seasonID) continue;
    const stats = game.statistics || {};
    const played = stats.generalStatistics?.participationState === 'played';
    const minutes = n(stats.playingTimeStatistics?.playedMinutes);
    const goals = n(stats.goalStatistics?.goalsScoredTotalOfficial ?? stats.goalStatistics?.goalsScoredTotal);
    const assists = n(stats.goalStatistics?.assistsOfficial ?? stats.goalStatistics?.assists);
    if (!played && minutes <= 0 && goals <= 0 && assists <= 0) continue;
    const row = (bySeason[seasonID] ??= { seasonID, appearances: 0, goals: 0, assists: 0, minutesPlayed: 0 });
    if (played || minutes > 0) row.appearances += 1;
    row.goals += goals;
    row.assists += assists;
    row.minutesPlayed += minutes;
  }
  return { stats: Object.values(bySeason) };
}

async function searchPlayers(query) {
  const search = await fetchTm(`/quick-search?term=${encodeURIComponent(query)}`);
  const playerIds = (search.result?.playerIds || []).slice(0, 8);
  if (!playerIds.length) return { results: [] };
  const players = await fetchTm(`/players?${idsQuery(playerIds)}`);
  const list = Array.isArray(players) ? players : [];
  const byId = Object.fromEntries(list.map(player => [String(player.id), player]));
  const ordered = playerIds.map(id => byId[String(id)]).filter(Boolean);
  const clubs = await clubNames(ordered.map(player => currentClub(player)?.clubId));
  return { results: ordered.map(player => mapSearchPlayer(player, clubs)) };
}

async function fullPlayer(id) {
  const [profileRaw, marketRaw, statsRaw, injuriesRaw, transfersRaw] = await Promise.all([
    safe(() => fetchTm(`/player/${encodeURIComponent(id)}`)),
    safe(() => fetchTm(`/player/${encodeURIComponent(id)}/market-value-history`)),
    safe(() => fetchTm(`/player/${encodeURIComponent(id)}/performance-game`, 20000)),
    safe(() => fetchTm(`/player/${encodeURIComponent(id)}/injury`)),
    safe(() => fetchTm(`/transfer/history/player/${encodeURIComponent(id)}`))
  ]);

  const clubIds = [];
  if (!profileRaw.error) {
    const club = currentClub(profileRaw);
    if (club?.clubId) clubIds.push(club.clubId);
  }
  if (!transfersRaw.error) {
    const history = transfersRaw.history || {};
    for (const item of [...(history.terminated || []), ...(history.pending || [])]) {
      clubIds.push(item.transferSource?.clubId, item.transferDestination?.clubId);
    }
  }
  const clubs = await safe(() => clubNames(clubIds));
  const clubMap = clubs.error ? {} : clubs;

  return {
    id: String(id),
    updatedAt: new Date().toISOString(),
    profile: profileRaw.error ? profileRaw : mapProfile(profileRaw, clubMap),
    marketValue: marketRaw.error ? marketRaw : mapMarketValue(marketRaw),
    stats: statsRaw.error ? statsRaw : aggregateStats(statsRaw),
    injuries: injuriesRaw.error ? injuriesRaw : mapInjuries(injuriesRaw),
    transfers: transfersRaw.error ? transfersRaw : mapTransfers(transfersRaw, clubMap)
  };
}

module.exports = async (req, res) => {
  const { action, q, id } = req.query || {};
  try {
    if (action === 'search') {
      if (!q) return res.status(400).json({ error: 'Parametro "q" mancante.' });
      return res.status(200).json(await searchPlayers(q));
    }
    if (action === 'full') {
      if (!id) return res.status(400).json({ error: 'Parametro "id" mancante.' });
      return res.status(200).json(await fullPlayer(id));
    }
    return res.status(400).json({ error: 'Azione non valida: usare "search" o "full".' });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Errore nel recupero dati da Transfermarkt.' });
  }
};
