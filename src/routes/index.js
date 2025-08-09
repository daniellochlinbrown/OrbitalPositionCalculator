const express = require('express');
const health = require('./health');
const tle = require('./tle');
const orbits = require('./orbits');

const router = express.Router();

router.use('/', health);
router.use('/', tle);
router.use('/', orbits);

router.get('/', (_req, res) => res.send('Orbital Position API is running.'));

module.exports = router;
