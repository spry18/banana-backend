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
    runSlaTimeoutCheck,
    getMissedPlots,
    getFarmerEnquiryHistory,
} = require('./enquiry.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

// --- Admin-specific patch routes (must come BEFORE /:id to avoid conflicts) ---
router.get('/reports/missed', authorize('Admin', 'Field Owner'), getMissedPlots);
router.post('/run-sla-check', authorize('Admin', 'Field Owner'), runSlaTimeoutCheck);
router.get('/farmer-history', authorize('Admin', 'Field Owner'), getFarmerEnquiryHistory);
router.put('/:id/reschedule', authorize('Field Owner', 'Admin'), foRescheduleEnquiry);
router.patch('/reschedule/:id', authorize('Admin', 'Field Owner'), rescheduleEnquiry);
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
