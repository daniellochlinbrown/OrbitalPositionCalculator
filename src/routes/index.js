// src/routes/index.js
const express = require('express');

// Sub-routers
const tleRouter        = require('./tle');
const orbitsRouter     = require('./orbits');
const batchRouter      = require('./batch');
const favouritesRouter = require('./favourites');

const prisma = require('../db/db.js'); 
const router = express.Router();

router.use(express.json({ limit: '1mb' }));

// Mount sub-routers
router.use('/tle', tleRouter);
router.use('/',    orbitsRouter);
router.use('/',    batchRouter);
router.use('/favourites', favouritesRouter);


module.exports = router;
