const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getFODashboard,
    getFOPlots,
    getSelectorsPerformance,
    getSelectorMileage,
    getFOSelectors,
} = require('./field-owner.controller');

router.use(protect);
router.use(authorize('Field Owner', 'Admin'));

// GET /api/field-owner/dashboard
router.get('/dashboard', getFODashboard);

// GET /api/field-owner/plots?status=Missed|Rescheduled|SELECTED|REJECTED&location=&search=&page=&limit=
router.get('/plots', getFOPlots);

// GET /api/field-owner/selectors-performance?startDate=&endDate=
router.get('/selectors-performance', getSelectorsPerformance);

// GET /api/field-owner/selector-mileage/:logId
router.get('/selector-mileage/:logId', getSelectorMileage);

// GET /api/field-owner/selectors
router.get('/selectors', getFOSelectors);

module.exports = router;
