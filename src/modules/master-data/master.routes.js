const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    createCompany,
    getCompanies,
    createBrand,
    getBrands,
    createAgent,
    getAgents,
    createVehicle,
    getVehicles,
} = require('./master.controller');

// Apply protection and Admin authorization to all routes in this module
router.use(protect);
router.use(authorize('Admin'));

// Companies
router.route('/companies').post(createCompany).get(getCompanies);

// Brands
router.route('/brands').post(createBrand).get(getBrands);

// Agents
router.route('/agents').post(createAgent).get(getAgents);

// Vehicles
router.route('/vehicles').post(createVehicle).get(getVehicles);

module.exports = router;
