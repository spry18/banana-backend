const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getFieldSelectionReport,
    getExecutionDetailedReport,
    getMunshiHarvestingReport,
    exportFieldSelectionReport,
    exportMunshiHarvestingReport,
    exportTransportSummaryReport,
} = require('./reports.controller');

router.use(protect);
router.use(authorize('Admin', 'Operational Manager'));

// GET /api/reports/field-selection
router.get('/field-selection', getFieldSelectionReport);
router.get('/field-selection/export', exportFieldSelectionReport);

// GET /api/reports/execution-detailed
router.get('/execution-detailed', getExecutionDetailedReport);

// GET /api/reports/munshi-harvesting
router.get('/munshi-harvesting', getMunshiHarvestingReport);
router.get('/munshi-harvesting/export', exportMunshiHarvestingReport);

// GET /api/reports/transport-summary/export
router.get('/transport-summary/export', exportTransportSummaryReport);

module.exports = router;
