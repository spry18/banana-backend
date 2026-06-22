const express = require('express');
const router = express.Router();
const {
    createAssignment,
    getAssignments,
    getAssignmentById,
    getRelatedAssignments,
    changeAssignedTeam,
} = require('./logistics.controller');
const { assignEicherDriver, assignPickupDriver } = require('../munshi/munshi.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

router.use(protect);

// Phase 5: Renamed from POST / to POST /assign
router
    .route('/assign')
    .post(authorize('Admin', 'Operational Manager'), createAssignment);

router
    .route('/')
    .get(authorize('Admin', 'Operational Manager', 'Munshi', 'driver eicher', 'driver pickup'), getAssignments);

// Assign/update main Eicher driver
router
    .route('/:id/eicher')
    .patch(authorize('Admin', 'Operational Manager'), assignEicherDriver);

// Assign/update secondary pickup driver
router
    .route('/:id/pickup')
    .patch(authorize('Admin', 'Operational Manager'), assignPickupDriver);

// Get all related assignments (original + rollovers + overflows)
router
    .route('/:id/related')
    .get(authorize('Admin', 'Operational Manager', 'Munshi'), getRelatedAssignments);

// Change assigned team
router
    .route('/:id/change-team')
    .put(authorize('Admin', 'Operational Manager'), changeAssignedTeam);

router
    .route('/:id')
    .get(authorize('Admin', 'Operational Manager'), getAssignmentById);

module.exports = router;

