// src/controllers/tleController.js
// Uses DB (Prisma Tle) as the main db
// - getTLEById(): returns { line1, line2, name, epoch, source, stale }
// - getTLERoute(): Express handler for GET /tle/:satid
// - refreshTLERoute(): Express handler to force-refresh a TLE from CelesTrak

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

/**
 * Express: GET /tle/:satid
 * Responds with { satid, line1, line2, name, epoch, source, stale }
 */
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

/**
 * Express: POST /admin/tle/refresh/:satid  (or GET, up to you)
 * Forces a fetch from CelesTrak and upserts into DB; returns fresh TLE.
 */
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

module.exports = {
  getTLEById,
  getTLERoute,
  refreshTLERoute,
};
