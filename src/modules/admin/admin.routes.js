const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getAdminStats,
    getAlerts,
    getFieldSelectionOverview,
    getStaffPerformance,
    getMonitoringDashboard,
    getFieldSelectionDashboard,
} = require('./admin.controller');

router.use(protect);
router.use(authorize('Admin', 'Operational Manager'));

// Phase 4 — Dashboard & Alerts
router.get('/dashboard-stats', getAdminStats);
router.get('/alerts', getAlerts);

// Phase 7 — Aggregation
router.get('/field-selection/overview', getFieldSelectionOverview);
router.get('/performance/staff', getStaffPerformance);

// Requirement 1: Field Visit Monitoring (legacy alias + new frontend contract URL)
router.get('/field-selection/monitoring', getMonitoringDashboard);  // legacy
router.get('/field-visit-monitoring', getMonitoringDashboard);       // new URL (frontend req)

// Requirement 2: Field Selection Management consolidated dashboard
router.get('/field-selection-dashboard', getFieldSelectionDashboard);

module.exports = router;
