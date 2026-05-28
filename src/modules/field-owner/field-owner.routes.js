const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getFODashboard,
    getFOPlots,
    getUnassignedPlots,
    getSelectorsPerformance,
    getSelectorsPerformanceWeekly,
    getSelectorsPerformanceMonthly,
    getSelectorMileage,
    getFOSelectors,
    getOmMetricsForFO,
} = require('./field-owner.controller');

router.use(protect);
router.use(authorize('Field Owner', 'Admin'));

// GET /api/field-owner/dashboard
router.get('/dashboard', getFODashboard);

// GET /api/field-owner/plots/unassigned  ← must be BEFORE /plots to avoid shadowing
router.get('/plots/unassigned', getUnassignedPlots);

// GET /api/field-owner/plots?status=Missed|Rescheduled|SELECTED|REJECTED&location=&search=&page=&limit=
router.get('/plots', getFOPlots);

// GET /api/field-owner/selectors-performance/weekly
router.get('/selectors-performance/weekly', getSelectorsPerformanceWeekly);

// GET /api/field-owner/selectors-performance/monthly
router.get('/selectors-performance/monthly', getSelectorsPerformanceMonthly);

// GET /api/field-owner/selectors-performance?startDate=&endDate=
router.get('/selectors-performance', getSelectorsPerformance);

// GET /api/field-owner/selector-mileage/:logId
router.get('/selector-mileage/:logId', getSelectorMileage);

// GET /api/field-owner/selectors
router.get('/selectors', getFOSelectors);

// GET /api/field-owner/oms-metrics
router.get('/oms-metrics', getOmMetricsForFO);

module.exports = router;
