const axios = require('axios');

// in-memory cache (satid -> {tle1,tle2,exp})
const cache = new Map();
const TTL_MS = 15 * 60 * 1000; // 15 minutes

async function fetchTLEFromCelestrak(satid) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satid}&FORMAT=TLE`;
  const { data: text } = await axios.get(url, { timeout: 8000, responseType: 'text' });
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  const i1 = lines.findIndex(l => l.startsWith('1 '));
  const i2 = i1 >= 0 ? lines.findIndex((l, idx) => idx > i1 && l.startsWith('2 ')) : -1;
  if (i1 < 0 || i2 < 0) throw new Error('TLE not found/invalid format');
  return { tle1: lines[i1], tle2: lines[i2] };
}

exports.getTLE = async (req, res) => {
  try {
    const satid = String(req.params.satid || '').trim();
    if (!satid) return res.status(400).json({ error: 'satid required' });

    const hit = cache.get(satid);
    const now = Date.now();
    if (hit && hit.exp > now) {
      return res.json({ satid, ...hit.data, cached: true });
    }

    const data = await fetchTLEFromCelestrak(satid);
    cache.set(satid, { data, exp: now + TTL_MS });
    res.json({ satid, ...data, cached: false });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch TLE' });
  }
};
