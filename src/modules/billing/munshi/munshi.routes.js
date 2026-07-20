'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./munshi.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',          ctrl.getSummary);
router.get('/payment-summary',  ctrl.getPaymentSummary);
router.get('/payments/history', ctrl.getPaymentHistory);
router.post('/payments',        ctrl.createPayment);
router.route('/ledger').get(ctrl.getLedger).post(ctrl.createEntry);
router.route('/ledger/:id').get(ctrl.getEntryById).patch(ctrl.updateEntry);

module.exports = router;
