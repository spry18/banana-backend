const express = require('express');
const router = express.Router();
const { getOmDashboard, getOmPlots, rejectPackingReport, approvePackingReport } = require('./om.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply protect to all routes
router.use(protect);

// GET /api/operational-manager/dashboard
router.get('/dashboard', authorize('Admin', 'Operational Manager'), getOmDashboard);

// GET /api/operational-manager/plots?stage=Unassigned|Assigned|Complete
router.get('/plots', authorize('Admin', 'Operational Manager'), getOmPlots);

// POST /api/operational-manager/assignments/:assignmentId/reject
router.post('/assignments/:assignmentId/reject', authorize('Admin', 'Operational Manager'), rejectPackingReport);

// POST /api/operational-manager/assignments/:assignmentId/approve
router.post('/assignments/:assignmentId/approve', authorize('Admin', 'Operational Manager'), approvePackingReport);

module.exports = router;

