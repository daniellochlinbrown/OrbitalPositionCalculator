const express = require('express');
const { PrismaClient } = require('@prisma/client');

// Sub-routers
const tleRouter    = require('./tle');
const orbitsRouter = require('./orbits');
const batchRouter  = require('./batch');
const favouritesRouter = require('./favourites');

const prisma = new PrismaClient();
const router = express.Router();

router.use(express.json({ limit: '1mb' }));

// Mount sub-routers
router.use('/tle', tleRouter);
router.use('/',    orbitsRouter);
router.use('/',    batchRouter);
router.use('/favourites', favouritesRouter);

router.post('/tle/meta', async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = raw
      .map(v => parseInt(v, 10))
      .filter(n => Number.isFinite(n) && n > 0);

    if (!ids.length) return res.json({ items: [] });

    const rows = await prisma.tle.findMany({
      where: { noradId: { in: ids } },
      select: { noradId: true, name: true },
    });

    res.json({ items: rows });
  } catch (e) {
    console.error('POST /tle/meta error:', e);
    res.status(500).json({ error: e.message || 'Failed to fetch TLE meta' });
  }
});

module.exports = router;
