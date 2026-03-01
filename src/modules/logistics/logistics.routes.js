const express = require('express');
const router = express.Router();
const {
    createAssignment,
    getAssignments,
    getAssignmentById,
} = require('./logistics.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

router.use(protect);

// Phase 5: Renamed from POST / to POST /assign
router
    .route('/assign')
    .post(authorize('Admin', 'Operational Manager'), createAssignment);

router
    .route('/')
    .get(authorize('Admin', 'Operational Manager', 'Munshi', 'Driver (Eicher)', 'Driver (Pickup)'), getAssignments);

router.route('/:id').get(getAssignmentById);

module.exports = router;
