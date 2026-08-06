'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./packingMaterial.controller');
const { billingUpload } = require('../shared/billing.upload');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

router.get('/summary', ctrl.getSummary);
router.get('/vendor-summary', ctrl.getVendorSummary);
router.get('/payments/history', ctrl.getPaymentHistory);
router.post('/payments', ctrl.createPayment);
router.post('/procurements/upload-bill', billingUpload.single('billPhoto'), ctrl.uploadBillPhoto);
router.route('/procurements').get(ctrl.getAll).post(ctrl.create);
router.route('/procurements/:id').get(ctrl.getById).patch(ctrl.update);

module.exports = router;
