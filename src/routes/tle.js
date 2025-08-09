const express = require('express');
const { getTLE } = require('../controllers/tleController');

const router = express.Router();
router.get('/tle/:satid', getTLE);

module.exports = router;
