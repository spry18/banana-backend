const express = require('express');
const router = express.Router();
const { getSystemAudits } = require('./systemAudit.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// Apply 'protect' to all routes
router.use(protect);

router
    .route('/')
    .get(authorize('Admin'), getSystemAudits);

module.exports = router;
