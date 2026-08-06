'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./kharchi.controller');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

router.get('/summary', ctrl.getSummary);
router.get('/expenses', ctrl.getAll);
router.get('/expenses/:id', ctrl.getById);
router.post('/payments', ctrl.createPayment);
router.get('/payments/history', ctrl.getPaymentHistory);

module.exports = router;
