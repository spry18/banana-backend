const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const Trip = require('../execution/trip.model');
const DailyLog = require('../auditing/dailyLog.model');
const User = require('../users/user.model');
const Logistics = require('../logistics/logistics.model');
const SystemAudit = require('../auditing/systemAudit.model');
const DieselAdvance = require('../diesel-advance/dieselAdvance.model');
const PetrolAdvance = require('../petrol-advance/petrolAdvance.model');
const Packing = require('../execution/packing.model');

// @desc    Get comprehensive Admin dashboard KPIs
// @route   GET /api/admin/dashboard-stats
// @access  Private (Admin, Operational Manager)
const getAdminStats = async (req, res) => {
    try {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffset);
        const istStart = new Date(istTime);
        istStart.setUTCHours(0, 0, 0, 0);
        const startOfDay = new Date(istStart.getTime() - istOffset);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const todayFilter = { createdAt: { $gte: startOfDay, $lt: endOfDay } };

        const [
            totalEnquiries,
            pendingVisits,
            selectedPlots,
            rejectedPlots,
            ratFixedPlots,
            assignedPlots,
            completedPlots,
            pendingAdminApprovalPlots,
            tripsCompleted,
            missedFieldsCount,
            eodIssuesCount,
            rescheduledPlots,
            unassignedEnquiries,
        ] = await Promise.all([
            Enquiry.countDocuments(todayFilter),
            Enquiry.countDocuments({ status: 'PENDING' }),
            Enquiry.countDocuments({ status: 'SELECTED', ...todayFilter }),
            Enquiry.countDocuments({ status: 'REJECTED', ...todayFilter }),
            Enquiry.countDocuments({ status: 'ASSIGNED', purchaseRate: { $ne: null }, ...todayFilter }),
            Enquiry.countDocuments({ status: 'ASSIGNED', ...todayFilter }),
            Enquiry.countDocuments({ status: 'COMPLETED', ...todayFilter }),
            Enquiry.countDocuments({ status: 'PENDING_ADMIN_APPROVAL' }),
            // Trips: locked trips = completed (Trip model has no status field)
            Trip.countDocuments({ isLocked: true }),
            // Missed Fields: scheduledDate passed AND no inspection yet (alert for today's created plots)
            Enquiry.countDocuments({
                scheduledDate: { $lt: new Date() },
                status: 'PENDING',
                ...todayFilter,
            }),
            // EOD Issues: DailyLogs started but no endMeterPhotoUrl (past today's start)
            DailyLog.countDocuments({
                status: 'STARTED',
                endMeterPhotoUrl: { $exists: false },
                startTime: { $lt: new Date(Date.now() - 12 * 60 * 60 * 1000) }, // >12h ago
            }),
            Enquiry.countDocuments({ status: 'RESCHEDULED', ...todayFilter }),
            // Unassigned: total unassigned enquiries count (all-time / cumulative)
            Enquiry.countDocuments({ status: { $in: ['PENDING', 'RESCHEDULED'] }, assignedSelectorId: null }),
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
                pendingAdminApproval: pendingAdminApprovalPlots,
                missedPlots: missedFieldsCount,
                rescheduled: rescheduledPlots,
                unassigned: unassignedEnquiries,
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
            .populate('assignedSelectorId', 'firstName lastName mobileNo bikeNumber')
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
            .populate('assignedSelectorId', 'firstName lastName bikeNumber')
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
            search,
            dateFilter,
            startDate,
            endDate,
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
            User.find({ role: 'Field Selector', isActive: true }).select('_id firstName lastName bikeNumber').lean(),
        ]);

        const filters = {
            locations: locationDocs.filter(Boolean),
            fieldOwners: ownerDocs.map(u => ({ id: u._id, name: `${u.firstName} ${u.lastName}` })),
            selectors: selectorDocs.map(u => ({ id: u._id, name: `${u.firstName} ${u.lastName}`, bikeNumber: u.bikeNumber })),
        };

        // ── Table filter query ───────────────────────────────────────────
        const query = {};

        if (status) {
            if (status === 'MISSED') {
                query.scheduledDate = { $lt: now };
                query.status = 'PENDING';
            } else if (status === 'FUTURE_SELECTION') {
                query.scheduledDate = { $gt: now };
            } else if (status === 'UNASSIGNED') {
                query.status = { $in: ['PENDING', 'RESCHEDULED'] };
                query.assignedSelectorId = null;
            } else if (status === 'RATE_FIXED') {
                query.status = 'ASSIGNED';
                query.purchaseRate = { $ne: null };
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

        // Expanded Search query
        if (search) {
            const matchingUsers = await User.find({
                $or: [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');

            const Company = require('../master-data/company.model');
            const matchingCompanies = await Company.find({
                companyName: { $regex: search, $options: 'i' }
            }).select('_id');

            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { fieldOwnerId: { $in: matchingUsers.map(u => u._id) } },
                { assignedSelectorId: { $in: matchingUsers.map(u => u._id) } },
                { companyId: { $in: matchingCompanies.map(c => c._id) } }
            ];
        }

        // Common date filters
        if (dateFilter || date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            let dateRange = null;
            if (dateFilter === 'daily' || dateFilter === 'today' || date === 'today') {
                dateRange = getIstDayRange('today');
            } else if (dateFilter === 'yesterday' || date === 'yesterday') {
                dateRange = getIstDayRange('yesterday');
            } else if (dateFilter === 'weekly') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (dateFilter === 'monthly') {
                const start = new Date();
                start.setMonth(start.getMonth() - 1);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (dateFilter === 'custom' && startDate && endDate) {
                dateRange = { startOfDay: new Date(startDate), endOfDay: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000) };
            } else if (date) {
                dateRange = getIstDayRange(date);
            }

            if (dateRange) {
                query.scheduledDate = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }

        const total = await Enquiry.countDocuments(query);

        const rawTable = await Enquiry.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('assignedSelectorId', 'firstName lastName bikeNumber')
            .populate('companyId', 'companyName')
            .lean();

        const tableEnquiryIds = rawTable.map(e => e._id);
        const [associatedInspections, associatedLogistics] = await Promise.all([
            Inspection.find({ enquiryId: { $in: tableEnquiryIds } }).lean(),
            Logistics.find({ enquiryId: { $in: tableEnquiryIds } }).lean(),
        ]);

        const inspectionMap = associatedInspections.reduce((acc, ins) => {
            acc[ins.enquiryId.toString()] = ins;
            return acc;
        }, {});

        const logisticsMap = associatedLogistics.reduce((acc, log) => {
            acc[log.enquiryId.toString()] = log;
            return acc;
        }, {});

        const logisticsIds = associatedLogistics.map(l => l._id);
        const associatedPackings = await Packing.find({ assignmentId: { $in: logisticsIds } }).lean();
        const packingMap = associatedPackings.reduce((acc, pack) => {
            acc[pack.assignmentId.toString()] = pack;
            return acc;
        }, {});

        // Map to exact frontend contract shape
        const tableData = rawTable.map(e => {
            // Determine effective status for MISSED tab
            let effectiveStatus = e.status;
            if (e.status === 'PENDING' && e.scheduledDate && new Date(e.scheduledDate) < now) {
                effectiveStatus = 'MISSED';
            } else if ((e.status === 'PENDING' || e.status === 'RESCHEDULED') && !e.assignedSelectorId) {
                effectiveStatus = 'UNASSIGNED';
            }

            // Dynamic button logic
            let actionButton = 'View Details';
            if (effectiveStatus === 'PENDING') {
                actionButton = e.assignedSelectorId ? 'View Details' : 'Assign Selector';
            } else if (effectiveStatus === 'UNASSIGNED') {
                actionButton = 'Assign Selector';
            } else if (effectiveStatus === 'SELECTED') {
                actionButton = 'Fix Rate';
            } else if (effectiveStatus === 'MISSED') {
                actionButton = 'Reassign';
            } else if (effectiveStatus === 'RESCHEDULED') {
                actionButton = 'Reschedule';
            } else if (effectiveStatus === 'RATE_FIXED') {
                actionButton = 'Assign Team';
            }

            const inspection = inspectionMap[e._id.toString()];
            const logistics = logisticsMap[e._id.toString()];
            const packing = logistics ? packingMap[logistics._id.toString()] : null;

            return {
                id: e._id,
                enquiryId: e.enquiryId,
                farmerFirstName: e.farmerFirstName,
                farmerLastName: e.farmerLastName,
                farmerMobile: e.farmerMobile,
                farmerName: `${e.farmerFirstName} ${e.farmerLastName}`,
                location: e.location,
                fieldOwner: e.fieldOwnerId
                    ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}`
                    : null,
                fieldSelector: e.assignedSelectorId
                    ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}`
                    : null,
                fieldSelectorBike: e.assignedSelectorId
                    ? (e.assignedSelectorId.bikeNumber || null)
                    : null,
                visitDate: inspection 
                    ? new Date(inspection.createdAt).toLocaleDateString('en-IN') 
                    : (e.scheduledDate ? new Date(e.scheduledDate).toLocaleDateString('en-IN') : null),
                harvestTime: inspection ? inspection.harvestingTime : (e.scheduledTime || null),
                status: effectiveStatus,
                action: actionButton,

                // Additional response fields
                boxCount: packing ? (packing.totalBoxes || 0) : (e.estimatedBoxes || null),
                partnerName: e.companyId ? e.companyId.companyName : null,
                packagingType: e.packingType || null,
                assignmentStatus: logistics ? logistics.assignmentStatus : 'UNASSIGNED',
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
        const { selectorDate, ownerDate, visitedDate, visitedFilter } = req.query;

        const now = new Date();
        let todayStart, todayEnd;

        if (visitedFilter) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            if (visitedFilter === 'daily') {
                const range = getIstDayRange('today');
                todayStart = range.startOfDay;
                todayEnd = range.endOfDay;
            } else if (visitedFilter === 'weekly') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                todayStart = start;
                todayEnd = now;
            } else if (visitedFilter === 'monthly') {
                const start = new Date();
                start.setMonth(start.getMonth() - 1);
                todayStart = start;
                todayEnd = now;
            } else if (visitedFilter === 'all') {
                todayStart = new Date(0);
                todayEnd = now;
            } else {
                const range = getIstDayRange('today');
                todayStart = range.startOfDay;
                todayEnd = range.endOfDay;
            }
        } else if (visitedDate) {
            const vDate = new Date(visitedDate);
            todayStart = new Date(vDate.getFullYear(), vDate.getMonth(), vDate.getDate());
            todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);
        } else {
            todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);
        }
        
        let selectorDateStart, selectorDateEnd;
        if (selectorDate) {
            const sDate = new Date(selectorDate);
            selectorDateStart = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
            selectorDateEnd = new Date(selectorDateStart);
            selectorDateEnd.setDate(selectorDateEnd.getDate() + 1);
        }

        let ownerDateStart, ownerDateEnd;
        if (ownerDate) {
            const oDate = new Date(ownerDate);
            ownerDateStart = new Date(oDate.getFullYear(), oDate.getMonth(), oDate.getDate());
            ownerDateEnd = new Date(ownerDateStart);
            ownerDateEnd.setDate(ownerDateEnd.getDate() + 1);
        }

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
            Enquiry.countDocuments({ status: 'ASSIGNED', purchaseRate: { $ne: null } }),
        ]);

        const kmMatch = { status: 'COMPLETED' };
        if (selectorDate) {
            kmMatch.date = { $gte: selectorDateStart, $lt: selectorDateEnd };
        }
        const selectorKmAgg = await DailyLog.aggregate([
            { $match: kmMatch },
            {
                $group: {
                    _id: '$userId',
                    totalKM: { $sum: { $subtract: [{ $ifNull: ['$endKm', 0] }, '$startKm'] } },
                },
            },
        ]);
        const kmBySelector = {};
        selectorKmAgg.forEach(r => { kmBySelector[r._id.toString()] = r.totalKM; });

        const selectorPlotMatch = {};
        if (selectorDate) {
            selectorPlotMatch.createdAt = { $gte: selectorDateStart, $lt: selectorDateEnd };
        }
        const selectorPlotAgg = await Inspection.aggregate([
            { $match: selectorPlotMatch },
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
        const ownerPlotMatch = {};
        if (ownerDate) {
            ownerPlotMatch.createdAt = { $gte: ownerDateStart, $lt: ownerDateEnd };
        }
        const ownerPlotAgg = await Enquiry.aggregate([
            { $match: ownerPlotMatch },
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

        const visitedPlotsRaw = await Inspection.find({ createdAt: { $gte: todayStart, $lt: todayEnd } })
            .populate({
                path: 'enquiryId',
                select: 'enquiryId farmerFirstName farmerLastName location status fieldOwnerId',
                populate: { path: 'fieldOwnerId', select: 'firstName lastName' }
            })
            .populate('selectorId', 'firstName lastName')
            .lean();

        const todayVisitedPlots = visitedPlotsRaw.map(ins => ({
            _id: ins._id,
            farmerName: ins.enquiryId ? `${ins.enquiryId.farmerFirstName} ${ins.enquiryId.farmerLastName}` : 'Unknown',
            location: ins.enquiryId?.location || 'Unknown',
            fieldOwner: ins.enquiryId?.fieldOwnerId ? `${ins.enquiryId.fieldOwnerId.firstName} ${ins.enquiryId.fieldOwnerId.lastName}` : 'N/A',
            fieldSelector: ins.selectorId ? `${ins.selectorId.firstName} ${ins.selectorId.lastName}` : 'N/A',
            status: ins.decision || ins.enquiryId?.status || 'COMPLETED',
            enquiryId: ins.enquiryId?._id
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
            fieldSelectorData,
            fieldOwnerData,
            todayVisitedPlots,
        });
    } catch (error) {
        console.error('Field selection dashboard error:', error);
        res.status(500).json({ message: 'Server error while fetching field selection dashboard' });
    }
};

// @desc    Get all users activity history (System Audits)
// @route   GET /api/admin/history/all-users
// @access  Private (Admin, Operational Manager)
const getAllUsersHistory = async (req, res) => {
    try {
        const { search, moduleName, action, date, dateFilter, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = {};

        if (moduleName) {
            query.moduleName = moduleName;
        }
        if (action) {
            query.action = action.toUpperCase();
        }
        if (dateFilter || date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            let dateRange = null;
            if (dateFilter === 'daily' || dateFilter === 'today' || date === 'today') {
                dateRange = getIstDayRange('today');
            } else if (dateFilter === 'weekly') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (dateFilter === 'monthly') {
                const start = new Date();
                start.setMonth(start.getMonth() - 1);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (date) {
                dateRange = getIstDayRange(date);
            }
            if (dateRange) {
                query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }
        if (search) {
            query.details = { $regex: search, $options: 'i' };
        }

        const [logs, total] = await Promise.all([
            SystemAudit.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('userId', 'firstName lastName role mobileNo')
                .lean(),
            SystemAudit.countDocuments(query),
        ]);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: logs,
        });
    } catch (error) {
        console.error('All users history error:', error);
        res.status(500).json({ message: 'Server error while fetching all users history' });
    }
};

// @desc    Get unified fuel history (Diesel & Petrol advances)
// @route   GET /api/admin/history/fuel
// @access  Private (Admin, Operational Manager)
const getFuelHistory = async (req, res) => {
    try {
        const { search, date, dateFilter, page = 1, limit = 20 } = req.query;

        const dieselQuery = {};
        const petrolQuery = {};

        if (dateFilter || date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            let dateRange = null;
            if (dateFilter === 'daily' || dateFilter === 'today' || date === 'today') {
                dateRange = getIstDayRange('today');
            } else if (dateFilter === 'weekly') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (dateFilter === 'monthly') {
                const start = new Date();
                start.setMonth(start.getMonth() - 1);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (date) {
                dateRange = getIstDayRange(date);
            }
            if (dateRange) {
                dieselQuery.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
                petrolQuery.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }

        const [dieselRecords, petrolRecords] = await Promise.all([
            DieselAdvance.find(dieselQuery)
                .populate('driverId', 'firstName lastName role mobileNo')
                .populate('omId', 'firstName lastName role')
                .lean(),
            PetrolAdvance.find(petrolQuery)
                .populate('fieldSelectorId', 'firstName lastName role mobileNo')
                .populate('omId', 'firstName lastName role')
                .lean(),
        ]);

        const dieselMapped = dieselRecords.map(r => ({
            id: r._id,
            type: 'Diesel',
            recipientName: r.driverId ? `${r.driverId.firstName} ${r.driverId.lastName}` : 'Unknown',
            recipientRole: r.driverId?.role || 'Driver',
            recipientMobile: r.driverId?.mobileNo || '',
            omName: r.omId ? `${r.omId.firstName} ${r.omId.lastName}` : 'System',
            amount: r.amount,
            vehicleNumber: r.vehicleNumber,
            remark: r.remark,
            receiptPhotoUrl: r.receiptPhotoUrl,
            createdAt: r.createdAt,
        }));

        const petrolMapped = petrolRecords.map(r => ({
            id: r._id,
            type: 'Petrol',
            recipientName: r.fieldSelectorId ? `${r.fieldSelectorId.firstName} ${r.fieldSelectorId.lastName}` : 'Unknown',
            recipientRole: r.fieldSelectorId?.role || 'Field Selector',
            recipientMobile: r.fieldSelectorId?.mobileNo || '',
            omName: r.omId ? `${r.omId.firstName} ${r.omId.lastName}` : 'System',
            amount: r.amount,
            vehicleNumber: r.vehicleNumber || 'N/A',
            remark: r.remark,
            receiptPhotoUrl: r.receiptPhotoUrl || null,
            createdAt: r.createdAt,
        }));

        let combined = [...dieselMapped, ...petrolMapped];

        if (search) {
            const regex = new RegExp(search, 'i');
            combined = combined.filter(c => 
                regex.test(c.recipientName) ||
                regex.test(c.vehicleNumber) ||
                regex.test(c.remark)
            );
        }

        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = combined.length;
        const skip = (Number(page) - 1) * Number(limit);
        const paginated = combined.slice(skip, skip + Number(limit));

        const totalAmount = combined.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const totalTransactions = combined.length;
        const avgAmount = totalTransactions > 0 ? Math.round(totalAmount / totalTransactions) : 0;

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: paginated,
            kpis: {
                totalAmount,
                totalTransactions,
                avgAmount
            }
        });
    } catch (error) {
        console.error('Fuel history error:', error);
        res.status(500).json({ message: 'Server error while fetching fuel history' });
    }
};

// @desc    Get Munshi packing reports history
// @route   GET /api/admin/history/munshi
// @access  Private (Admin, Operational Manager)
const getMunshiHistory = async (req, res) => {
    try {
        const { search, date, dateFilter, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = {};

        if (dateFilter || date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            let dateRange = null;
            if (dateFilter === 'daily' || dateFilter === 'today' || date === 'today') {
                dateRange = getIstDayRange('today');
            } else if (dateFilter === 'weekly') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (dateFilter === 'monthly') {
                const start = new Date();
                start.setMonth(start.getMonth() - 1);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (date) {
                dateRange = getIstDayRange(date);
            }
            if (dateRange) {
                query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }

        if (search) {
            const matchingMunshis = await User.find({
                $or: [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } },
                ]
            }).select('_id');
            query.munshiId = { $in: matchingMunshis.map(m => m._id) };
        }

        const [reports, total] = await Promise.all([
            Packing.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('munshiId', 'firstName lastName role mobileNo')
                .populate('brandId', 'brandName')
                .populate({
                    path: 'assignmentId',
                    select: 'enquiryId totalBoxes vehicleId driverId',
                    populate: [
                        { 
                            path: 'enquiryId', 
                            select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation plantCount estimatedBoxes companyId',
                            populate: { path: 'companyId', select: 'companyName' }
                        },
                        { path: 'driverId', select: 'firstName lastName mobileNo' }
                    ]
                })
                .lean(),
            Packing.countDocuments(query),
        ]);

        const allReportsForKpis = await Packing.find(query).select('status').lean();
        const totalReports = total;
        const completedReports = allReportsForKpis.filter(r => r.status === 'SUBMITTED' || r.status === 'APPROVED').length;
        const cancelledReports = allReportsForKpis.filter(r => r.status === 'CANCELLED' || r.status === 'REJECTED').length;

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: reports,
            kpis: {
                totalReports,
                completedReports,
                cancelledReports
            }
        });
    } catch (error) {
        console.error('Munshi history error:', error);
        res.status(500).json({ message: 'Server error while fetching Munshi history' });
    }
};

// Helper for logistics vehicle type history
const getLogisticsHistoryByVehicleType = async (req, res, driverRole) => {
    try {
        const { search, date, dateFilter, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const matchingDrivers = await User.find({ role: driverRole }).select('_id');

        const query = {
            driverId: { $in: matchingDrivers.map(d => d._id) }
        };

        if (dateFilter || date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            let dateRange = null;
            if (dateFilter === 'daily' || dateFilter === 'today' || date === 'today') {
                dateRange = getIstDayRange('today');
            } else if (dateFilter === 'weekly') {
                const start = new Date();
                start.setDate(start.getDate() - 7);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (dateFilter === 'monthly') {
                const start = new Date();
                start.setMonth(start.getMonth() - 1);
                dateRange = { startOfDay: start, endOfDay: new Date() };
            } else if (date) {
                dateRange = getIstDayRange(date);
            }
            if (dateRange) {
                query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }

        if (search) {
            const matchingEnquiries = await Enquiry.find({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');
            query.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
        }

        const [assignments, total] = await Promise.all([
            Logistics.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location')
                .populate('munshiId', 'firstName lastName mobileNo')
                .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('vehicleId', 'vehicleNumber')
                .lean(),
            Logistics.countDocuments(query),
        ]);

        const allAssignmentsForKpis = await Logistics.find(query).select('assignmentStatus').lean();
        const totalTrips = total;
        const completedTrips = allAssignmentsForKpis.filter(a => ['COMPLETED', 'CLOSED', 'APPROVED'].includes(a.assignmentStatus)).length;
        const ongoingTrips = totalTrips - completedTrips;

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: assignments,
            kpis: {
                totalTrips,
                completedTrips,
                ongoingTrips
            }
        });
    } catch (error) {
        console.error(`${driverRole} logistics history error:`, error);
        res.status(500).json({ message: `Server error while fetching ${driverRole} logistics history` });
    }
};

const getEicherHistory = async (req, res) => {
    try {
        const { search, date, dateFilter, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const matchingDrivers = await User.find({ role: 'driver eicher' }).select('_id');
        const query = { driverId: { $in: matchingDrivers.map(d => d._id) } };

        const { getIstDayRange } = require('../../utils/dateHelper');
        let dateRange = null;

        // Default to monthly if no date filter is provided
        const activeFilter = dateFilter || 'monthly';

        if (activeFilter === 'daily' || activeFilter === 'today' || date === 'today') {
            dateRange = getIstDayRange('today');
        } else if (activeFilter === 'weekly') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            dateRange = { startOfDay: start, endOfDay: new Date() };
        } else if (activeFilter === 'monthly') {
            const start = new Date();
            start.setMonth(start.getMonth() - 1);
            dateRange = { startOfDay: start, endOfDay: new Date() };
        } else if (activeFilter !== 'all' && date) {
            dateRange = getIstDayRange(date);
        }

        if (dateRange && activeFilter !== 'all') {
            query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
        }

        if (search) {
            const matchingEnquiries = await Enquiry.find({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');
            query.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
        }

        const [assignments, total] = await Promise.all([
            Logistics.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location subLocation')
                .populate('munshiId', 'firstName lastName mobileNo')
                .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('vehicleId', 'vehicleNumber')
                .lean(),
            Logistics.countDocuments(query),
        ]);

        const assignmentIds = assignments.map(a => a._id);
        const tripsForPage = await Trip.find({ assignmentId: { $in: assignmentIds }, driverType: 'Eicher' }).lean();
        const advancesForPage = await DieselAdvance.find({ assignmentId: { $in: assignmentIds } }).lean();

        const enrichedAssignments = assignments.map(assignment => {
            const trip = tripsForPage.find(t => t.assignmentId.toString() === assignment._id.toString());
            const advance = advancesForPage.find(a => a.assignmentId.toString() === assignment._id.toString());
            return {
                ...assignment,
                tripDetails: trip || null,
                dieselAdvance: advance || null,
            };
        });

        // Compute KPIs over ALL matched logistics items in the period
        const allAssignmentsForKpis = await Logistics.find(query).select('_id').lean();
        const allAssignmentIds = allAssignmentsForKpis.map(a => a._id);
        const allTrips = await Trip.find({ assignmentId: { $in: allAssignmentIds }, driverType: 'Eicher' }).lean();
        const allAdvances = await DieselAdvance.find({ assignmentId: { $in: allAssignmentIds } }).lean();

        let totalTripsCount = allTrips.length;
        let totalKm = 0;
        let totalToll = 0;
        let totalHaults = 0;
        let totalLineCancels = 0;
        let totalFuelAdvance = 0;

        allTrips.forEach(t => {
            totalKm += (t.totalKm || 0);
            totalToll += (t.tollExpense || 0);
            if (t.isHault) totalHaults += 1;
            if (t.isLineCancel) totalLineCancels += 1;
        });

        allAdvances.forEach(a => {
            totalFuelAdvance += (a.amount || 0);
        });

        const dieselPrice = 92.50; // Use static fallback or fetch dynamically if needed
        let totalEarnings = (totalTripsCount * 2500) + (totalHaults * 1500) + (totalLineCancels * 1500) + ((totalKm / 5) * dieselPrice) + totalToll;
        const monthlyPayout = parseFloat((totalEarnings - totalFuelAdvance).toFixed(2));

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: enrichedAssignments,
            kpis: {
                monthlyPayout,
                totalKm,
                totalTrips: totalTripsCount,
                totalFuel: totalFuelAdvance,
                totalToll,
                totalLineCancels,
                haults: totalHaults
            }
        });
    } catch (error) {
        console.error('Eicher logistics history error:', error);
        res.status(500).json({ message: 'Server error while fetching Eicher logistics history' });
    }
};

const getPickupHistory = async (req, res) => {
    try {
        const { search, date, dateFilter, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const matchingDrivers = await User.find({ role: 'driver pickup' }).select('_id');
        const query = { driverId: { $in: matchingDrivers.map(d => d._id) } };

        const { getIstDayRange } = require('../../utils/dateHelper');
        let dateRange = null;

        // Default to monthly if no date filter is provided
        const activeFilter = dateFilter || 'monthly';

        if (activeFilter === 'daily' || activeFilter === 'today' || date === 'today') {
            dateRange = getIstDayRange('today');
        } else if (activeFilter === 'weekly') {
            const start = new Date();
            start.setDate(start.getDate() - 7);
            dateRange = { startOfDay: start, endOfDay: new Date() };
        } else if (activeFilter === 'monthly') {
            const start = new Date();
            start.setMonth(start.getMonth() - 1);
            dateRange = { startOfDay: start, endOfDay: new Date() };
        } else if (activeFilter !== 'all' && date) {
            dateRange = getIstDayRange(date);
        }

        if (dateRange && activeFilter !== 'all') {
            query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
        }

        if (search) {
            const matchingEnquiries = await Enquiry.find({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');
            query.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
        }

        const [assignments, total] = await Promise.all([
            Logistics.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location subLocation')
                .populate('munshiId', 'firstName lastName mobileNo')
                .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('vehicleId', 'vehicleNumber')
                .lean(),
            Logistics.countDocuments(query),
        ]);

        const assignmentIds = assignments.map(a => a._id);
        const tripsForPage = await Trip.find({ assignmentId: { $in: assignmentIds }, driverType: 'Pickup' }).lean();
        const advancesForPage = await DieselAdvance.find({ assignmentId: { $in: assignmentIds } }).lean();

        const enrichedAssignments = assignments.map(assignment => {
            const trip = tripsForPage.find(t => t.assignmentId.toString() === assignment._id.toString());
            const advance = advancesForPage.find(a => a.assignmentId.toString() === assignment._id.toString());
            return {
                ...assignment,
                tripDetails: trip || null,
                dieselAdvance: advance || null,
            };
        });

        // Compute KPIs over ALL matched logistics items in the period
        const allAssignmentsForKpis = await Logistics.find(query).select('_id').lean();
        const allAssignmentIds = allAssignmentsForKpis.map(a => a._id);
        const allTrips = await Trip.find({ assignmentId: { $in: allAssignmentIds }, driverType: 'Pickup' }).lean();
        const allAdvances = await DieselAdvance.find({ assignmentId: { $in: allAssignmentIds } }).lean();

        let totalTripsCount = allTrips.length;
        let totalKm = 0;
        let totalToll = 0;
        let totalFuelAdvance = 0;

        allTrips.forEach(t => {
            totalKm += (t.totalKm || 0);
            totalToll += (t.tollExpense || 0);
        });

        allAdvances.forEach(a => {
            totalFuelAdvance += (a.amount || 0);
        });

        const dieselPrice = 92.50; // Static fallback
        let totalEarnings = (totalTripsCount * 1200) + ((totalKm / 10) * dieselPrice) + totalToll;
        const monthlyPayout = parseFloat((totalEarnings - totalFuelAdvance).toFixed(2));

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: enrichedAssignments,
            kpis: {
                monthlyPayout,
                totalKm,
                totalTrips: totalTripsCount,
                totalFuel: totalFuelAdvance,
                totalToll
            }
        });
    } catch (error) {
        console.error('Pickup logistics history error:', error);
        res.status(500).json({ message: 'Server error while fetching Pickup logistics history' });
    }
};

// @desc    Master Search across Enquiries, Users, and Logistics
// @route   GET /api/admin/master-search
// @access  Private (Admin, Operational Manager)
const masterSearch = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.status(400).json({ message: 'Search query q is required.' });
        }

        const regex = new RegExp(q.trim(), 'i');

        const [enquiries, users, logistics] = await Promise.all([
            Enquiry.find({
                $or: [
                    { farmerFirstName: regex },
                    { farmerLastName: regex },
                    { farmerMobile: regex },
                    { location: regex },
                    { enquiryId: regex }
                ]
            }).limit(20).lean(),

            User.find({
                $or: [
                    { firstName: regex },
                    { lastName: regex },
                    { mobileNo: regex },
                    { role: regex }
                ]
            }).limit(20).select('firstName lastName mobileNo role bikeNumber').lean(),

            Logistics.find({
                $or: [
                    { teamName: regex },
                    { vehicleNumber: regex }
                ]
            }).limit(20)
              .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location')
              .lean()
        ]);

        res.json({
            enquiries,
            users,
            logistics
        });
    } catch (error) {
        console.error('Master search error:', error);
        res.status(500).json({ message: 'Server error during master search' });
    }
};

module.exports = {
    getAdminStats,
    getAlerts,
    getFieldSelectionOverview,
    getStaffPerformance,
    getMonitoringDashboard,
    getFieldSelectionDashboard,
    getAllUsersHistory,
    getFuelHistory,
    getMunshiHistory,
    getEicherHistory,
    getPickupHistory,
    masterSearch,
};
