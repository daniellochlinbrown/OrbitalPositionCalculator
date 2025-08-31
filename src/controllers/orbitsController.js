const satellite = require('satellite.js');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { getTLEFromDbOnly } = require('../utils/tleStore');

// ---- helpers ----

/** Primary CPU-intensive task: single-step propagation to LLA */
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
      alt: lla.height * 1.0, // km
    },
  };
}

const isStale = (epoch, days = 1) =>
  !epoch || (Date.now() - new Date(epoch).getTime()) > days * 86400 * 1000;

function resolveStartDate(startUtc) {
  if (typeof startUtc === 'string' && startUtc) {
    const d = dayjs.utc(startUtc);
    if (d.isValid()) return d.toDate();
    throw new Error('Invalid startUtc (ISO expected)');
  }
  return new Date();
}

function clampAndValidate(durationSec, stepSec) {
  const dur = Number(durationSec);
  const step = Number(stepSec);
  if (!Number.isFinite(dur) || dur <= 0) throw new Error('durationSec must be > 0');
  if (!Number.isFinite(step) || step <= 0) throw new Error('stepSec must be > 0');

  const steps = Math.floor(dur / step);
  if (steps < 1) throw new Error('Too few steps (durationSec/stepSec)');
  const MAX_STEPS = 100000; // guardrail to prevent overloading
  if (steps > MAX_STEPS) {
    const err = new Error(`Too many steps (${steps}); reduce durationSec or increase stepSec`);
    err.code = 'TOO_MANY_STEPS';
    throw err;
  }
  return { dur, step, steps };
}

/** GET current position from DB-only */
exports.getNow = async (req, res) => {
  try {
    const satid = String(req.params.satid || '').trim();
    const idNum = Number(satid);
    if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'satid must be numeric' });

    let tle;
    try {
      tle = await getTLEFromDbOnly(prisma, satid);
    } catch (e) {
      return res.status(404).json({ error: 'TLE not in DB', detail: String(e?.message || e) });
    }

    const { tle1, tle2, epoch, name, source } = tle;

    let satrec;
    try {
      satrec = satellite.twoline2satrec(tle1, tle2);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid TLE in DB', detail: String(e?.message || e) });
    }

    const now = new Date();
    const p = propagateLLA(satrec, now);
    if (!p) return res.status(500).json({ error: 'Propagation failed' });

    res.json({
      satid,
      name,
      epoch,
      stale: isStale(epoch),
      source,
      timestamp: p.t,
      lla: p.lla,
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal error', detail: String(e?.message || e) });
  }
};

/** POST simulate (DB-only) */
exports.simulate = async (req, res) => {
  try {
    const { satid, startUtc, durationSec = 600, stepSec = 1 } = req.body || {};
    const idNum = Number(satid);
    if (!Number.isFinite(idNum)) return res.status(400).json({ error: 'satid must be numeric' });

    let tle;
    try {
      tle = await getTLEFromDbOnly(prisma, String(satid).trim());
    } catch (e) {
      return res.status(404).json({ error: 'TLE not in DB', detail: String(e?.message || e) });
    }

    const { tle1, tle2, epoch, name, source } = tle;

    let satrec;
    try {
      satrec = satellite.twoline2satrec(tle1, tle2);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid TLE in DB', detail: String(e?.message || e) });
    }

    let startDate;
    try {
      startDate = resolveStartDate(startUtc);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    let cfg;
    try {
      cfg = clampAndValidate(durationSec, stepSec);
    } catch (e) {
      if (e.code === 'TOO_MANY_STEPS') return res.status(413).json({ error: e.message });
      return res.status(400).json({ error: e.message });
    }
    const { dur, step, steps } = cfg;

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const d = new Date(startDate.getTime() + i * step * 1000);
      const p = propagateLLA(satrec, d);
      if (p) points.push(p);
    }

    res.json({
      satid: String(satid),
      name,
      epoch,
      stale: isStale(epoch),
      source,
      info: {
        startUtc: dayjs.utc(startDate).toISOString(),
        durationSec: dur,
        stepSec: step,
        count: points.length,
      },
      points,
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal error', detail: String(e?.message || e) });
  }
};

exports.getNowDbOnly = exports.getNow;
exports.simulateDbOnly = exports.simulate;
