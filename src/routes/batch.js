// routes/batch.js
const express = require('express');
const router = express.Router();

function pLimitLocal(concurrency = 4) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= concurrency || q.length === 0) return;
    active++;
    const { fn, res, rej } = q.shift();
    Promise.resolve(fn()).then(
      v => { active--; next(); res(v); },
      e => { active--; next(); rej(e); }
    );
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}

router.post('/simulate-many', async (req, res) => {
  try {
    const { satids, durationSec = 84000, stepSec = 60 } = req.body || {};
    const ids = (Array.isArray(satids) ? satids : []).map(String).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'satids (array) is required' });

    const base = `${req.protocol}://${req.get('host')}`;
    const limit = pLimitLocal(4);
    const results = [];

    await Promise.all(ids.map(id => limit(async () => {
      try {
        const r = await fetch(`${base}/simulate?db=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ satid: id, durationSec, stepSec }),
        });
        let data = null;
        try { data = await r.json(); } catch {}
        if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
        results.push({ ...data, satid: id });
      } catch (e) {
        results.push({ satid: id, error: e.message || 'Failed' });
      }
    })));

    res.json({ count: results.length, results });
  } catch (e) {
    console.error('[simulate-many] fatal', e);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
