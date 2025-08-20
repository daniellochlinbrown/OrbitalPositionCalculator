// prisma/seed-visual.js
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const { upsertTLE } = require('../src/utils/tleStore');

async function fetchVisualGroupTLEs() {
  const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=TLE';
  const { data: text } = await axios.get(url, { timeout: 10000, responseType: 'text' });
  const lines = String(text).split('\n').map(s => s.trim()).filter(Boolean);

  const out = [];
  for (let i = 0; i < lines.length; ) {
    // Most sets are: NAME, line1, line2
    let name = null;
    let l1 = null;
    let l2 = null;

    const a = lines[i] || '';
    const b = lines[i + 1] || '';
    const c = lines[i + 2] || '';

    if (!a.startsWith('1 ') && !a.startsWith('2 ') && b.startsWith('1 ') && c.startsWith('2 ')) {
      // NAME present
      name = a;
      l1 = b;
      l2 = c;
      i += 3;
    } else if (a.startsWith('1 ') && b.startsWith('2 ')) {
      // No name line — just 1/2 lines
      l1 = a;
      l2 = b;
      i += 2;
    } else {
      // Unexpected; skip one line to avoid infinite loop
      i += 1;
      continue;
    }

    const m = /^1\s+(\d{1,6})/.exec(l1);
    if (!m) continue;
    const noradId = Number(m[1]);

    out.push({ noradId, name, tle1: l1, tle2: l2 });
  }
  return out;
}

async function main() {
  const sats = await fetchVisualGroupTLEs();
  console.log(`Fetched ${sats.length} satellites from CelesTrak "visual"`);

  let ok = 0, fail = 0;
  for (const s of sats) {
    try {
      await upsertTLE(prisma, s, { keepHistory: true });
      ok++;
      console.log(`✓ Upserted ${s.noradId}${s.name ? ` (${s.name})` : ''}`);
    } catch (e) {
      fail++;
      console.warn(`✗ Failed ${s.noradId}: ${e.message}`);
    }
  }
  console.log(`Done. Success: ${ok}, Failed: ${fail}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
