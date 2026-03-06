const DailyLog = require('./dailyLog.model');

// @desc    Start day log
// @route   POST /api/daily-logs/start
// @access  Protected
const startDay = async (req, res) => {
    try {
        const { startKm, vehicleNumber, petrolAdvance } = req.body;

        // req.files is now an object keyed by field name (from upload.fields)
        const startKmPhotoFile = req.files?.startKmPhoto?.[0];
        const petrolReceiptPhotoFile = req.files?.petrolReceiptPhoto?.[0];

        if (!startKm || !startKmPhotoFile) {
            return res.status(400).json({ message: 'startKm and startKmPhoto are required' });
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const existingLog = await DailyLog.findOne({
            userId: req.user._id,
            date: { $gte: startOfToday, $lt: endOfToday },
        });

        if (existingLog) {
            return res.status(400).json({ message: 'You have already started a day log for today' });
        }

        const dailyLog = await DailyLog.create({
            userId: req.user._id,
            startKm,
            startMeterPhotoUrl: `/uploads/${startKmPhotoFile.filename}`,
            vehicleNumber: vehicleNumber || null,
            // Petrol advance fields (optional — only submitted by Field Selectors)
            petrolAdvance: petrolAdvance ? Number(petrolAdvance) : null,
            petrolReceiptPhoto: petrolReceiptPhotoFile
                ? `/uploads/${petrolReceiptPhotoFile.filename}`
                : null,
        });

        res.status(201).json(dailyLog);
    } catch (error) {
        console.error('Error starting day:', error);
        res.status(500).json({ message: 'Server error while starting day' });
    }
};

// @desc    End day log
// @route   PUT /api/daily-logs/end
// @access  Protected
const endDay = async (req, res) => {
    try {
        const { endKm } = req.body;

        // route uses upload.single('endKmPhoto') — file lands on req.file
        if (!endKm || !req.file) {
            return res.status(400).json({ message: 'endKm and endKmPhoto are required' });
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        const log = await DailyLog.findOne({
            userId: req.user._id,
            date: { $gte: startOfToday, $lt: endOfToday },
            status: 'STARTED',
        });

        if (!log) {
            return res.status(404).json({ message: 'No active day log found for today' });
        }

        if (Number(endKm) <= log.startKm) {
            return res.status(400).json({ message: `endKm (${endKm}) must be greater than startKm (${log.startKm})` });
        }

        log.endKm = endKm;
        log.endMeterPhotoUrl = `/uploads/${req.file.filename}`;
        log.endTime = Date.now();
        log.status = 'COMPLETED';

        await log.save();

        res.status(200).json(log);
    } catch (error) {
        console.error('Error ending day:', error);
        res.status(500).json({ message: 'Server error while ending day' });
    }
};

// @desc    Get all daily logs (Admin, OM)
// @route   GET /api/daily-logs
// @access  Protected
const getLogs = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const logs = await DailyLog.find()
            .skip(skip)
            .limit(Number(limit))
            .sort({ createdAt: -1 })
            .populate('userId', 'firstName lastName role');

        const total = await DailyLog.countDocuments();

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: logs
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ message: 'Server error while fetching logs' });
    }
};

module.exports = {
    startDay,
    endDay,
    getLogs
};
