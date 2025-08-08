const express = require('express');
const { getVisualPasses, getRadioPasses, getAbove } = require('../controllers/passesController');

const router = express.Router();

router.get('/visualpasses', getVisualPasses);
router.get('/radiopasses', getRadioPasses);
router.get('/above', getAbove);

module.exports = router;
