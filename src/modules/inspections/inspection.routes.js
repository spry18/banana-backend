const express = require('express');
const router = express.Router();
const {
    createInspection,
    getInspections,
    getInspectionById,
} = require('./inspection.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

router
    .route('/')
    .post(authorize('Admin', 'Field Selector'), createInspection)
    .get(authorize('Admin', 'Field Owner', 'Field Selector', 'Operational Manager'), getInspections);

router.route('/:id').get(getInspectionById);

module.exports = router;
