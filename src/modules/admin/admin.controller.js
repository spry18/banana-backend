const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const Trip = require('../execution/trip.model');
const DailyLog = require('../auditing/dailyLog.model');
const User = require('../users/user.model');
const Logistics = require('../logistics/logistics.model');

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
            rescheduledPlots,
        ] = await Promise.all([
            Enquiry.countDocuments(),
            Enquiry.countDocuments({ status: 'PENDING' }),
            Enquiry.countDocuments({ status: 'SELECTED' }),
            Enquiry.countDocuments({ status: 'REJECTED' }),
            Enquiry.countDocuments({ status: 'RATE_FIXED' }),
            Enquiry.countDocuments({ status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } }),
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
            Enquiry.countDocuments({ status: 'RESCHEDULED' }),
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
                missedPlots: missedFieldsCount,
                rescheduled: rescheduledPlots,
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
// @route   GET /api/admin/field-selection/monitoring  (legacy alias kept)
// @route   GET /api/admin/field-visit-monitoring      (new frontend contract URL)
// @access  Private (Admin, Operational Manager)
const getMonitoringDashboard = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            location,
            fieldOwner,
            selector,          // frontend sends ?selector=id
            date,              // frontend sends ?date=YYYY-MM-DD
            companyId,
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

        // ── Filter dropdown seed data (locations, owners, selectors) ─────
        const [locationDocs, ownerDocs, selectorDocs] = await Promise.all([
            Enquiry.distinct('location'),
            User.find({ role: 'Field Owner', isActive: true }).select('_id firstName lastName').lean(),
            User.find({ role: 'Field Selector', isActive: true }).select('_id firstName lastName').lean(),
        ]);

        const filters = {
            locations: locationDocs.filter(Boolean),
            fieldOwners: ownerDocs.map(u => ({ id: u._id, name: `${u.firstName} ${u.lastName}` })),
            selectors: selectorDocs.map(u => ({ id: u._id, name: `${u.firstName} ${u.lastName}` })),
        };

        // ── Table filter query ───────────────────────────────────────────
        const query = {};

        if (status) {
            if (status === 'MISSED') {
                query.scheduledDate = { $lt: now };
                query.status = 'PENDING';
            } else if (status === 'FUTURE_SELECTION') {
                query.scheduledDate = { $gt: now };
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

        if (companyId) {
            query.companyId = companyId;
        }

        if (selector) {
            query.assignedSelectorId = selector;
        }

        if (date) {
            const start = new Date(date);
            const end = new Date(date);
            end.setDate(end.getDate() + 1);
            query.scheduledDate = { $gte: start, $lt: end };
        }

        const total = await Enquiry.countDocuments(query);

        const rawTable = await Enquiry.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('assignedSelectorId', 'firstName lastName')
            .lean();

        const tableEnquiryIds = rawTable.map(e => e._id);
        const associatedInspections = await Inspection.find({ enquiryId: { $in: tableEnquiryIds } }).lean();
        const inspectionMap = associatedInspections.reduce((acc, ins) => {
            acc[ins.enquiryId.toString()] = ins;
            return acc;
        }, {});

        // Map to exact frontend contract shape
        const tableData = rawTable.map(e => {
            // Determine effective status for MISSED tab
            let effectiveStatus = e.status;
            if (e.status === 'PENDING' && e.scheduledDate && new Date(e.scheduledDate) < now) {
                effectiveStatus = 'MISSED';
            }

            // Dynamic button logic
            const buttonMap = {
                PENDING: 'View Details',
                SELECTED: 'Fix Rate',
                MISSED: 'Reassign',
                RESCHEDULED: 'Reschedule',
                ASSIGNED: 'View Details',
                REJECTED: 'View Details',
                RATE_FIXED: 'View Details',
                IN_PROGRESS: 'View Details',
                COMPLETED: 'View Details',
            };

            const inspection = inspectionMap[e._id.toString()];

            return {
                id: e._id,
                enquiryId: e.enquiryId,
                farmerName: `${e.farmerFirstName} ${e.farmerLastName}`,
                location: e.location,
                fieldOwner: e.fieldOwnerId
                    ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}`
                    : null,
                fieldSelector: e.assignedSelectorId
                    ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}`
                    : null,
                // Requirement Fix: "Visited Date" should prioritize inspection time, then fallback to scheduled
                visitDate: inspection 
                    ? new Date(inspection.createdAt).toLocaleDateString('en-IN') 
                    : (e.scheduledDate ? new Date(e.scheduledDate).toLocaleDateString('en-IN') : null),
                // Requirement Fix: "Harvesting Time" should prioritize the choice made by the selector during inspection
                harvestTime: inspection ? inspection.harvestingTime : (e.scheduledTime || null),
                status: effectiveStatus,

                action: buttonMap[effectiveStatus] || 'View Details',
            };
        });


        const totalPages = Math.ceil(total / Number(limit));

        res.json({
            counts: { totalPlots, selected, rejected, futureSelection, missed },
            filters,
            tableData,
            pagination: { page: Number(page), totalPages },
        });
    } catch (error) {
        console.error('Monitoring dashboard error:', error);
        res.status(500).json({ message: 'Server error while fetching monitoring dashboard' });
    }
};

// @desc    Field Selection Management consolidated dashboard
// @route   GET /api/admin/field-selection-dashboard
// @access  Private (Admin, Operational Manager)
const getFieldSelectionDashboard = async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        // ── Stats ─────────────────────────────────────────────────────────
        const [
            todayVisited,
            selectedCount,
            rejectedCount,
            futureSelection,
            missedCount,
            fixRateCount,
        ] = await Promise.all([
            // Inspections submitted today
            Inspection.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } }),
            Enquiry.countDocuments({ status: 'SELECTED' }),
            Enquiry.countDocuments({ status: 'REJECTED' }),
            Enquiry.countDocuments({ scheduledDate: { $gt: now }, status: 'PENDING' }),
            Enquiry.countDocuments({ scheduledDate: { $lt: now }, status: 'PENDING' }),
            Enquiry.countDocuments({ status: 'RATE_FIXED' }),
        ]);

        // ── Today's Visited Plots ─────────────────────────────────────────
        const todayInspections = await Inspection.find({
            createdAt: { $gte: todayStart, $lt: todayEnd },
        })
            .populate({
                path: 'enquiryId',
                select: 'farmerFirstName farmerLastName location fieldOwnerId assignedSelectorId farmerMobile plantCount purchaseRate companyId',
                populate: [
                    { path: 'fieldOwnerId', select: 'firstName lastName' },
                    { path: 'assignedSelectorId', select: 'firstName lastName' },
                    { path: 'companyId', select: 'companyName' },
                ],
            })
            .lean();

        const todayVisitedPlots = todayInspections.map(ins => {
            const e = ins.enquiryId || {};
            return {
                enquiryId: e._id || null,
                farmerName: e.farmerFirstName ? `${e.farmerFirstName} ${e.farmerLastName}` : 'Unknown',
                location: e.location || null,
                fieldOwner: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : null,
                fieldSelector: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : null,
                farmerMobile: e.farmerMobile || 'N/A',
                plantCount: e.plantCount || 0,
                company: e.companyId ? e.companyId.companyName : 'N/A',
                rate: e.purchaseRate ? `₹${e.purchaseRate}/kg` : 'Not Fixed',
                status: ins.decision === 'APPROVED' ? 'SELECTED' : ins.decision === 'REJECTED' ? 'REJECTED' : ins.decision,
            };
        });

        // ── Field Selector Data (aggregated from DailyLogs + Inspections) ─
        const selectorKmAgg = await DailyLog.aggregate([
            { $match: { status: 'COMPLETED' } },
            {
                $group: {
                    _id: '$userId',
                    totalKM: { $sum: { $subtract: [{ $ifNull: ['$endKm', 0] }, '$startKm'] } },
                },
            },
        ]);
        const kmBySelector = {};
        selectorKmAgg.forEach(r => { kmBySelector[r._id.toString()] = r.totalKM; });

        const selectorPlotAgg = await Inspection.aggregate([
            { $group: { _id: '$selectorId', totalVisitedPlots: { $sum: 1 } } },
        ]);

        const selectorIds = selectorPlotAgg.map(r => r._id);
        const selectorUsers = await User.find({ _id: { $in: selectorIds } }).select('_id firstName lastName').lean();
        const selectorUserMap = {};
        selectorUsers.forEach(u => { selectorUserMap[u._id.toString()] = `${u.firstName} ${u.lastName}`; });

        const fieldSelectorData = selectorPlotAgg.map(r => ({
            selectorName: selectorUserMap[r._id.toString()] || 'Unknown',
            totalKM: kmBySelector[r._id.toString()] || 0,
            totalVisitedPlots: r.totalVisitedPlots,
        }));

        // ── Field Owner Data ──────────────────────────────────────────────
        const ownerPlotAgg = await Enquiry.aggregate([
            { $group: { _id: '$fieldOwnerId', totalAssignedPlots: { $sum: 1 } } },
        ]);
        const ownerIds = ownerPlotAgg.map(r => r._id);
        const ownerUsers = await User.find({ _id: { $in: ownerIds } }).select('_id firstName lastName').lean();
        const ownerUserMap = {};
        ownerUsers.forEach(u => { ownerUserMap[u._id.toString()] = `${u.firstName} ${u.lastName}`; });

        const fieldOwnerData = ownerPlotAgg.map(r => ({
            ownerName: ownerUserMap[r._id.toString()] || 'Unknown',
            totalAssignedPlots: r.totalAssignedPlots,
        }));

        // ── Enquiry Progress (recent SELECTED / RATE_FIXED enquiries) ─────
        const progressEnquiries = await Enquiry.find({
            status: { $in: ['SELECTED', 'RATE_FIXED', 'ASSIGNED', 'IN_PROGRESS'] },
        })
            .sort({ updatedAt: -1 })
            .limit(50)
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('assignedSelectorId', 'firstName lastName')
            .populate('companyId', 'companyName')
            .lean();

        const enquiryProgress = progressEnquiries.map(e => ({
            enquiryId: e._id,
            farmerName: `${e.farmerFirstName} ${e.farmerLastName}`,
            location: e.location,
            rate: e.purchaseRate ? `₹${e.purchaseRate}/kg` : null,
            company: e.companyId ? e.companyId.companyName : null,
            fieldOwner: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : null,
            fieldSelector: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : null,
            farmerMobile: e.farmerMobile,
            plantCount: e.plantCount,
            status: e.status,
        }));

        res.json({
            stats: {
                todayVisited,
                selected: selectedCount,
                rejected: rejectedCount,
                futureSelection,
                missed: missedCount,
                fixRate: fixRateCount,
            },
            todayVisitedPlots,
            fieldSelectorData,
            fieldOwnerData,
            enquiryProgress,
        });
    } catch (error) {
        console.error('Field selection dashboard error:', error);
        res.status(500).json({ message: 'Server error while fetching field selection dashboard' });
    }
};

module.exports = {
    getAdminStats,
    getAlerts,
    getFieldSelectionOverview,
    getStaffPerformance,
    getMonitoringDashboard,
    getFieldSelectionDashboard,
};
