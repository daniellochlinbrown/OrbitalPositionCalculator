// src/controllers/orbitsController.js
const satellite = require('satellite.js');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { getOrFetchTLE, getTLEFromDbOnly } = require('../utils/tleStore');

function propagateLLA(satrec, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv?.position) return null;
  const gmst = satellite.gstime(date);
  const lla = satellite.eciToGeodetic(pv.position, gmst);
  return {
    t: Math.floor(date.getTime() / 1000),
    lla: {
      lat: satellite.degreesLat(lla.latitude),
      lon: satellite.degreesLong(lla.longitude),
      alt: lla.height * 1.0,
    },
  };
}
const isStale = (epoch, days = 14) => !epoch || (Date.now() - new Date(epoch).getTime()) > days * 86400 * 1000;

// Default endpoints (may fetch if missing/stale)
exports.getNow = async (req, res) => {
  try {
    if (req.query.db === '1') return exports.getNowDbOnly(req, res);  // optional shortcut
    const satid = String(req.params.satid || '').trim();
    const { tle1, tle2, epoch, name, source } = await getOrFetchTLE(prisma, satid, { maxAgeHours: 12, allowFetch: true });
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const now = new Date();
    const p = propagateLLA(satrec, now);
    if (!p) return res.status(500).json({ error: 'Propagation failed' });
    res.json({ satid, name, epoch, stale: isStale(epoch), source, timestamp: p.t, lla: p.lla });
  } catch (e) { res.status(500).json({ error: e.message || 'Failed' }); }
};

exports.simulate = async (req, res) => {
  try {
    if (req.query.db === '1') return exports.simulateDbOnly(req, res); // optional shortcut
    const { satid, startUtc, durationSec = 600, stepSec = 1 } = req.body || {};
    const { tle1, tle2, epoch, name, source } = await getOrFetchTLE(prisma, satid, { maxAgeHours: 12, allowFetch: true });
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const start = startUtc ? dayjs.utc(startUtc) : dayjs.utc();
    const steps = Math.max(1, Math.floor(Number(durationSec) / Number(stepSec)));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const d = start.add(i * stepSec, 'second').toDate();
      const p = propagateLLA(satrec, d);
      if (p) points.push(p);
    }
    res.json({ satid, name, epoch, stale: isStale(epoch), source, info: { startUtc: start.toISOString(), durationSec, stepSec, count: points.length }, points });
  } catch (e) { res.status(500).json({ error: e.message || 'Failed' }); }
};

// ✅ DB-only endpoints (never fetch)
exports.getNowDbOnly = async (req, res) => {
  try {
    const satid = String(req.params.satid || '').trim();
    const { tle1, tle2, epoch, name, source } = await getTLEFromDbOnly(prisma, satid);
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const now = new Date();
    const p = propagateLLA(satrec, now);
    if (!p) return res.status(500).json({ error: 'Propagation failed' });
    res.json({ satid, name, epoch, stale: isStale(epoch), source, timestamp: p.t, lla: p.lla });
  } catch (e) { res.status(500).json({ error: e.message || 'Failed' }); }
};

exports.simulateDbOnly = async (req, res) => {
  try {
    const { satid, startUtc, durationSec = 600, stepSec = 1 } = req.body || {};
    const { tle1, tle2, epoch, name, source } = await getTLEFromDbOnly(prisma, String(satid).trim());
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const start = startUtc ? dayjs.utc(startUtc) : dayjs.utc();
    const steps = Math.max(1, Math.floor(Number(durationSec) / Number(stepSec)));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const d = start.add(i * stepSec, 'second').toDate();
      const p = propagateLLA(satrec, d);
      if (p) points.push(p);
    }
    res.json({ satid, name, epoch, stale: isStale(epoch), source, info: { startUtc: start.toISOString(), durationSec, stepSec, count: points.length }, points });
  } catch (e) { res.status(500).json({ error: e.message || 'Failed' }); }
};
