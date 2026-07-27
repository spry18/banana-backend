'use strict';
/**
 * Billing Master Controller
 * Provides dropdown data for billing forms using READ-ONLY queries on system master collections.
 * - Banks: static list
 * - Companies: READ-ONLY import of existing Company model
 * - Vehicles: READ-ONLY import of existing Vehicle model
 * - Farmers: READ-ONLY import of existing Farmer model
 * - Munshis: READ-ONLY import of existing User model (role = 'Munshi')
 * - Drivers: READ-ONLY import of existing User model (role = driver eicher / driver pickup)
 * - Agents: READ-ONLY import of existing Agent model
 * - Brands: READ-ONLY import of existing Brand model
 */
const asyncHandler = require('../shared/billing.asyncHandler');

// Read-only model imports from existing modules
const Company = require('../../master-data/company.model');
const Vehicle = require('../../master-data/vehicle.model');
const Agent = require('../../master-data/agent.model');
const Brand = require('../../master-data/brand.model');
const Farmer = require('../../farmers/farmer.model');
const User = require('../../users/user.model');

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

/** GET /api/billing/master/farmers */
exports.getFarmers = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { mobile: { $regex: search.trim(), $options: 'i' } },
      { location: { $regex: search.trim(), $options: 'i' } },
    ];
  }
  const farmers = await Farmer.find(query)
    .select('name mobile location _id')
    .sort({ name: 1 })
    .limit(100)
    .lean();
  res.json({ success: true, data: farmers });
});

/** GET /api/billing/master/munshis */
exports.getMunshis = asyncHandler(async (req, res) => {
  const munshis = await User.find({ role: 'Munshi', isActive: true })
    .select('firstName lastName mobileNo _id')
    .sort({ firstName: 1 })
    .lean();
  const formatted = munshis.map((m) => ({
    _id: m._id,
    name: `${m.firstName || ''} ${m.lastName || ''}`.trim(),
    mobileNo: m.mobileNo,
  }));
  res.json({ success: true, data: formatted });
});

/** GET /api/billing/master/drivers */
exports.getDrivers = asyncHandler(async (req, res) => {
  const drivers = await User.find({
    role: { $in: ['driver eicher', 'driver pickup'] },
    isActive: true,
  })
    .select('firstName lastName role mobileNo vehicleId _id')
    .sort({ firstName: 1 })
    .lean();
  const formatted = drivers.map((d) => ({
    _id: d._id,
    name: `${d.firstName || ''} ${d.lastName || ''}`.trim(),
    role: d.role,
    mobileNo: d.mobileNo,
    vehicleId: d.vehicleId || null,
  }));
  res.json({ success: true, data: formatted });
});

/** GET /api/billing/master/agents */
exports.getAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find({ isActive: true })
    .select('agentName mobileNo contactPerson location _id')
    .sort({ agentName: 1 })
    .lean();
  res.json({ success: true, data: agents });
});

/** GET /api/billing/master/brands */
exports.getBrands = asyncHandler(async (req, res) => {
  const { companyId } = req.query;
  const query = { isActive: true };
  if (companyId) query.companyId = companyId;
  const brands = await Brand.find(query)
    .select('brandName companyId _id')
    .populate('companyId', 'companyName')
    .sort({ brandName: 1 })
    .lean();
  res.json({ success: true, data: brands });
});
