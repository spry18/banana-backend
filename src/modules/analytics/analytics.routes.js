const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getAnalyticsDashboard,
    getGeneratedReport,
    masterReport,
    exportReport,
} = require('./analytics.controller');

router.use(protect);
router.use(authorize('Admin'));

// New combined APIs (Phase FE)
router.get('/dashboard',         getAnalyticsDashboard);
router.get('/generated-report',  getGeneratedReport);

// Existing APIs (preserved)
router.get('/master-report',     masterReport);
router.get('/export',            exportReport);

module.exports = router;
