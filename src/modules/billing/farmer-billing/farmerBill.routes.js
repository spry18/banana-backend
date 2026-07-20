'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./farmerBill.controller');

router.use(protect, authorize('Admin'));

router.get('/summary', ctrl.getSummary);
router.get('/history', ctrl.getHistory);
router.route('/').get(ctrl.getAll).post(ctrl.create);
router.get('/:id/pdf', ctrl.getPDF);
router.get('/:id/receipt', ctrl.getReceipt);
router.post('/:id/share', ctrl.shareBill);
router.route('/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
