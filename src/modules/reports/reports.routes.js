const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getFieldSelectionReport,
    getExecutionDetailedReport,
    getMunshiHarvestingReport,
} = require('./reports.controller');

router.use(protect);
router.use(authorize('Admin', 'Operational Manager'));

// GET /api/reports/field-selection
router.get('/field-selection', getFieldSelectionReport);

// GET /api/reports/execution-detailed
router.get('/execution-detailed', getExecutionDetailedReport);

// GET /api/reports/munshi-harvesting
router.get('/munshi-harvesting', getMunshiHarvestingReport);

module.exports = router;
