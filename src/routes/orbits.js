const express = require('express');
const { getNow, simulate } = require('../controllers/orbitsController');

const router = express.Router();

router.get('/now/:satid', getNow);
router.post('/simulate', simulate);

module.exports = router;
