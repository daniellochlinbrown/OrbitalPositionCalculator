// src/routes/tle.js
const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { getTLERoute, ensureManyTLERoute } = require('../controllers/tleController');

const prisma = new PrismaClient();
const router = Router();

router.use(require('express').json({ limit: '1mb' }));

// GET /tle?limit=500  -> sidebar list
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const sats = await prisma.tle.findMany({
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: { noradId: true, name: true, updatedAt: true }
    });
    res.json({ items: sats });
  } catch (err) {
    console.error('Error fetching satellites:', err);
    res.status(500).json({ error: 'Failed to fetch satellites' });
  }
});

// POST /tle/ensure
router.post('/ensure', ensureManyTLERoute);

// GET /tle/:satid
router.get('/:satid', getTLERoute);

module.exports = router;
