// src/routes/index.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

// Sub-routers
const tleRouter    = require('./tle');
const orbitsRouter = require('./orbits');
const batchRouter  = require('./batch');

const prisma = new PrismaClient();
const router = express.Router();

// Mount sub-routers
router.use('/tle', tleRouter);   
router.use('/',    orbitsRouter);
router.use('/',    batchRouter); 

// Health
router.get('/', (_req, res) => res.send('Orbital Position API is running.'));

router.post('/tle/meta', async (req, res) => {
  try {
    const ids = (req.body?.ids || [])
      .map(v => parseInt(String(v), 10))
      .filter(n => Number.isFinite(n) && n > 0);

    if (!ids.length) return res.json({ items: [] });

    const rows = await prisma.tle.findMany({
      where: { noradId: { in: ids } },
      select: { noradId: true, name: true },
    });

    res.json({ items: rows });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch TLE meta' });
  }
});

module.exports = router;
