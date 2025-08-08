const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const satellite = require('satellite.js');

const API_KEY = process.env.N2YO_API_KEY;
const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';

async function fetchTLE(satid) {
  if (API_KEY) {
    try {
      const { data } = await axios.get(`${N2YO_BASE}/tle/${satid}&apiKey=${API_KEY}`, { timeout: 8000 });
      if (data?.tle) {
        const lines = data.tle.split('\n').map(s => s.trim()).filter(Boolean);
        if (lines.length >= 2) return { tle1: lines[0], tle2: lines[1] };
      }
    } catch (_) {}
  }
  // fallback: Celestrak
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satid}&FORMAT=TLE`;
  const { data: text } = await axios.get(url, { timeout: 8000, responseType: 'text' });
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  const i1 = lines.findIndex(l => l.startsWith('1 '));
  const i2 = i1 >= 0 ? lines.findIndex((l, idx) => idx > i1 && l.startsWith('2 ')) : -1;
  if (i1 >= 0 && i2 >= 0) return { tle1: lines[i1], tle2: lines[i2] };
  throw new Error('Unable to fetch TLE from N2YO or Celestrak');
}

function propagateToLLA(satrec, date) {
  const pv = satellite.propagate(satrec, date);
  if (!pv.position) return null;
  const gmst = satellite.gstime(date);
  const lla = satellite.eciToGeodetic(pv.position, gmst); // rad
  return {
    t: Math.floor(date.getTime() / 1000),
    lla: {
      lat: satellite.degreesLat(lla.latitude),
      lon: satellite.degreesLong(lla.longitude),
      alt: lla.height * 1.0, // km
    },
  };
}

async function simulateOrbit(req, res) {
  try {
    const {
      satid,
      tle1,
      tle2,
      startUtc,
      durationSec = 600,
      stepSec = 1,
    } = req.body || {};

    if ((!tle1 || !tle2) && !satid) {
      return res.status(400).json({ error: 'Provide (tle1 & tle2) or satid' });
    }

    let t1 = tle1, t2 = tle2;
    if ((!t1 || !t2) && satid) {
      const tle = await fetchTLE(satid);
      t1 = tle.tle1; t2 = tle.tle2;
    }

    const satrec = satellite.twoline2satrec(t1, t2);
    const start = startUtc ? dayjs.utc(startUtc) : dayjs.utc();
    const steps = Math.max(1, Math.floor(Number(durationSec) / Number(stepSec)));

    const points = [];
    for (let i = 0; i <= steps; i++) {
      const d = start.add(i * stepSec, 'second').toDate();
      const p = propagateToLLA(satrec, d);
      if (p) points.push(p);
    }

    return res.json({
      info: {
        satid: satid ?? null,
        startUtc: start.toISOString(),
        durationSec: Number(durationSec),
        stepSec: Number(stepSec),
        count: points.length,
      },
      points,
    });
  } catch (err) {
    console.error('simulateOrbit error:', err.message);
    return res.status(500).json({ error: 'Failed to simulate orbit' });
  }
}

module.exports = { simulateOrbit };
