'use strict';
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middlewares/auth.middleware');
const ctrl = require('./farmerPayment.controller');

router.use(protect, authorize('Admin'));

router.get('/summary', ctrl.getSummary);
router.route('/').get(ctrl.getAll).post(ctrl.create);
router.route('/:id').get(ctrl.getById);

module.exports = router;
