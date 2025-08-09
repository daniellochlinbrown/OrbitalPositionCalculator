const satellite = require('satellite.js');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const { getTLE } = require('./tleController'); 
const axios = require('axios');

async function getTLEDirect(satid) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satid}&FORMAT=TLE`;
  const { data: text } = await axios.get(url, { timeout: 8000, responseType: 'text' });
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  const i1 = lines.findIndex(l => l.startsWith('1 '));
  const i2 = i1 >= 0 ? lines.findIndex((l, idx) => idx > i1 && l.startsWith('2 ')) : -1;
  if (i1 < 0 || i2 < 0) throw new Error('TLE not found/invalid format');
  return { tle1: lines[i1], tle2: lines[i2] };
}

function propagateLLA(satrec, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv.position) return null;
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

// GET /now/:satid  -> current lat/lon/alt (km)
exports.getNow = async (req, res) => {
  try {
    const satid = String(req.params.satid || '').trim();
    if (!satid) return res.status(400).json({ error: 'satid required' });

    const { tle1, tle2 } = await getTLEDirect(satid);
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const now = new Date();
    const point = propagateLLA(satrec, now);
    if (!point) return res.status(500).json({ error: 'Propagation failed' });

    res.json({
      satid,
      timestamp: point.t,
      lla: point.lla, // { lat, lon, alt(km) }
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to compute current position' });
  }
};

// POST /simulate  body: { satid, startUtc?, durationSec=600, stepSec=1 }
exports.simulate = async (req, res) => {
  try {
    const {
      satid,
      startUtc,
      durationSec = 600,
      stepSec = 1,
    } = req.body || {};

    if (!satid) return res.status(400).json({ error: 'satid required' });

    const { tle1, tle2 } = await getTLEDirect(String(satid).trim());
    const satrec = satellite.twoline2satrec(tle1, tle2);

    const start = startUtc ? dayjs.utc(startUtc) : dayjs.utc();
    const steps = Math.max(1, Math.floor(Number(durationSec) / Number(stepSec)));

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const d = start.add(i * stepSec, 'second').toDate();
      const p = propagateLLA(satrec, d);
      if (p) points.push(p);
    }

    res.json({
      info: {
        satid,
        startUtc: start.toISOString(),
        durationSec: Number(durationSec),
        stepSec: Number(stepSec),
        count: points.length,
      },
      points,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to simulate orbit' });
  }
};
