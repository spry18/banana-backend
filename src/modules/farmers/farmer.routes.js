const express = require('express');
const router = express.Router();
const {
    getFarmers,
    searchFarmers,
    importFarmers,
    exportFarmersPdf
} = require('./farmer.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all farmer routes
router.use(protect);

// 1] Get all farmers (Admin, Field Owner)
router.get('/', authorize('Admin', 'Field Owner'), getFarmers);

// 2] Search/filter farmers by name, location, or mobile number (Admin, Field Owner)
router.get('/search', authorize('Admin', 'Field Owner'), searchFarmers);

// 3] Import farmer data using Excel/CSV (Admin only)
router.post('/import', authorize('Admin'), importFarmers);

// Export PDF containing farmer name, mobile, and location (Admin, Field Owner)
router.get('/export-pdf', authorize('Admin', 'Field Owner'), exportFarmersPdf);

module.exports = router;
