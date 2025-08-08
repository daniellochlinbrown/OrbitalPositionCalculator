const express = require('express');
const { simulateOrbit } = require('../controllers/orbitsController');

const router = express.Router();

// sanity: ensure we actually have a function
console.log('simulateOrbit typeof =', typeof simulateOrbit); // should log "function"

router.post('/simulate', simulateOrbit); // NOTE: no parentheses

module.exports = router;
