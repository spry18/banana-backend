'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./eicher.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',          ctrl.getSummary);
router.get('/payment-summary',  ctrl.getPaymentSummary);
router.get('/payments/history', ctrl.getPaymentHistory);
router.post('/payments',        ctrl.createPayment);
router.route('/trips').get(ctrl.getTrips).post(ctrl.createTrip);
router.route('/trips/:id').get(ctrl.getTripById).patch(ctrl.updateTrip);

module.exports = router;
