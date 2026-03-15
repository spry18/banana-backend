const express = require('express');
const router = express.Router();
const { getExecutionById, reviewExecution } = require('./execution.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply protect to all routes
router.use(protect);

// GET /api/execution/:id  —  Merged assignment + trip + packing detail
router.get('/:id', authorize('Admin', 'Operational Manager'), getExecutionById);

// PATCH /api/execution/:id/review  —  OM approves or rejects the trip report
router.patch('/:id/review', authorize('Admin', 'Operational Manager'), reviewExecution);

module.exports = router;
