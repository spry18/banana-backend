'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./companyPayment.controller');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));
router.get('/unpaid-bills', ctrl.getUnpaidBills);
router.route('/').get(ctrl.getAll).post(ctrl.create);
router.route('/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
