'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const { getUnbilledExecutions, syncFromExecution } = require('./billingSync.controller');

// Enforce Admin-only access (Gap 6 constraint)
router.use(protect, authorize('Admin', 'Operational Manager', 'Field Owner'));

/** GET /api/billing/sync/unbilled-executions */
router.get('/unbilled-executions', getUnbilledExecutions);

/** POST /api/billing/sync/from-execution/:assignmentId */
router.post('/from-execution/:assignmentId', syncFromExecution);

module.exports = router;
