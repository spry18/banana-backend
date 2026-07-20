'use strict';
/**
 * Billing Module — Master Router
 * Mounted at: /api/billing
 * All sub-routers live exclusively in src/modules/billing/
 * ZERO modifications to any legacy file except server.js (1 line).
 */
const express = require('express');
const router = express.Router();

router.use('/master',           require('./master/billingMaster.routes'));
router.use('/dashboard',        require('./dashboard/dashboard.routes'));
router.use('/farmer/bills',     require('./farmer-billing/farmerBill.routes'));
router.use('/farmer/payments',  require('./farmer-payment/farmerPayment.routes'));
router.use('/company/bills',    require('./company-billing/companyBill.routes'));
router.use('/company/payments', require('./company-payment/companyPayment.routes'));
router.use('/eicher',           require('./eicher/eicher.routes'));
router.use('/munshi',           require('./munshi/munshi.routes'));
router.use('/kharchi',          require('./kharchi/kharchi.routes'));
router.use('/pickup',           require('./pickup/pickup.routes'));
router.use('/cold-storage',     require('./cold-storage/coldStorage.routes'));
router.use('/packing-material', require('./packing-material/packingMaterial.routes'));
router.use('/fuel',             require('./fuel/fuel.routes'));
router.use('/commission-agent', require('./commission-agent/commissionAgent.routes'));
router.use('/salary',           require('./salary/salary.routes'));

module.exports = router;
