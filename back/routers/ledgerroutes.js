const router = require('express').Router();
const controller = require('../controllers/ledgercontroller');

// GET /api/ledger?customer=NAME&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/', controller.getCustomerLedger);

module.exports = router;
