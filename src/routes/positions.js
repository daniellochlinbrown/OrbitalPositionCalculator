const express = require('express');
const { getPositions } = require('../controllers/positionsController');

const router = express.Router();

router.get('/', getPositions);

module.exports = router;
