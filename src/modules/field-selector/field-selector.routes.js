const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getDashboard,
    getAssignedFields,
    getFieldDetails,
} = require('./field-selector.controller');

// All routes require authentication + Field Selector (or Admin) role
router.use(protect);
router.use(authorize('Field Selector', 'Admin'));

// GET /api/field-selector/dashboard
// Returns KPI counters and recent activity feed for the logged-in selector
router.get('/dashboard', getDashboard);

// GET /api/field-selector/fields?status=&search=&page=&limit=
// Returns paginated list of enquiries assigned to the logged-in selector
router.get('/fields', getAssignedFields);

// GET /api/field-selector/fields/:id
// Returns details of a specific enquiry assigned to the logged-in selector
router.get('/fields/:id', getFieldDetails);

module.exports = router;
