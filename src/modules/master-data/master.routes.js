const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    createCompany,
    getCompanies,
    updateCompany,
    deleteCompany,
    createBrand,
    getBrands,
    updateBrand,
    deleteBrand,
    createAgent,
    getAgents,
    updateAgent,
    deleteAgent,
    createVehicle,
    getVehicles,
    updateVehicle,
    deleteVehicle,
} = require('./master.controller');

// Apply protection and Admin authorization to all routes in this module
router.use(protect);
router.use(authorize('Admin'));

// Companies
router.route('/companies').post(createCompany).get(getCompanies);
router.route('/companies/:id').put(authorize('Admin'), updateCompany).delete(authorize('Admin'), deleteCompany);

// Brands
router.route('/brands').post(createBrand).get(getBrands);
router.route('/brands/:id').put(authorize('Admin'), updateBrand).delete(authorize('Admin'), deleteBrand);

// Agents
router.route('/agents').post(createAgent).get(getAgents);
router.route('/agents/:id').put(authorize('Admin'), updateAgent).delete(authorize('Admin'), deleteAgent);

// Vehicles
router.route('/vehicles').post(createVehicle).get(getVehicles);
router.route('/vehicles/:id').put(authorize('Admin'), updateVehicle).delete(authorize('Admin'), deleteVehicle);

module.exports = router;
