const express = require('express');
const router = express.Router();
const {
    getDriverDashboard,
    getDriverHistory,
    submitTripReport,
    updateTripReport,
    getDriverReports,
    getDriverAssignments,
    updateTransitStatus,
    getDriverProfile,
} = require('./driver.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

// Apply protect to all routes
router.use(protect);

const roles = ['driver eicher', 'driver pickup', 'Admin', 'Operational Manager'];

// Phase 2 routes
router.get('/dashboard', authorize(...roles), getDriverDashboard);
router.get('/history', authorize(...roles), getDriverHistory);

// Phase 3 routes
router.post(
    '/trips/:assignmentId',
    authorize(...roles),
    upload.fields([
        // Eicher uploads
        { name: 'weightSlipPhoto', maxCount: 1 },
        { name: 'dieselSlipPhoto', maxCount: 1 },
        { name: 'unloadSlipPhoto', maxCount: 1 },
        { name: 'endKmPhoto', maxCount: 1 },
        // Pickup uploads
        { name: 'uploadSlipPhoto', maxCount: 1 },
        { name: 'meterPhoto', maxCount: 1 },
    ]),
    submitTripReport
);
router.patch(
    '/trips/:id',
    authorize(...roles),
    upload.fields([
        { name: 'weightSlipPhoto', maxCount: 1 },
        { name: 'dieselSlipPhoto', maxCount: 1 },
        { name: 'unloadSlipPhoto', maxCount: 1 },
        { name: 'endKmPhoto', maxCount: 1 },
        { name: 'uploadSlipPhoto', maxCount: 1 },
        { name: 'meterPhoto', maxCount: 1 },
    ]),
    updateTripReport
);
router.get('/reports', authorize(...roles), getDriverReports);


// Profile
router.get('/profile', authorize(...roles), getDriverProfile);

// Assignments
router.get('/assignments', authorize(...roles), getDriverAssignments);
router.patch('/assignments/:id/status', authorize(...roles), updateTransitStatus);

module.exports = router;
