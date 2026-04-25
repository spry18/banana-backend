const express = require('express');
const router = express.Router();
const { createAdvance, getAdvanceHistory } = require('./petrolAdvance.controller');
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
        authorize('Admin', 'Operational Manager', 'Field Owner', 'Field Selector'),
        getAdvanceHistory
    );

module.exports = router;
