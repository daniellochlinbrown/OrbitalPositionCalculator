const express = require('express');
const positionsRoute = require('./positions');
const passesRoute = require('./passes');
const orbitsRoute = require('./orbits');

const router = express.Router();

router.use('/positions', positionsRoute);
router.use('/', passesRoute);
router.use('/orbits', orbitsRoute);

router.get('/', (_req, res) => res.send('Orbital Position API is running.'));

module.exports = router;
