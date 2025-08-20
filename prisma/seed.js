const { PrismaClient } = require('@prisma/client');
const { fetchTLEFromCelestrak, upsertTLE } = require('../src/utils/tleStore');
const pLimit = require('p-limit').default;

const prisma = new PrismaClient();

async function main() {
  const noradIds = [
    25544, // ISS
    43013, // TESS (example)
    39444, // Suomi NPP (example)
    // ...
  ];

  const limit = pLimit(6);
  const jobs = noradIds.map(id =>
    limit(async () => {
      try {
        const { name, tle1, tle2 } = await fetchTLEFromCelestrak(id);
        await upsertTLE(prisma, { noradId: id, name, tle1, tle2 });
        console.log(`Upserted TLE for ${id}${name ? ` (${name})` : ''}`);
      } catch (e) {
        console.warn(`Failed ${id}: ${e.message}`);
      }
    })
  );
  await Promise.all(jobs);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
