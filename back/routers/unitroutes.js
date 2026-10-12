const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitcontroller');

router.get('/', unitController.getUnits);
router.post('/', unitController.createUnit);
router.delete('/', unitController.deleteUnit);

module.exports = router;
