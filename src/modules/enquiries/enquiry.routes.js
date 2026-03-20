const express = require('express');
const router = express.Router();
const {
    createEnquiry,
    getEnquiries,
    updateEnquiry,
    getEnquiryById,
    rescheduleEnquiry,
    fixRate,
    foRescheduleEnquiry,
} = require('./enquiry.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

// --- Admin-specific patch routes (must come BEFORE /:id to avoid conflicts) ---
router.put('/:id/reschedule', authorize('Field Owner', 'Admin'), foRescheduleEnquiry);
router.patch('/reschedule/:id', authorize('Admin'), rescheduleEnquiry);
router.patch('/fix-rate/:id', authorize('Admin', 'Field Owner'), fixRate);

// --- Standard CRUD ---
router
    .route('/')
    .post(authorize('Admin', 'Field Owner'), createEnquiry)
    .get(getEnquiries);

router
    .route('/:id')
    .get(authorize('Admin', 'Field Owner', 'Operational Manager'), getEnquiryById)
    .put(authorize('Admin', 'Field Owner'), updateEnquiry);

module.exports = router;
