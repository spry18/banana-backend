const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const Trip = require('../execution/trip.model');
const DailyLog = require('../auditing/dailyLog.model');
const User = require('../users/user.model');

// @desc    Get comprehensive Admin dashboard KPIs
// @route   GET /api/admin/dashboard-stats
// @access  Private (Admin, Operational Manager)
const getAdminStats = async (req, res) => {
    try {
        const [
            totalEnquiries,
            pendingVisits,
            selectedPlots,
            rejectedPlots,
            ratFixedPlots,
            assignedPlots,
            completedPlots,
            tripsCompleted,
            missedFieldsCount,
            eodIssuesCount,
        ] = await Promise.all([
            Enquiry.countDocuments(),
            Enquiry.countDocuments({ status: 'PENDING' }),
            Enquiry.countDocuments({ status: 'SELECTED' }),
            Enquiry.countDocuments({ status: 'REJECTED' }),
            Enquiry.countDocuments({ status: 'RATE_FIXED' }),
            Enquiry.countDocuments({ status: 'ASSIGNED' }),
            Enquiry.countDocuments({ status: 'COMPLETED' }),
            // Trips: locked trips = completed (Trip model has no status field)
            Trip.countDocuments({ isLocked: true }),
            // Missed Fields: scheduledDate passed AND no inspection yet
            Enquiry.countDocuments({
                scheduledDate: { $lt: new Date() },
                status: 'PENDING',
            }),
            // EOD Issues: DailyLogs started but no endMeterPhotoUrl (past today's start)
            DailyLog.countDocuments({
                status: 'STARTED',
                endMeterPhotoUrl: { $exists: false },
                startTime: { $lt: new Date(Date.now() - 12 * 60 * 60 * 1000) }, // >12h ago
            }),
        ]);

        const alertsCount = missedFieldsCount + eodIssuesCount;

        res.json({
            enquiries: {
                total: totalEnquiries,
                pending: pendingVisits,
                selected: selectedPlots,
                rejected: rejectedPlots,
                ratFixed: ratFixedPlots,
                assigned: assignedPlots,
                completed: completedPlots,
            },
            tripsCompleted,
            alertsCount,
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ message: 'Server error while fetching dashboard stats' });
    }
};

// @desc    Get actionable Admin alerts feed
// @route   GET /api/admin/alerts
// @access  Private (Admin)
const getAlerts = async (req, res) => {
    try {
        const now = new Date();
        const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000);

        // 1. Missed Fields: enquiries with a past scheduledDate still in PENDING
        const missedFields = await Enquiry.find({
            scheduledDate: { $lt: now },
            status: 'PENDING',
        })
            .select('enquiryId farmerFirstName farmerLastName location scheduledDate visitPriority assignedSelectorId')
            .populate('assignedSelectorId', 'firstName lastName mobileNo')
            .sort({ scheduledDate: 1 })
            .limit(50);

        // 2. Missing Uploads: Trips with no unloadSlipUrl (toll slip proxy)
        const missingUploads = await Trip.find({
            $or: [
                { weightSlipUrl: { $exists: false } },
                { weightSlipUrl: null },
                { dieselSlipUrl: { $exists: false } },
                { dieselSlipUrl: null },
            ],
        })
            .select('_id driverId assignmentId createdAt')
            .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
            .sort({ createdAt: -1 })
            .limit(50);

        // 3. EOD Issues: DailyLogs that were started >12h ago with no endMeterPhoto
        const eodIssues = await DailyLog.find({
            status: 'STARTED',
            endMeterPhotoUrl: { $exists: false },
            startTime: { $lt: twelveHoursAgo },
        })
            .populate('userId', 'firstName lastName role mobileNo')
            .sort({ startTime: 1 })
            .limit(50);

        res.json({
            counts: {
                missedFields: missedFields.length,
                missingUploads: missingUploads.length,
                eodIssues: eodIssues.length,
                total: missedFields.length + missingUploads.length + eodIssues.length,
            },
            missedFields,
            missingUploads,
            eodIssues,
        });
    } catch (error) {
        console.error('Alerts fetch error:', error);
        res.status(500).json({ message: 'Server error while fetching alerts' });
    }
};

// @desc    Get field selection overview (daily aggregation)
// @route   GET /api/admin/field-selection/overview
// @access  Private (Admin)
const getFieldSelectionOverview = async (req, res) => {
    try {
        // Group inspections by date
        const dailyStats = await Inspection.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                    },
                    totalVisited: { $sum: 1 },
                    selected: {
                        $sum: { $cond: [{ $eq: ['$decision', 'APPROVED'] }, 1, 0] },
                    },
                    rejected: {
                        $sum: { $cond: [{ $eq: ['$decision', 'REJECTED'] }, 1, 0] },
                    },
                },
            },
            { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
            { $limit: 30 }, // Last 30 days
        ]);

        // Future scheduled selections
        const futureScheduled = await Enquiry.find({
            scheduledDate: { $gt: new Date() },
            status: 'PENDING',
        })
            .select('enquiryId farmerFirstName location scheduledDate visitPriority assignedSelectorId')
            .populate('assignedSelectorId', 'firstName lastName')
            .sort({ scheduledDate: 1 })
            .limit(20);

        // Pipeline totals
        const pipeline = await Enquiry.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const statusSummary = pipeline.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
        }, {});

        res.json({ dailyStats, futureScheduled, statusSummary });
    } catch (error) {
        console.error('Field selection overview error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get staff performance metrics
// @route   GET /api/admin/performance/staff
// @access  Private (Admin)
const getStaffPerformance = async (req, res) => {
    try {
        // Field Selectors: total visited plots + total KM from DailyLogs
        const selectorStats = await DailyLog.aggregate([
            { $match: { status: 'COMPLETED' } },
            {
                $group: {
                    _id: '$userId',
                    totalKm: {
                        $sum: { $subtract: [{ $ifNull: ['$endKm', 0] }, '$startKm'] },
                    },
                    totalTrips: { $sum: 1 },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 1,
                    totalKm: 1,
                    totalTrips: 1,
                    name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
                    role: '$user.role',
                    mobile: '$user.mobileNo',
                },
            },
            { $sort: { totalKm: -1 } },
        ]);

        // Field Selectors: visited plots count from Inspections
        const visitedPlotsPerSelector = await Inspection.aggregate([
            {
                $group: {
                    _id: '$selectorId',
                    visitedPlots: { $sum: 1 },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$decision', 'APPROVED'] }, 1, 0] },
                    },
                    rejected: {
                        $sum: { $cond: [{ $eq: ['$decision', 'REJECTED'] }, 1, 0] },
                    },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            {
                $project: {
                    visitedPlots: 1,
                    approved: 1,
                    rejected: 1,
                    name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
                    role: '$user.role',
                },
            },
            { $sort: { visitedPlots: -1 } },
        ]);

        // Field Owners: assigned plots count from Enquiries
        const ownerStats = await Enquiry.aggregate([
            {
                $group: {
                    _id: '$fieldOwnerId',
                    totalAssigned: { $sum: 1 },
                    selected: {
                        $sum: { $cond: [{ $eq: ['$status', 'SELECTED'] }, 1, 0] },
                    },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
                    },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            {
                $project: {
                    totalAssigned: 1,
                    selected: 1,
                    completed: 1,
                    name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
                    role: '$user.role',
                },
            },
            { $sort: { totalAssigned: -1 } },
        ]);

        res.json({
            fieldSelectors: {
                kmStats: selectorStats,
                plotStats: visitedPlotsPerSelector,
            },
            fieldOwners: ownerStats,
        });
    } catch (error) {
        console.error('Staff performance error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Field Visit Monitoring Dashboard — counts + filterable table
// @route   GET /api/admin/field-selection/monitoring
// @access  Private (Admin, Operational Manager)
const getMonitoringDashboard = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            location,
            fieldOwner,
            assignedSelector,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);
        const now = new Date();

        // ── Top card counts ──────────────────────────────────────────────
        const [
            totalPlots,
            selected,
            rejected,
            missed,
            futureSelection,
        ] = await Promise.all([
            Enquiry.countDocuments(),
            Enquiry.countDocuments({ status: 'SELECTED' }),
            Enquiry.countDocuments({ status: 'REJECTED' }),
            Enquiry.countDocuments({ scheduledDate: { $lt: now }, status: 'PENDING' }),
            Enquiry.countDocuments({ scheduledDate: { $gt: now } }),
        ]);

        // ── Table filter query ───────────────────────────────────────────
        const query = {};

        if (status) {
            if (status === 'Missed') {
                query.scheduledDate = { $lt: now };
                query.status = 'PENDING';
            } else {
                query.status = status;
            }
        }

        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }

        if (fieldOwner) {
            query.fieldOwnerId = fieldOwner;
        }

        if (assignedSelector) {
            query.assignedSelectorId = assignedSelector;
        }

        const total = await Enquiry.countDocuments(query);

        const tableData = await Enquiry.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate('fieldOwnerId', 'firstName lastName mobileNo')
            .populate('assignedSelectorId', 'firstName lastName mobileNo')
            .lean();

        res.json({
            counts: { totalPlots, selected, rejected, missed, futureSelection },
            tableData,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
        });
    } catch (error) {
        console.error('Monitoring dashboard error:', error);
        res.status(500).json({ message: 'Server error while fetching monitoring dashboard' });
    }
};

module.exports = {
    getAdminStats,
    getAlerts,
    getFieldSelectionOverview,
    getStaffPerformance,
    getMonitoringDashboard,
};
