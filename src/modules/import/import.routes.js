const express = require('express');
const router = express.Router();
const { importMasterData, importEnquiries } = require('./import.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

// All import routes are Admin-only
router.post('/master-data', protect, authorize('Admin'), importMasterData);
router.post('/enquiries',   protect, authorize('Admin'), importEnquiries);

module.exports = router;
