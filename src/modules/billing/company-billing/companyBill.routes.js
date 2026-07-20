'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./companyBill.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',        ctrl.getSummary);
router.get('/outstanding',    ctrl.getOutstanding);
router.get('/history/export', ctrl.exportHistory);
router.get('/history',        ctrl.getHistory);
router.get('/club',           ctrl.getClubData);
router.post('/club',          ctrl.createClubBill);
router.route('/').get(ctrl.getAll).post(ctrl.create);
router.get('/:id/pdf',     ctrl.getPDF);
router.get('/:id/invoice', ctrl.getInvoice);
router.post('/:id/share',  ctrl.shareBill);
router.route('/:id').get(ctrl.getById).patch(ctrl.update).delete(ctrl.remove);

module.exports = router;
