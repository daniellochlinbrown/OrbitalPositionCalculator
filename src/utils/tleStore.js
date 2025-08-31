async function getTLEFromDbOnly(prisma, noradId) {
  const row = await prisma.tle.findUnique({ where: { noradId: Number(noradId) } });
  if (!row) throw new Error('TLE not in DB');
  return { tle1: row.line1, tle2: row.line2, name: row.name, epoch: row.epoch, source: 'db' };
}

module.exports = { getTLEFromDbOnly };
