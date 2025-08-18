// src/controllers/tleController.js
const axios = require('axios');

const cache = new Map();                  // satid -> { data:{line1,line2}, exp }
const TTL_MS = 15 * 60 * 1000;

async function fetchTLEFromCelestrak(satid) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${encodeURIComponent(satid)}&FORMAT=TLE`;
  const resp = await axios.get(url, { timeout: 10000, responseType: 'text', validateStatus: () => true });
  if (!resp || typeof resp.status === 'undefined') throw new Error('No HTTP response');
  if (resp.status !== 200) {
    const snippet = String(resp.data || '').slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`TLE fetch failed ${resp.status}: ${snippet}`);
  }

  const lines = String(resp.data || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let line1 = null, line2 = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      line1 = lines[i];
      line2 = lines[i + 1];
      break;
    }
  }
  if (!line1 || !line2) {
    if (lines.length >= 2 && lines[0].startsWith('1 ') && lines[1].startsWith('2 ')) {
      line1 = lines[0]; line2 = lines[1];
    }
  }
  if (!line1 || !line2) throw new Error(`TLE not found/invalid format (got ${lines.length} lines)`);
  return { line1, line2 };
}

// Pure helper
async function getTLEById(satid) {
  const key = String(satid || '').trim();
  if (!key) throw new Error('satid required');
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.data;
  const data = await fetchTLEFromCelestrak(key);
  cache.set(key, { data, exp: now + TTL_MS });
  return data;
}

// Express route wrapper
async function getTLERoute(req, res) {
  try {
    const satid = String(req.params.satid || '').trim();
    if (!satid) return res.status(400).json({ error: 'satid required' });
    const now = Date.now();
    const hit = cache.get(satid);
    if (hit && hit.exp > now) return res.json({ satid, ...hit.data, cached: true });
    const data = await fetchTLEFromCelestrak(satid);
    cache.set(satid, { data, exp: now + TTL_MS });
    res.json({ satid, ...data, cached: false });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch TLE' });
  }
}

module.exports = { getTLEById, getTLERoute };
