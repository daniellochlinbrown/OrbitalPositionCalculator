// scripts/list-norad-ids.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Adjust filters as you like:
    const rows = await prisma.tle.findMany({
      select: { noradId: true, name: true, fetchedAt: true, updatedAt: true, epoch: true },
      orderBy: [{ updatedAt: 'desc' }],
    });

    // Plain array of IDs:
    const ids = rows.map(r => r.noradId);
    console.log('COUNT:', ids.length);
    console.log('JSON:', JSON.stringify(ids));

    // Helpful table:
    console.table(rows.map(r => ({
      noradId: r.noradId,
      name: r.name || '',
      fetchedAt: r.fetchedAt,
      updatedAt: r.updatedAt,
      epoch: r.epoch,
    })));

    // Optional CSV on disk
    const fs = require('fs');
    const csv = ['noradId,name,updatedAt']
      .concat(rows.map(r => `${r.noradId},"${(r.name||'').replace(/"/g,'""')}",${r.updatedAt?.toISOString?.()||''}`))
      .join('\n');
    fs.writeFileSync('noradIds.csv', csv);
    console.log('Wrote noradIds.csv');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
