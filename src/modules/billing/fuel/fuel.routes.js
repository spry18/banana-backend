'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./fuel.controller');

router.use(protect, authorize('Admin'));

router.get('/summary', ctrl.getSummary);
router.get('/pump-summary', ctrl.getPumpSummary);
router.get('/entries', ctrl.getAll);
router.get('/entries/:id', ctrl.getById);
router.post('/payments', ctrl.createPayment);
router.get('/payments/history', ctrl.getPaymentHistory);

module.exports = router;
