'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./coldStorage.controller');

router.use(protect, authorize('Admin'));

router.get('/summary', ctrl.getSummary);
router.get('/payment-cycles', ctrl.getPaymentCycles);
router.get('/entries', ctrl.getAll);
router.get('/entries/:id', ctrl.getById);
router.get('/payments/history', ctrl.getPaymentHistory);
router.post('/payments', ctrl.createPayment);

module.exports = router;
