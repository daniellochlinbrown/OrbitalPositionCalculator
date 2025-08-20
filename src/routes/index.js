const express = require('express');
const tle = require('./tle');
const orbits = require('./orbits');
const compute = require('./compute')

const router = express.Router();

router.use('/', tle);
router.use('/', orbits);
router.use('/', compute);

router.get('/', (_req, res) => res.send('Orbital Position API is running.'));

module.exports = router;
