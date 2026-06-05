const DailyLog = require('./dailyLog.model');
const { getFullUrl } = require('../../utils/urlHelper');

// ── IST midnight helper ────────────────────────────────────────────────────
// Server is UTC; app users are in IST (UTC+5:30).
// Returns { startOfToday, endOfToday } as UTC Date objects that represent
// 00:00:00 IST – 23:59:59 IST of the CURRENT IST calendar day.
// This matches the same pattern used in field-owner.controller.js.
const getIstTodayBounds = () => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowUtc  = new Date();
    const nowIst  = new Date(nowUtc.getTime() + IST_OFFSET_MS);
    const istMid  = new Date(nowIst);
    istMid.setUTCHours(0, 0, 0, 0);                              // midnight expressed in UTC
    const startOfToday = new Date(istMid.getTime() - IST_OFFSET_MS); // shift back to UTC
    const endOfToday   = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1); // 23:59:59.999
    return { startOfToday, endOfToday };
};

// @desc    Start day log
// @route   POST /api/daily-logs/start
// @access  Protected
const startDay = async (req, res) => {
    try {
        const { startKm, vehicleNumber, petrolAdvance } = req.body;

        // req.files is now an object keyed by field name (from upload.fields)
        const startKmPhotoFile = req.files?.startKmPhoto?.[0];
        const petrolReceiptPhotoFile = req.files?.petrolReceiptPhoto?.[0];

        if (!startKm) {
            return res.status(400).json({ message: 'startKm is required' });
        }

        // Use IST-aligned today boundary so users in IST are not affected by UTC day roll-over
        const { startOfToday, endOfToday } = getIstTodayBounds();

        const existingLog = await DailyLog.findOne({
            userId: req.user._id,
            date: { $gte: startOfToday, $lte: endOfToday },
        });

        if (existingLog) {
            return res.status(400).json({ message: 'You have already started a day log for today' });
        }

        const dailyLog = await DailyLog.create({
            userId: req.user._id,
            startKm,
            startMeterPhotoUrl: startKmPhotoFile ? startKmPhotoFile.location : null,
            vehicleNumber: vehicleNumber || null,
            // Petrol advance fields (optional — only submitted by Field Selectors)
            petrolAdvance: petrolAdvance ? Number(petrolAdvance) : null,
            petrolReceiptPhoto: petrolReceiptPhotoFile
                ? petrolReceiptPhotoFile.location
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

        // Use IST-aligned today boundary (same as startDay)
        const { startOfToday, endOfToday } = getIstTodayBounds();

        const log = await DailyLog.findOne({
            userId: req.user._id,
            date: { $gte: startOfToday, $lte: endOfToday },
            status: 'STARTED',
        });

        if (!log) {
            return res.status(404).json({ message: 'No active day log found for today' });
        }

        if (Number(endKm) <= log.startKm) {
            return res.status(400).json({ message: `endKm (${endKm}) must be greater than startKm (${log.startKm})` });
        }

        log.endKm = endKm;
        log.endMeterPhotoUrl = req.file.location;
        log.endTime = Date.now();
        log.status = 'COMPLETED';

        await log.save();

        res.status(200).json(log);
    } catch (error) {
        console.error('Error ending day:', error);
        res.status(500).json({ message: 'Server error while ending day' });
    }
};

// @desc    Get all daily logs (Admin, OM, Field Owner)
// @route   GET /api/daily-logs
// @access  Protected
// @query   userId, role, status, startDate, endDate, page, limit
const getLogs = async (req, res) => {
    try {
        const { userId, role, status, startDate, endDate, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Build match filter
        const match = {};
        if (userId) match.userId = userId;
        if (status) match.status = status;
        if (startDate || endDate) {
            match.date = {};
            if (startDate) match.date.$gte = new Date(startDate);
            if (endDate)   match.date.$lte = new Date(endDate);
        }

        // If filtering by role, we need a lookup + match on the user document
        let logs, total;
        if (role) {
            const pipeline = [
                { $match: match },
                { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
                { $unwind: '$user' },
                { $match: { 'user.role': role } },
                { $sort: { createdAt: -1 } },
                {
                    $project: {
                        date: 1, startKm: 1, endKm: 1, startTime: 1, endTime: 1,
                        vehicleNumber: 1, status: 1, startMeterPhotoUrl: 1, endMeterPhotoUrl: 1,
                        petrolAdvance: 1, createdAt: 1,
                        userId: { _id: '$user._id', firstName: '$user.firstName', lastName: '$user.lastName', role: '$user.role' },
                    },
                },
            ];
            const countPipeline = [...pipeline, { $count: 'total' }];
            const [countResult] = await DailyLog.aggregate(countPipeline);
            total = countResult?.total || 0;
            logs = await DailyLog.aggregate([...pipeline, { $skip: skip }, { $limit: Number(limit) }]);
        } else {
            [logs, total] = await Promise.all([
                DailyLog.find(match)
                    .skip(skip)
                    .limit(Number(limit))
                    .sort({ createdAt: -1 })
                    .populate('userId', 'firstName lastName role')
                    .lean(),
                DailyLog.countDocuments(match),
            ]);
        }

        const data = logs.map(log => {
            if (log.startMeterPhotoUrl) log.startMeterPhotoUrl = getFullUrl(req, log.startMeterPhotoUrl);
            if (log.endMeterPhotoUrl) log.endMeterPhotoUrl = getFullUrl(req, log.endMeterPhotoUrl);
            if (log.petrolReceiptPhoto) log.petrolReceiptPhoto = getFullUrl(req, log.petrolReceiptPhoto);
            return log;
        });

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ message: 'Server error while fetching logs' });
    }
};

// @desc    Check if the logged-in user has already started their day today
// @route   GET /api/daily-logs/check-today
// @access  Protected (Field Selector, driver eicher, driver pickup, Munshi)
const checkTodayLogStatus = async (req, res) => {
    try {
        // Use IST-aligned today boundary (same as startDay / endDay)
        const { startOfToday, endOfToday } = getIstTodayBounds();

        const log = await DailyLog.findOne({
            userId: req.user._id,
            date: { $gte: startOfToday, $lte: endOfToday },
        }).lean();

        if (log) {
            return res.status(200).json({
                isStarted: true,
                logId: log._id,
                role: req.user.role,
            });
        }

        return res.status(200).json({ isStarted: false });
    } catch (error) {
        console.error('Error checking today log status:', error);
        res.status(500).json({ message: 'Server error while checking today log status' });
    }
};

module.exports = {
    startDay,
    endDay,
    getLogs,
    checkTodayLogStatus,
};
