'use strict';
/**
 * Billing Master Controller
 * Provides dropdown data for billing forms.
 * - Banks: static list (no DB needed)
 * - Companies: READ-ONLY import of existing Company model
 * - Vehicles: READ-ONLY import of existing Vehicle model
 */
const asyncHandler = require('../shared/billing.asyncHandler');

// Read-only model imports from existing legacy module (no modification to those files)
const Company = require('../../master-data/company.model');
const Vehicle = require('../../master-data/vehicle.model');

const BANK_LIST = [
  'HDFC Bank',
  'SBI Bank',
  'ICICI Bank',
  'Bank of Maharashtra',
  'Axis Bank',
  'Punjab National Bank',
  'Canara Bank',
  'Union Bank of India',
  'Kotak Mahindra Bank',
  'Bank of Baroda',
];

/** GET /api/billing/master/banks */
exports.getBanks = asyncHandler(async (req, res) => {
  res.json({ success: true, data: BANK_LIST });
});

/** GET /api/billing/master/companies */
exports.getCompanies = asyncHandler(async (req, res) => {
  const companies = await Company.find({ isActive: true })
    .select('companyName _id')
    .sort({ companyName: 1 })
    .lean();
  res.json({ success: true, data: companies });
});

/** GET /api/billing/master/vehicles */
exports.getVehicles = asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.find({ isActive: true })
    .select('vehicleNumber vehicleType _id')
    .sort({ vehicleNumber: 1 })
    .lean();
  res.json({ success: true, data: vehicles });
});
