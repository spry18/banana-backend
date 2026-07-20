'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./commissionAgent.controller');

router.use(protect, authorize('Admin'));

router.get('/summary', ctrl.getSummary);
router.post('/payments', ctrl.createPayment);
router.route('/agents').get(ctrl.getAll).post(ctrl.create);
router.route('/agents/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
