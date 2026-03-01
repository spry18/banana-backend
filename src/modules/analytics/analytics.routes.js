const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const { masterReport, exportReport } = require('./analytics.controller');

router.use(protect);
router.use(authorize('Admin'));

router.get('/master-report', masterReport);
router.get('/export', exportReport);

module.exports = router;
