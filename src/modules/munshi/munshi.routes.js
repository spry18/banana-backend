const express = require('express');
const router = express.Router();
const {
    getMunshiDashboard,
    getMunshiAssignments,
    assignPickupDriver,
    submitPackingReport,
    getMunshiReports,
    rolloverAssignment,
    getPackingByAssignmentId,
    updatePackingReport,
} = require('./munshi.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');
const { addExtraVehicle } = require('../logistics/logistics.controller');

// Apply protect to all routes
router.use(protect);

const roles = ['Munshi', 'Admin', 'Operational Manager'];

// Phase 2 routes
router.get('/dashboard', authorize(...roles), getMunshiDashboard);
router.get('/assignments', authorize(...roles), getMunshiAssignments);
router.patch('/assignments/:id/pickup', authorize(...roles), assignPickupDriver);
router.post('/assignments/:id/rollover', authorize(...roles), rolloverAssignment);
router.post('/assignments/:id/add-vehicle', authorize(...roles), addExtraVehicle);

// Phase 3 routes
router.post(
    '/packing/:id',
    authorize(...roles),
    upload.array('photos', 10),   // up to 10 packing photos
    submitPackingReport
);
router.get(
    '/assignments/:assignmentId/packing',
    authorize(...roles),
    getPackingByAssignmentId
);
router.put(
    '/assignments/:assignmentId/packing',
    authorize(...roles),
    upload.array('photos', 10),   // up to 10 packing photos
    updatePackingReport
);
router.get('/reports', authorize(...roles), getMunshiReports);
router.get('/packing/:id', authorize(...roles), getPackingByAssignmentId);

module.exports = router;
