'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./fuel.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',          ctrl.getSummary);
router.get('/pump-summary',     ctrl.getPumpSummary);
router.get('/payments/history', ctrl.getPaymentHistory);
router.post('/payments',        ctrl.createPayment);
router.route('/entries').get(ctrl.getAll).post(ctrl.create);
router.route('/entries/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
