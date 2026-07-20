'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./kharchi.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',  ctrl.getSummary);
router.post('/payments', ctrl.createPayment);
router.route('/expenses').get(ctrl.getAll).post(ctrl.create);
router.get('/expenses/:id',         ctrl.getById);
router.patch('/expenses/:id/approve', ctrl.approve);
router.patch('/expenses/:id/reject',  ctrl.reject);

module.exports = router;
