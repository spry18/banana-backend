const express = require('express');
const router = express.Router();
const {
    createAssignment,
    getAssignments,
    getAssignmentById,
    addExtraVehicle,
    getRelatedAssignments,
} = require('./logistics.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

router.use(protect);

// Phase 5: Renamed from POST / to POST /assign
router
    .route('/assign')
    .post(authorize('Admin', 'Operational Manager'), createAssignment);

router
    .route('/')
    .get(authorize('Admin', 'Operational Manager', 'Munshi', 'driver eicher', 'driver pickup'), getAssignments);

// Add extra vehicle (overflow) to an existing assignment
router
    .route('/:id/add-vehicle')
    .post(authorize('Admin', 'Operational Manager', 'Munshi'), addExtraVehicle);

// Get all related assignments (original + rollovers + overflows)
router
    .route('/:id/related')
    .get(authorize('Admin', 'Operational Manager', 'Munshi'), getRelatedAssignments);

router
    .route('/:id')
    .get(authorize('Admin', 'Operational Manager'), getAssignmentById);

module.exports = router;

