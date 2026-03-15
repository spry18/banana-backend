const express = require('express');
const router = express.Router();
const { getOmDashboard, getOmPlots } = require('./om.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply protect to all routes
router.use(protect);

// GET /api/operational-manager/dashboard
router.get('/dashboard', authorize('Admin', 'Operational Manager'), getOmDashboard);

// GET /api/operational-manager/plots?stage=Unassigned|Assigned|Complete
router.get('/plots', authorize('Admin', 'Operational Manager'), getOmPlots);

module.exports = router;
