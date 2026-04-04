const express = require('express');
const router = express.Router();
const { startDay, endDay, getLogs, checkTodayLogStatus } = require('./dailyLog.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

router.use(protect);

const fieldRoles = ['Field Selector', 'driver eicher', 'driver pickup', 'Munshi'];

// Check if the user has already started their day (no file upload needed)
router.get('/check-today', authorize(...fieldRoles), checkTodayLogStatus);

// Accept two named files: odometer photo + petrol receipt photo
router.post('/start', authorize(...fieldRoles), upload.fields([
    { name: 'startKmPhoto', maxCount: 1 },
    { name: 'petrolReceiptPhoto', maxCount: 1 },
]), startDay);
// PATCH (not PUT) — partial update of existing day log
router.patch('/end', authorize(...fieldRoles), upload.single('endKmPhoto'), endDay);
router.get('/', authorize('Admin', 'Operational Manager', 'Field Owner'), getLogs);

module.exports = router;
