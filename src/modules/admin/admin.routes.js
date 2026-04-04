const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getAdminStats,
    getAlerts,
    getFieldSelectionOverview,
    getStaffPerformance,
    getMonitoringDashboard,
} = require('./admin.controller');

router.use(protect);
router.use(authorize('Admin', 'Operational Manager'));

// Phase 4 — Dashboard & Alerts
router.get('/dashboard-stats', getAdminStats);
router.get('/alerts', getAlerts);

// Phase 7 — Aggregation
router.get('/field-selection/overview', getFieldSelectionOverview);
router.get('/field-selection/monitoring', getMonitoringDashboard);
router.get('/performance/staff', getStaffPerformance);

module.exports = router;
