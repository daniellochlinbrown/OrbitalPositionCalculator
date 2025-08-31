// src/routes/tle.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  ensureVisualFreshness,
  getTLERoute,        // optional: GET /tle/:satid
} = require('../controllers/tleController');

const prisma = new PrismaClient();
const router = express.Router();

// GET /tle?limit=...
// Lists TLE rows from DB
router.get('/', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200));

    await ensureVisualFreshness({ force: false });

    const rows = await prisma.tle.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { noradId: true, name: true, updatedAt: true },
    });

    res.json({
      items: rows.map(r => ({
        noradId: r.noradId,
        name: r.name || `NORAD ${r.noradId}`,
        updatedAt: r.updatedAt,
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to list TLEs' });
  }
});

router.get('/:satid', getTLERoute);

module.exports = router;
