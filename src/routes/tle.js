// src/routes/tle.js
const { Router } = require('express');
const { getTLERoute } = require('../controllers/tleController');

const router = Router();

// GET /tle/25544  -> { satid, line1, line2, cached }
router.get('/:satid', getTLERoute);

module.exports = router;
