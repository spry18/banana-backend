const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    createCompany,
    getCompanies,
    updateCompany,
    deleteCompany,
    toggleCompanyStatus,
    createBrand,
    getBrands,
    updateBrand,
    deleteBrand,
    createAgent,
    getAgents,
    updateAgent,
    deleteAgent,
    toggleAgentStatus,
    createVehicle,
    getVehicles,
    updateVehicle,
    deleteVehicle,
    toggleVehicleStatus,
    createGeneration,
    getGenerations,
    updateGeneration,
    deleteGeneration,
    toggleGenerationStatus,
    getFormDropdowns,
    getDrivers,
} = require('./master.controller');

// Apply protection to all routes
router.use(protect);

// GET /api/master-data/drivers
router.get('/drivers', authorize('Admin', 'Operational Manager', 'Munshi'), getDrivers);

// GET /api/master-data/dropdowns
// Open to any authenticated role that needs to populate UI forms
router.get('/dropdowns', authorize('Admin', 'Field Owner', 'Operational Manager', 'Munshi'), getFormDropdowns);

// Companies — Admin only
router.route('/companies').post(authorize('Admin'), createCompany).get(authorize('Admin', 'Field Owner', 'Field Selector'), getCompanies);
router.route('/companies/:id').put(authorize('Admin'), updateCompany).delete(authorize('Admin'), deleteCompany);
router.patch('/companies/:id/status', authorize('Admin'), toggleCompanyStatus);  // Req 3: Activate/Deactivate

// Brands — Admin only
router.route('/brands').post(authorize('Admin'), createBrand).get(authorize('Admin'), getBrands);
router.route('/brands/:id').put(authorize('Admin'), updateBrand).delete(authorize('Admin'), deleteBrand);

// Agents — Admin only
router.route('/agents').post(authorize('Admin'), createAgent).get(authorize('Admin', 'Field Owner', 'Field Selector'), getAgents);
router.route('/agents/:id').put(authorize('Admin'), updateAgent).delete(authorize('Admin'), deleteAgent);
router.patch('/agents/:id/status', authorize('Admin'), toggleAgentStatus);       // Req 3: Activate/Deactivate

// Vehicles — Admin only
router.route('/vehicles').post(authorize('Admin'), createVehicle).get(authorize('Admin'), getVehicles);
router.route('/vehicles/:id').put(authorize('Admin'), updateVehicle).delete(authorize('Admin'), deleteVehicle);
router.patch('/vehicles/:id/status', authorize('Admin'), toggleVehicleStatus);   // Req 3: Activate/Deactivate

// Generations — Admin only
router.route('/generations').post(authorize('Admin'), createGeneration).get(authorize('Admin', 'Field Owner', 'Field Selector'), getGenerations);
router.route('/generations/:id').put(authorize('Admin'), updateGeneration).delete(authorize('Admin'), deleteGeneration);
router.patch('/generations/:id/status', authorize('Admin'), toggleGenerationStatus); // Req 3: Activate/Deactivate

module.exports = router;
