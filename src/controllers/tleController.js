const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const {
  getOrFetchTLE,
  fetchTLEFromCelestrak,
  upsertTLE,
} = require('../utils/tleStore');

const DEFAULT_MAX_AGE_HOURS = 12;

function isStale(epoch, days = 14) {
  if (!epoch) return true;
  return Date.now() - new Date(epoch).getTime() > days * 86400 * 1000;
}

async function getTLEById(satid, { maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const id = String(satid || '').trim();
  if (!id) throw new Error('satid required');

  const { tle1, tle2, name, epoch, source } = await getOrFetchTLE(prisma, id, { maxAgeHours });
  return {
    line1: tle1,
    line2: tle2,
    name,
    epoch,
    source,
    stale: isStale(epoch),
  };
}

// GET /tle/:satid
async function getTLERoute(req, res) {
  try {
    const satid = String(req.params.satid || '').trim();
    if (!satid) return res.status(400).json({ error: 'satid required' });

    const tle = await getTLEById(satid, { maxAgeHours: DEFAULT_MAX_AGE_HOURS });
    res.json({ satid, ...tle });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch TLE' });
  }
}

// POST /admin/tle/refresh/:satid
async function refreshTLERoute(req, res) {
  try {
    const satid = String(req.params.satid || req.body?.satid || '').trim();
    if (!satid) return res.status(400).json({ error: 'satid required' });

    const idNum = Number(satid);
    if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'satid must be numeric' });

    const { name, tle1, tle2 } = await fetchTLEFromCelestrak(idNum);
    const saved = await upsertTLE(prisma, { noradId: idNum, name, tle1, tle2 }, { keepHistory: true });

    res.json({
      satid,
      line1: saved.line1,
      line2: saved.line2,
      name: saved.name,
      epoch: saved.epoch,
      source: 'refresh',
      stale: isStale(saved.epoch),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to refresh TLE' });
  }
}

async function ensureManyTLERoute(req, res) {
  try {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = raw
      .map(v => parseInt(v, 10))
      .filter(n => Number.isFinite(n) && n > 0);

    const maxAgeHours = Number(req.body?.maxAgeHours) || DEFAULT_MAX_AGE_HOURS;

    if (!ids.length) return res.json({ items: [] });

    const items = [];
    for (const id of ids) {
      try {
        const { tle1, tle2, name, epoch, source } = await getOrFetchTLE(prisma, String(id), { maxAgeHours });
        items.push({
          noradId: id,
          name: name || null,
          epoch: epoch || null,
          source: source || 'db',
          stale: isStale(epoch),
        });
      } catch (err) {
        items.push({ noradId: id, error: err?.message || 'Failed' });
      }
    }

    res.json({ items });
  } catch (e) {
    console.error('POST /tle/ensure error:', e);
    res.status(500).json({ error: e.message || 'Failed to ensure TLEs' });
  }
}

module.exports = {
  getTLEById,
  getTLERoute,
  refreshTLERoute,
  ensureManyTLERoute,
};
