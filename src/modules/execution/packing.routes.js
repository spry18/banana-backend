const express = require('express');
const router = express.Router();
const {
    createPacking,
    getPackings,
} = require('./packing.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

router
    .route('/')
    .post(authorize('Admin', 'Munshi'), createPacking)
    .get(authorize('Admin', 'Operational Manager', 'Munshi'), getPackings);

module.exports = router;
