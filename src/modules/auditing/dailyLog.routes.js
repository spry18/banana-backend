const express = require('express');
const router = express.Router();
const { startDay, endDay, getLogs } = require('./dailyLog.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

router.use(protect);

const fieldRoles = ['Field Selector', 'Driver (Eicher)', 'Driver (Pickup)'];

// Accept two named files: odometer photo + petrol receipt photo
router.post('/start', authorize(...fieldRoles), upload.fields([
    { name: 'startKmPhoto', maxCount: 1 },
    { name: 'petrolReceiptPhoto', maxCount: 1 },
]), startDay);
// PATCH (not PUT) — partial update of existing day log
router.patch('/end', authorize(...fieldRoles), upload.single('endKmPhoto'), endDay);
router.get('/', authorize('Admin', 'Operational Manager'), getLogs);

module.exports = router;
