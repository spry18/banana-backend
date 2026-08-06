'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./coldStorage.controller');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

router.get('/summary', ctrl.getSummary);
router.get('/payment-cycles', ctrl.getPaymentCycles);
router.get('/payments/history', ctrl.getPaymentHistory);
router.post('/payments', ctrl.createPayment);

router.route('/entries')
  .get(ctrl.getAll)
  .post(ctrl.create);

router.route('/entries/:id')
  .get(ctrl.getById)
  .patch(ctrl.update);

module.exports = router;
