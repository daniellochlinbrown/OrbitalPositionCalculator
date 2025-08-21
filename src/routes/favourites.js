const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../auth/auth'); 

const prisma = new PrismaClient();
const router = Router();

// GET /favourites
router.get('/', requireAuth, async (req, res) => {
  try {
    const items = await prisma.favorite.findMany({
      where: { userId: Number(req.user.sub) }, 
      select: { noradId: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ items: items.map(i => i.noradId) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to fetch favourites' });
  }
});

// POST /favourites
router.post('/', requireAuth, async (req, res) => {
  try {
    const noradId = parseInt(String(req.body?.noradId), 10);
    if (!Number.isFinite(noradId)) return res.status(400).json({ error: 'noradId required' });

    await prisma.favorite.upsert({
      where: { userId_noradId: { userId: Number(req.user.sub), noradId } },
      update: {},
      create: { userId: Number(req.user.sub), noradId }
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to add favourite' });
  }
});

// DELETE /favourites/:noradId
router.delete('/:noradId', requireAuth, async (req, res) => {
  try {
    const noradId = parseInt(String(req.params.noradId), 10);
    if (!Number.isFinite(noradId)) return res.status(400).json({ error: 'noradId required' });

    await prisma.favorite.delete({
      where: { userId_noradId: { userId: Number(req.user.sub), noradId } }
    }).catch(() => null);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to remove favourite' });
  }
});

module.exports = router;
