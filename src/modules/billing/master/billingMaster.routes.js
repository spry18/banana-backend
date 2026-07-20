'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const { getBanks, getCompanies, getVehicles } = require('./billingMaster.controller');

router.use(protect, authorize('Admin'));

/** GET /api/billing/master/banks */
router.get('/banks', getBanks);

/** GET /api/billing/master/companies */
router.get('/companies', getCompanies);

/** GET /api/billing/master/vehicles */
router.get('/vehicles', getVehicles);

module.exports = router;
