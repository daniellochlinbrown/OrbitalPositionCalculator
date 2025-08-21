const axios = require('axios');
const satellite = require('satellite.js');

async function fetchTLEFromCelestrak(noradId) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=TLE`;
  const { data: text } = await axios.get(url, { timeout: 8000, responseType: 'text' });
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  const i1 = lines.findIndex(l => l.startsWith('1 '));
  const i2 = i1 >= 0 ? lines.findIndex((l, idx) => idx > i1 && l.startsWith('2 ')) : -1;
  if (i1 < 0 || i2 < 0) throw new Error('TLE not found/invalid format');
  const name = !lines[0].startsWith('1 ') && !lines[0].startsWith('2 ') ? lines[0] : null;
  return { name, tle1: lines[i1], tle2: lines[i2] };
}

function epochFromTLE(tle1, tle2) {
  const satrec = satellite.twoline2satrec(tle1, tle2);
  if (Number.isFinite(satrec.jdsatepoch)) {
    const jd = satrec.jdsatepoch;
    const jdParts = satellite.invjday(jd);
    return satellite.jdayToDate(...jdParts);
  }
  return new Date(0);
}

async function upsertTLE(prisma, { noradId, name, tle1, tle2 }, { keepHistory = true } = {}) {
  const epoch = epochFromTLE(tle1, tle2);
  const saved = await prisma.tle.upsert({
    where: { noradId: Number(noradId) },
    update: { name, line1: tle1, line2: tle2, epoch, fetchedAt: new Date() },
    create: { noradId: Number(noradId), name, line1: tle1, line2: tle2, epoch, fetchedAt: new Date() },
  });
  if (keepHistory) {
    await prisma.tleHistory.create({
      data: { noradId: Number(noradId), line1: tle1, line2: tle2, epoch, source: 'celestrak', fetchedAt: new Date() },
    });
  }
  return saved;
}

async function getOrFetchTLE(prisma, noradId, { maxAgeHours = 12, allowFetch = true } = {}) {
  const id = Number(noradId);
  const inDb = await prisma.tle.findUnique({ where: { noradId: id } });

  if (inDb) {
    const ageH = (Date.now() - new Date(inDb.fetchedAt).getTime()) / 3600000;
    if (ageH <= maxAgeHours || !allowFetch) {
      return { tle1: inDb.line1, tle2: inDb.line2, name: inDb.name, epoch: inDb.epoch, source: 'db' };
    }
  }

  if (!allowFetch || process.env.TLE_ALLOW_FETCH === 'false') {
    if (!inDb) throw new Error('TLE not in DB (fetch disabled)');
    return { tle1: inDb.line1, tle2: inDb.line2, name: inDb.name, epoch: inDb.epoch, source: 'db-stale' };
  }

  const { name, tle1, tle2 } = await fetchTLEFromCelestrak(id);
  await upsertTLE(prisma, { noradId: id, name, tle1, tle2 });
  console.log('[TLE] FETCH from CelesTrak', noradId);
  return { tle1, tle2, name, epoch: epochFromTLE(tle1, tle2), source: 'fetch' };
}

async function getTLEFromDbOnly(prisma, noradId) {
  const row = await prisma.tle.findUnique({ where: { noradId: Number(noradId) } });
  if (!row) throw new Error('TLE not in DB (DB-only mode)');
  return { tle1: row.line1, tle2: row.line2, name: row.name, epoch: row.epoch, source: 'db' };
}

module.exports = {
  fetchTLEFromCelestrak,
  upsertTLE,
  getOrFetchTLE,
  getTLEFromDbOnly,
  epochFromTLE,
};
