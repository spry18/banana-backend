const express = require('express');
const router = express.Router();
const { createAdvance, getAdvanceHistory, getDistribution } = require('./dieselAdvance.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

// Apply protect to all routes
router.use(protect);

router
    .route('/')
    .post(
        authorize('Admin', 'Operational Manager', 'Field Owner'),
        upload.single('receiptPhoto'),  // optional photo of advance receipt
        createAdvance
    )
    .get(
        authorize('Admin', 'Operational Manager', 'Field Owner', 'Field Selector', 'driver eicher', 'driver pickup'),
        getAdvanceHistory
    );

// GET /api/diesel-advance/distribution?groupBy=day|month|year&driverId=<optional>
router.get(
    '/distribution',
    authorize('Admin', 'Operational Manager'),
    getDistribution
);

module.exports = router;
