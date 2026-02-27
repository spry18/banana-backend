const express = require('express');
const router = express.Router();
const {
    createEnquiry,
    getEnquiries,
    updateEnquiry,
    getEnquiryById,
} = require('./enquiry.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

router
    .route('/')
    .post(authorize('Admin', 'Field Owner'), createEnquiry)
    .get(getEnquiries);

router
    .route('/:id')
    .get(getEnquiryById)
    .put(authorize('Admin', 'Field Owner'), updateEnquiry);

module.exports = router;
