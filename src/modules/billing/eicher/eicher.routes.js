'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./eicher.controller');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

router.get('/summary', ctrl.getSummary);
router.get('/trips', ctrl.getTrips);
router.get('/trips/:id', ctrl.getTripById);
router.get('/payment-summary', ctrl.getPaymentSummary);
router.post('/payments', ctrl.createPayment);
router.get('/payments/history', ctrl.getPaymentHistory);

module.exports = router;
