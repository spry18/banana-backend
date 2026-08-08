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
    eolEnquiry,
    finalApproveEnquiry,
    reassignSelector,
    editFixedPlot,
    deleteFixedPlot,
    submitPublicEnquiry,
    getPublicEnquiries,
    approvePublicEnquiry,
    rejectPublicEnquiry,
    updatePublicEnquiry,
    deletePublicEnquiry,
} = require('./enquiry.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// --- Public / Unauthenticated route for farmer self-submission ---
router.post('/public', submitPublicEnquiry);

// Apply 'protect' to remaining routes
router.use(protect);

// --- Public Enquiry Review & Management Routes ---
router.get('/public-requests', authorize('Admin', 'Field Owner'), getPublicEnquiries);
router.put('/public-requests/:id', authorize('Admin', 'Field Owner'), updatePublicEnquiry);
router.delete('/public-requests/:id', authorize('Admin', 'Field Owner'), deletePublicEnquiry);
router.patch('/public-requests/:id/approve', authorize('Admin', 'Field Owner'), approvePublicEnquiry);
router.patch('/public-requests/:id/reject', authorize('Admin', 'Field Owner'), rejectPublicEnquiry);

// --- Admin-specific patch routes (must come BEFORE /:id to avoid conflicts) ---
router.get('/reports/missed', authorize('Admin', 'Field Owner'), getMissedPlots);
router.post('/run-sla-check', authorize('Admin', 'Field Owner'), runSlaTimeoutCheck);
router.get('/farmer-history', authorize('Admin', 'Field Owner'), getFarmerEnquiryHistory);
router.put('/:id/reschedule', authorize('Field Owner', 'Admin'), foRescheduleEnquiry);
router.patch('/:id/eol', authorize('Field Owner', 'Admin'), eolEnquiry);
router.patch('/reschedule/:id', authorize('Admin', 'Field Owner'), rescheduleEnquiry);
router.patch('/fix-rate/:id', authorize('Admin', 'Field Owner'), fixRate);
router.post('/:id/final-approve', authorize('Admin'), finalApproveEnquiry);
router.put('/:id/reassign-selector', authorize('Field Owner', 'Admin'), reassignSelector);
router.put('/:id/fixed-plot', authorize('Admin', 'Operational Manager'), editFixedPlot);
router.delete('/:id/fixed-plot', authorize('Admin', 'Operational Manager'), deleteFixedPlot);

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
