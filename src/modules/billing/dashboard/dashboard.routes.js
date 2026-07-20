'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./dashboard.controller');

router.use(protect, authorize('Admin'));

router.get('/summary',           ctrl.getSummary);
router.get('/sales-by-company',  ctrl.getSalesByCompany);
router.get('/overdue-farmers',   ctrl.getOverdueFarmers);
router.get('/harvest-chart',     ctrl.getHarvestChart);
router.get('/outstanding-chart', ctrl.getOutstandingChart);

module.exports = router;
