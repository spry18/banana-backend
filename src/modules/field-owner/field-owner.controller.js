const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const DailyLog = require('../auditing/dailyLog.model');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build base query scoped to this FO
// ─────────────────────────────────────────────────────────────────────────────
const foQuery = (req) => ({ fieldOwnerId: req.user._id });

// @desc    Field Owner dashboard KPIs + recent activity
// @route   GET /api/field-owner/dashboard
// @access  Private (Field Owner, Admin)
const getFODashboard = async (req, res) => {
    try {
        const base = req.user.role === 'Admin' ? {} : foQuery(req);
        const now = new Date();

        const [
            total,
            selected,
            rejected,
            ratFixed,
            missed,
            futureSelection,
            recentActivity,
        ] = await Promise.all([
            Enquiry.countDocuments(base),
            Enquiry.countDocuments({ ...base, status: 'SELECTED' }),
            Enquiry.countDocuments({ ...base, status: 'REJECTED' }),
            Enquiry.countDocuments({ ...base, status: 'RATE_FIXED' }),
            // Missed: past scheduledDate, still PENDING
            Enquiry.countDocuments({ ...base, status: 'PENDING', scheduledDate: { $lt: now } }),
            // Future Selection: scheduledDate in the future, still PENDING
            Enquiry.countDocuments({ ...base, status: 'PENDING', scheduledDate: { $gt: now } }),
            // Recent Activity: last 5 updated enquiries for this FO
            Enquiry.find(base)
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('enquiryId farmerFirstName farmerLastName status location updatedAt visitPriority')
                .populate('assignedSelectorId', 'firstName lastName'),
        ]);

        res.json({
            kpis: {
                total,
                selected,
                rejected,
                ratFixed,
                missed,
                futureSelection,
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

        const base = req.user.role === 'Admin' ? {} : foQuery(req);
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

// @desc    Aggregate KM and visited plots for selectors assigned by this FO
// @route   GET /api/field-owner/selectors-performance
// @access  Private (Field Owner, Admin)
const getSelectorsPerformance = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Step 1: Find all selectorIds assigned to this FO's enquiries
        const foBase = req.user.role === 'Admin' ? {} : { fieldOwnerId: req.user._id };
        const enquiries = await Enquiry.find(foBase).distinct('assignedSelectorId');

        if (!enquiries.length) {
            return res.json({ data: [] });
        }

        // Step 2: Build DailyLog date filter
        const logMatch = {
            userId: { $in: enquiries },
            status: 'COMPLETED',
        };
        if (startDate || endDate) {
            logMatch.date = {};
            if (startDate) logMatch.date.$gte = new Date(startDate);
            if (endDate) logMatch.date.$lte = new Date(endDate);
        }

        // Step 3: Aggregate KM per selector from DailyLog
        const kmStats = await DailyLog.aggregate([
            { $match: logMatch },
            {
                $group: {
                    _id: '$userId',
                    totalKm: { $sum: { $subtract: ['$endKm', '$startKm'] } },
                    totalDays: { $sum: 1 },
                },
            },
        ]);

        // Step 4: Aggregate visited plots from Inspections for selectors under this FO
        const inspMatch = { selectorId: { $in: enquiries } };
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

        // Step 5: Merge and populate user info
        const kmMap = Object.fromEntries(kmStats.map((s) => [s._id.toString(), s]));
        const plotMap = Object.fromEntries(plotStats.map((s) => [s._id.toString(), s]));

        const User = require('../users/user.model');
        const selectors = await User.find({ _id: { $in: enquiries } }).select('firstName lastName mobileNo role');

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

        // Sort by most visited
        data.sort((a, b) => b.visitedPlots - a.visitedPlots);

        res.json({ data });
    } catch (error) {
        console.error('Selectors performance error:', error);
        res.status(500).json({ message: 'Server error fetching selectors performance', error: error.message });
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

        // If FO, verify the selector belongs to one of their enquiries
        if (req.user.role === 'Field Owner') {
            const foBase = { fieldOwnerId: req.user._id, assignedSelectorId: log.userId };
            const linked = await Enquiry.exists(foBase);
            if (!linked) {
                return res.status(403).json({
                    message: 'Forbidden: This log does not belong to a selector assigned to your enquiries',
                });
            }
        }

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

module.exports = {
    getFODashboard,
    getFOPlots,
    getSelectorsPerformance,
    getSelectorMileage,
};
