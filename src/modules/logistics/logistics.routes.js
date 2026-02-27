const express = require('express');
const router = express.Router();
const {
    createAssignment,
    getAssignments,
    getAssignmentById,
} = require('./logistics.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

router
    .route('/')
    .post(authorize('Admin', 'Operational Manager'), createAssignment)
    .get(authorize('Admin', 'Operational Manager', 'Munshi', 'Driver (Eicher)', 'Driver (Pickup)'), getAssignments);

router.route('/:id').get(getAssignmentById);

module.exports = router;
