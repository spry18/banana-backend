'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./commissionAgent.controller');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

router.get('/summary', ctrl.getSummary);
router.route('/payments').get(ctrl.getPayments).post(ctrl.createPayment);
router.route('/agents').get(ctrl.getAll).post(ctrl.create);
router.route('/agents/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
