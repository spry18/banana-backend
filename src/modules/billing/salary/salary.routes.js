'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./salary.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',         ctrl.getSummary);
router.post('/payroll',        ctrl.createPayroll);
router.get('/payroll/history', ctrl.getPayrollHistory);
router.route('/employees').get(ctrl.getAll).post(ctrl.create);
router.route('/employees/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
