const express = require('express');
const router = express.Router();
const {
    createTrip,
    getTrips,
} = require('./trip.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

// Apply 'protect' to all routes
router.use(protect);

router
    .route('/')
    .post(authorize('Admin', 'driver eicher', 'driver pickup'), upload.fields([
        { name: 'weightSlipUrl', maxCount: 1 },
        { name: 'dieselSlipUrl', maxCount: 1 },
        { name: 'unloadSlipUrl', maxCount: 1 }
    ]), createTrip)
    .get(authorize('Admin', 'Operational Manager', 'driver eicher', 'driver pickup'), getTrips);

module.exports = router;
