const express = require('express');
const router = express.Router();
const { startDay, endDay, getLogs } = require('./dailyLog.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

router.use(protect);

router.post('/start', upload.single('startMeterPhoto'), startDay);
router.put('/end', upload.single('endMeterPhoto'), endDay);
router.get('/', authorize('Admin', 'Operational Manager'), getLogs);

module.exports = router;
