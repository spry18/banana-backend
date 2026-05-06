const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const DailyLog = require('../auditing/dailyLog.model');
const User = require('../users/user.model');

// ─────────────────────────────────────────────────────────────────────────────
// Global Shared Pool: all FOs see all enquiries — no per-FO scoping
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Field Owner dashboard KPIs + recent activity
// @route   GET /api/field-owner/dashboard
// @access  Private (Field Owner, Admin)
const getFODashboard = async (req, res) => {
    try {
        const base = {}; // Global Shared Pool: all enquiries regardless of role
        const now = new Date();

        const [
            total,
            selected,
            rejected,
            ratFixed,
            missed,
            futureSelection,
            rescheduled,
            recentEnquiries,
        ] = await Promise.all([
            Enquiry.countDocuments(base),
            Enquiry.countDocuments({ ...base, status: 'SELECTED' }),
            Enquiry.countDocuments({ ...base, status: 'REJECTED' }),
            Enquiry.countDocuments({ ...base, status: { $in: ['RATE_FIXED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] } }),
            // Missed: PENDING and either past scheduledDate OR completely missing a scheduledDate
            Enquiry.countDocuments({
                ...base,
                status: 'PENDING',
                $or: [
                    { scheduledDate: { $lt: now } },
                    { scheduledDate: null },
                    { scheduledDate: { $exists: false } },
                ],
            }),
            // Future Selection: scheduledDate in the future, still PENDING
            Enquiry.countDocuments({ ...base, status: 'PENDING', scheduledDate: { $gt: now } }),
            Enquiry.countDocuments({ ...base, status: 'RESCHEDULED' }),
            // Recent Activity: all strictly SELECTED or RESCHEDULED enquiries for this FO (To-Do list)
            Enquiry.find({ ...base, status: { $in: ['SELECTED', 'RESCHEDULED', 'ASSIGNED'] } })
                .sort({ updatedAt: -1 })
                .select('enquiryId farmerFirstName farmerLastName farmerMobile status location updatedAt generation companyId scheduledDate rescheduleDate editableUntil')
                .populate('generation', 'name')
                .populate('companyId', 'companyName')
                .lean(),
        ]);

        const recentActivity = await Promise.all(
            recentEnquiries.map(async (enq) => {
                const inspection = await Inspection.findOne({ enquiryId: enq._id })
                    .select('packingSize volumeBoxRange recoveryPercent')
                    .lean();

                const isRescheduled = enq.status === 'RESCHEDULED';
                const activity = {
                    _id: enq._id,
                    enquiryId: enq.enquiryId,
                    farmerName: `${enq.farmerFirstName} ${enq.farmerLastName}`.trim(),
                    mobileNo: enq.farmerMobile,
                    location: enq.location,
                    status: enq.status,
                    isRescheduled,
                    scheduledDate: enq.scheduledDate || null,
                    rescheduleDate: isRescheduled ? (enq.rescheduleDate || null) : undefined,
                    generation: enq.generation ? enq.generation.name : 'Unknown',
                    companyName: enq.companyId ? enq.companyId.companyName : 'Pending',
                    packing: inspection ? inspection.packingSize : '-',
                    volume: inspection ? inspection.volumeBoxRange : '-',
                    recovery: inspection ? inspection.recoveryPercent : '-',
                    updatedAt: enq.updatedAt,
                };
                // Show edit window state for all enquiries (FO can edit within 24h of creation/reschedule)
                activity.editableUntil = enq.editableUntil || null;
                activity.isEditable = enq.editableUntil ? new Date() < new Date(enq.editableUntil) : true;
                return activity;
            })
        );

        // Sort: RESCHEDULED items first (highest priority), then by most recently updated
        recentActivity.sort((a, b) => {
            if (a.isRescheduled && !b.isRescheduled) return -1;
            if (!a.isRescheduled && b.isRescheduled) return 1;
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        res.json({
            kpis: {
                total,
                selected,
                rejected,
                fixedRate: ratFixed,
                missed,
                futureSelection,
                rescheduled,
            },
            recentActivity,
        });
    } catch (error) {
        console.error('FO Dashboard error:', error);
        res.status(500).json({ message: 'Server error fetching dashboard', error: error.message });
    }
};

// @desc    List all enquiries owned by this FO (filterable)
// @route   GET /api/field-owner/plots
// @access  Private (Field Owner, Admin)
const getFOPlots = async (req, res) => {
    try {
        const { status, location, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const now = new Date();

        const base = {}; // Global Shared Pool: all enquiries regardless of role
        let query = { ...base };

        // Status filter — 'Missed' is a derived state, not a real enum value
        if (status === 'Missed') {
            query.status = 'PENDING';
            query.scheduledDate = { $lt: now };
        } else if (status === 'Rescheduled') {
            // Rescheduled = PENDING with a scheduledDate in the future (was previously changed)
            query.status = 'PENDING';
            query.scheduledDate = { $gt: now };
        } else if (status) {
            query.status = status;
        }

        if (location) query.location = location;

        if (search) {
            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
                { enquiryId: { $regex: search, $options: 'i' } },
            ];
        }

        const [enquiries, total] = await Promise.all([
            Enquiry.find(query)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('assignedSelectorId', 'firstName lastName mobileNo')
                .populate('companyId', 'companyName')
                .populate('generation', 'name'),
            Enquiry.countDocuments(query),
        ]);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: enquiries,
        });
    } catch (error) {
        console.error('FO Plots error:', error);
        res.status(500).json({ message: 'Server error fetching plots', error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: runs the full selectors-performance aggregation for a date range
// ─────────────────────────────────────────────────────────────────────────────
const _buildSelectorsPerformance = async (startDate, endDate) => {
    // All unique selectorIds across the global pool
    const selectorIds = await Enquiry.find({}).distinct('assignedSelectorId');
    if (!selectorIds.length) return [];

    // KM aggregation from DailyLog
    const logMatch = { userId: { $in: selectorIds }, status: 'COMPLETED' };
    if (startDate || endDate) {
        logMatch.date = {};
        if (startDate) logMatch.date.$gte = new Date(startDate);
        if (endDate) logMatch.date.$lte = new Date(endDate);
    }
    const kmStats = await DailyLog.aggregate([
        { $match: logMatch },
        { $group: { _id: '$userId', totalKm: { $sum: { $subtract: ['$endKm', '$startKm'] } }, totalDays: { $sum: 1 } } },
    ]);

    // Plot aggregation from Inspections
    const inspMatch = { selectorId: { $in: selectorIds } };
    if (startDate || endDate) {
        inspMatch.createdAt = {};
        if (startDate) inspMatch.createdAt.$gte = new Date(startDate);
        if (endDate) inspMatch.createdAt.$lte = new Date(endDate);
    }
    const plotStats = await Inspection.aggregate([
        { $match: inspMatch },
        {
            $group: {
                _id: '$selectorId',
                visitedPlots: { $sum: 1 },
                approved: { $sum: { $cond: [{ $eq: ['$decision', 'APPROVED'] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$decision', 'REJECTED'] }, 1, 0] } },
            },
        },
    ]);

    const kmMap = Object.fromEntries(kmStats.map((s) => [s._id.toString(), s]));
    const plotMap = Object.fromEntries(plotStats.map((s) => [s._id.toString(), s]));
    const selectors = await User.find({ _id: { $in: selectorIds } }).select('firstName lastName mobileNo role');

    const data = selectors.map((user) => {
        const id = user._id.toString();
        return {
            selectorId: user._id,
            name: `${user.firstName} ${user.lastName}`,
            mobileNo: user.mobileNo,
            role: user.role,
            totalKm: kmMap[id]?.totalKm || 0,
            totalDays: kmMap[id]?.totalDays || 0,
            visitedPlots: plotMap[id]?.visitedPlots || 0,
            approvedPlots: plotMap[id]?.approved || 0,
            rejectedPlots: plotMap[id]?.rejected || 0,
        };
    });
    data.sort((a, b) => b.visitedPlots - a.visitedPlots);
    return data;
};

// @desc    Aggregate KM and visited plots for selectors — custom date range
// @route   GET /api/field-owner/selectors-performance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// @access  Private (Field Owner, Admin)
const getSelectorsPerformance = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const data = await _buildSelectorsPerformance(startDate, endDate);
        res.json({ period: 'custom', startDate, endDate, data });
    } catch (error) {
        console.error('Selectors performance error:', error);
        res.status(500).json({ message: 'Server error fetching selectors performance', error: error.message });
    }
};

// @desc    Selectors performance for the current ISO week (Mon–Sun)
// @route   GET /api/field-owner/selectors-performance/weekly
// @access  Private (Field Owner, Admin)
const getSelectorsPerformanceWeekly = async (req, res) => {
    try {
        const now = new Date();
        const day = now.getDay(); // 0=Sun … 6=Sat
        const diffToMonday = (day === 0 ? -6 : 1 - day); // days back to Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const data = await _buildSelectorsPerformance(monday, sunday);
        res.json({
            period: 'weekly',
            startDate: monday.toISOString().slice(0, 10),
            endDate: sunday.toISOString().slice(0, 10),
            data,
        });
    } catch (error) {
        console.error('Selectors weekly performance error:', error);
        res.status(500).json({ message: 'Server error fetching weekly selectors performance', error: error.message });
    }
};

// @desc    Selectors performance for the current calendar month
// @route   GET /api/field-owner/selectors-performance/monthly
// @access  Private (Field Owner, Admin)
const getSelectorsPerformanceMonthly = async (req, res) => {
    try {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const data = await _buildSelectorsPerformance(firstDay, lastDay);
        res.json({
            period: 'monthly',
            startDate: firstDay.toISOString().slice(0, 10),
            endDate: lastDay.toISOString().slice(0, 10),
            data,
        });
    } catch (error) {
        console.error('Selectors monthly performance error:', error);
        res.status(500).json({ message: 'Server error fetching monthly selectors performance', error: error.message });
    }
};

// @desc    Get specific DailyLog mileage detail for a selector
// @route   GET /api/field-owner/selector-mileage/:logId
// @access  Private (Field Owner, Admin)
const getSelectorMileage = async (req, res) => {
    try {
        const log = await DailyLog.findById(req.params.logId)
            .populate('userId', 'firstName lastName mobileNo role');

        if (!log) {
            return res.status(404).json({ message: 'Daily log not found' });
        }

        // Global Shared Pool: any FO can view any selector's mileage log — no ownership guard

        const totalDistance =
            log.endKm && log.startKm ? log.endKm - log.startKm : null;

        res.json({
            logId: log._id,
            date: log.date,
            selector: log.userId,
            vehicleNumber: log.vehicleNumber || 'N/A',
            startKm: log.startKm,
            closeKm: log.endKm || null,
            totalDistance,
            startTime: log.startTime,
            endTime: log.endTime || null,
            status: log.status,
            startMeterPhotoUrl: log.startMeterPhotoUrl,
            endMeterPhotoUrl: log.endMeterPhotoUrl || null,
        });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid log ID format' });
        }
        console.error('Selector mileage error:', error);
        res.status(500).json({ message: 'Server error fetching mileage log', error: error.message });
    }
};

// @desc    Get all active Selectors for Field Owner assignment
// @route   GET /api/field-owner/selectors
// @access  Private (Field Owner, Admin)
const getFOSelectors = async (req, res) => {
    try {
        const selectors = await User.find({ role: 'Field Selector', isActive: true })
            .select('firstName lastName mobileNo role')
            .sort({ firstName: 1, lastName: 1 });

        res.json({ data: selectors });
    } catch (error) {
        console.error('Error fetching selectors:', error);
        res.status(500).json({ message: 'Server error fetching selectors', error: error.message });
    }
};

module.exports = {
    getFODashboard,
    getFOPlots,
    getSelectorsPerformance,
    getSelectorsPerformanceWeekly,
    getSelectorsPerformanceMonthly,
    getSelectorMileage,
    getFOSelectors,
};
