'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const {
  getBanks,
  getCompanies,
  getVehicles,
  getFarmers,
  getMunshis,
  getDrivers,
  getAgents,
  getBrands,
} = require('./billingMaster.controller');

router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

/** GET /api/billing/master/banks */
router.get('/banks', getBanks);

/** GET /api/billing/master/companies */
router.get('/companies', getCompanies);

/** GET /api/billing/master/vehicles */
router.get('/vehicles', getVehicles);

/** GET /api/billing/master/farmers */
router.get('/farmers', getFarmers);

/** GET /api/billing/master/munshis */
router.get('/munshis', getMunshis);

/** GET /api/billing/master/drivers */
router.get('/drivers', getDrivers);

/** GET /api/billing/master/agents */
router.get('/agents', getAgents);

/** GET /api/billing/master/brands */
router.get('/brands', getBrands);

module.exports = router;
