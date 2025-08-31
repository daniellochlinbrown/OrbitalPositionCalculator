const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VISUAL_JSON =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json';

// helper functions

function isStaleDays(epoch, days = 1) {
  if (!epoch) return true;
  const ms = Date.now() - new Date(epoch).getTime();
  return ms > days * 86400 * 1000;
}

async function fetchVisualJSON() {
  const r = await fetch(VISUAL_JSON, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`CelesTrak visual fetch failed: HTTP ${r.status}`);
  return r.json();
}

function parseEpoch(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function makeLimiter(concurrency = 8) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= concurrency || q.length === 0) return;
    active++;
    const { fn, res, rej } = q.shift();
    Promise.resolve(fn()).then(
      (v) => { active--; next(); res(v); },
      (e) => { active--; next(); rej(e); }
    );
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

// Epoch from TLE line1 (YYDDD.DDDDDDDD → UTC)
function epochFromTLELine1(line1) {
  try {
    const yy = parseInt(line1.slice(18, 20), 10);
    const ddd = parseFloat(line1.slice(20, 32));
    if (!Number.isFinite(yy) || !Number.isFinite(ddd)) return null;
    const year = yy < 57 ? 2000 + yy : 1900 + yy;
    const ms = (ddd - 1) * 86400 * 1000;
    const jan1 = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    return new Date(jan1.getTime() + ms);
  } catch { return null; }
}

async function getFreshness() {
  const latest = await prisma.tle.findFirst({
    orderBy: { epoch: 'desc' },
    select: { epoch: true },
  });
  return { newestEpoch: latest?.epoch || null };
}

// Upsert into Database
async function upsertVisual(items) {
  const now = new Date();
  const limit = makeLimiter(8);

  let ok = 0, fail = 0, skipped = 0;
  const errors = [];

  const prepared = items.map(it => {
    const id = Number(it.NORAD_CAT_ID);
    if (!Number.isFinite(id)) return null;
    return {
      id,
      name: it.OBJECT_NAME || null,
      line1: it.TLE_LINE1 || null,
      line2: it.TLE_LINE2 || null,
      epoch: parseEpoch(it.EPOCH),
    };
  }).filter(Boolean);

  await Promise.all(prepared.map((rec) => limit(async () => {
    try {
      if (!rec.line1 || !rec.line2) {
        skipped++;
        if (errors.length < 5) {
          errors.push({
            id: rec.id, name: rec.name, reason: 'missing TLE lines',
            sample: { EPOCH: rec.epoch?.toISOString?.() || null, L1: rec.line1 || '', L2: rec.line2 || '' }
          });
        }
        return;
      }

      const epoch = rec.epoch || epochFromTLELine1(rec.line1);
      if (!epoch) {
        skipped++;
        if (errors.length < 5) errors.push({ id: rec.id, name: rec.name, reason: 'unparseable epoch' });
        return;
      }

      await prisma.tle.upsert({
        where:  { noradId: rec.id },
        create: { noradId: rec.id, name: rec.name, line1: rec.line1, line2: rec.line2, epoch, fetchedAt: now, source: 'celestrak' },
        update: {               name: rec.name, line1: rec.line1, line2: rec.line2, epoch, fetchedAt: now, source: 'celestrak' },
      });
      ok++;
    } catch (e) {
      fail++;
      if (errors.length < 5) errors.push({ id: rec.id, name: rec.name, reason: e?.message || String(e) });
    }
  })));

  if (errors.length) console.warn('[upsertVisual] sample errors:', errors);
  return { ok, fail, skipped, total: items.length, errors };
}

// ensure freshness of TLE data

let refreshInFlight = null; // prevent double refreshes

/**
 * Ensure DB has fresh (≤ 1 day) visual TLEs.
 * Returns { refreshed, before, after, summary }
 */
async function ensureVisualFreshness({ force = false } = {}) {
  const before = await getFreshness();
  const stale = !before.newestEpoch || isStaleDays(before.newestEpoch, 1);

  if (!force && !stale) {
    return { refreshed: false, before, after: before, summary: { ok: 0, fail: 0, skipped: 0, total: 0 } };
  }
  if (!force && refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const items   = await fetchVisualJSON();
    const summary = await upsertVisual(items);
    const after   = await getFreshness();
    return { refreshed: true, before, after, summary };
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// per ID lookup

/** DB-only TLE lookup by NORAD ID (ensures visual set is fresh first). */
async function getTLEById(satid) {
  const idNum = Number(String(satid || '').trim());
  if (!Number.isFinite(idNum)) throw new Error('satid must be numeric');

  await ensureVisualFreshness({ force: false });

  const row = await prisma.tle.findUnique({
    where: { noradId: idNum },
    select: { noradId: true, name: true, line1: true, line2: true, epoch: true, updatedAt: true },
  });

  if (!row) throw new Error('TLE not found in DB');

  return {
    line1: row.line1,
    line2: row.line2,
    name: row.name || `NORAD ${row.noradId}`,
    epoch: row.epoch,
    source: 'db',
    stale: isStaleDays(row.epoch, 1),
  };
}

// routes

// GET /tle/:satid   (optional—keep only if you expose this route)
async function getTLERoute(req, res) {
  try {
    const satid = String(req.params.satid || '').trim();
    if (!satid) return res.status(400).json({ error: 'satid required' });
    const tle = await getTLEById(satid);
    res.json({ satid, ...tle });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch TLE' });
  }
}

module.exports = {
  ensureVisualFreshness, 
  getTLERoute,        
};
