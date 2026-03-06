const express = require('express');
const router = express.Router();
const {
    createInspection,
    getInspections,
    getInspectionById,
    getInspectionConfig,
} = require('./inspection.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

// Apply 'protect' to all routes
router.use(protect);

// GET /api/inspections/config — returns dropdown enums for the mobile form
// Protected: selector must be authenticated to open the inspection form
router.get('/config', authorize('Admin', 'Field Selector', 'Field Owner', 'Operational Manager'), getInspectionConfig);

router
    .route('/')
    .post(authorize('Admin', 'Field Selector'), upload.array('photos', 20), createInspection)
    .get(authorize('Admin', 'Field Owner', 'Field Selector', 'Operational Manager'), getInspections);

router.route('/:id').get(getInspectionById);

module.exports = router;
