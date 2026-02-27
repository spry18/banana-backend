const express = require('express');
const router = express.Router();
const { getAdminStats } = require('./dashboard.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');

router.use(protect);

router.route('/stats').get(authorize('Admin', 'Operational Manager'), getAdminStats);

module.exports = router;
