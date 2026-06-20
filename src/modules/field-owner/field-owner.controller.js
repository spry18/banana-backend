const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const DailyLog = require('../auditing/dailyLog.model');
const User = require('../users/user.model');
const Logistics = require('../logistics/logistics.model');
const { getFullUrl } = require('../../utils/urlHelper');

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

        // IST timezone range calculation
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istTime = new Date(now.getTime() + istOffset);
        const istStart = new Date(istTime);
        istStart.setUTCHours(0, 0, 0, 0);
        const startOfDay = new Date(istStart.getTime() - istOffset);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

        const todayFilter = { ...base, createdAt: { $gte: startOfDay, $lt: endOfDay } };

        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [
            total,
            selected,
            rejected,
            ratFixed,
            missed,
            futureSelection,
            rescheduled,
            daily,
            weekly,
            monthly,
            unassigned,
            dailySelected,
            weeklySelected,
            monthlySelected,
            dailyRejected,
            weeklyRejected,
            monthlyRejected,
            recentEnquiries,
        ] = await Promise.all([
            Enquiry.countDocuments(todayFilter),
            Enquiry.countDocuments({ ...todayFilter, status: 'SELECTED' }),
            Enquiry.countDocuments({ ...todayFilter, status: 'REJECTED' }),
            Enquiry.countDocuments({
                ...todayFilter,
                status: { $in: ['RATE_FIXED', 'ASSIGNED', 'COMPLETED'] },
                purchaseRate: { $ne: null, $exists: true }
            }),
            // Missed: PENDING and either past scheduledDate OR completely missing a scheduledDate (for today's created plots)
            Enquiry.countDocuments({
                ...todayFilter,
                status: 'PENDING',
                $or: [
                    { scheduledDate: { $lt: now } },
                    { scheduledDate: null },
                    { scheduledDate: { $exists: false } },
                ],
            }),
            // Future Selection: scheduledDate in the future, still PENDING (for today's created plots)
            Enquiry.countDocuments({ ...todayFilter, status: 'PENDING', scheduledDate: { $gt: now } }),
            Enquiry.countDocuments({ ...todayFilter, status: 'RESCHEDULED' }),
            Enquiry.countDocuments({ ...base, createdAt: { $gte: startOfDay } }),
            Enquiry.countDocuments({ ...base, createdAt: { $gte: startOfWeek } }),
            Enquiry.countDocuments({ ...base, createdAt: { $gte: startOfMonth } }),
            // Unassigned: total unassigned enquiries count (all-time / cumulative)
            Enquiry.countDocuments({ status: 'PENDING', assignedSelectorId: null }),
            // Selected breakdown
            Enquiry.countDocuments({ ...base, status: 'SELECTED', createdAt: { $gte: startOfDay } }),
            Enquiry.countDocuments({ ...base, status: 'SELECTED', createdAt: { $gte: startOfWeek } }),
            Enquiry.countDocuments({ ...base, status: 'SELECTED', createdAt: { $gte: startOfMonth } }),
            // Rejected breakdown
            Enquiry.countDocuments({ ...base, status: 'REJECTED', createdAt: { $gte: startOfDay } }),
            Enquiry.countDocuments({ ...base, status: 'REJECTED', createdAt: { $gte: startOfWeek } }),
            Enquiry.countDocuments({ ...base, status: 'REJECTED', createdAt: { $gte: startOfMonth } }),
            // Recent Activity: all strictly SELECTED, RESCHEDULED, or selector-ASSIGNED enquiries for this FO (To-Do list) - lifetime
            Enquiry.find({
                ...base,
                $or: [
                    { status: { $in: ['SELECTED', 'RESCHEDULED'] } },
                    { status: 'ASSIGNED', purchaseRate: null }
                ]
            })
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
                // Show edit window state only for ASSIGNED enquiries
                if (enq.status === 'ASSIGNED') {
                    activity.editableUntil = enq.editableUntil || null;
                    activity.isEditable = enq.editableUntil ? new Date() < new Date(enq.editableUntil) : true;
                } else {
                    activity.editableUntil = null;
                    activity.isEditable = false;
                }
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
                daily,
                weekly,
                monthly,
                unassigned,
                dailySelected,
                weeklySelected,
                monthlySelected,
                dailyRejected,
                weeklyRejected,
                monthlyRejected,
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
        const { status, location, search, page = 1, limit = 20, date } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const now = new Date();

        const base = {}; // Global Shared Pool: all enquiries regardless of role
        let query = { ...base };

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            const statusStr = status ? status.toUpperCase() : '';
            const isPendingQuery = statusStr.includes('PENDING') || statusStr.includes('RESCHEDULED') || statusStr.includes('MISSED') || statusStr.includes('UNASSIGNED');
            
            if (isPendingQuery) {
                query.scheduledDate = { $gte: startOfDay, $lt: endOfDay };
            } else if (statusStr && statusStr !== 'ALL') {
                query.updatedAt = { $gte: startOfDay, $lt: endOfDay };
            } else {
                query.createdAt = { $gte: startOfDay, $lt: endOfDay };
            }
        }

        const andFilters = [];

        // Status filter — 'Missed' is a derived state, not a real enum value
        if (status) {
            const statusUpper = status.toUpperCase();
            if (statusUpper === 'MISSED') {
                query.status = 'PENDING';
                query.scheduledDate = { $lt: now };
            } else if (statusUpper === 'RESCHEDULED') {
                // Rescheduled = PENDING with a scheduledDate in the future (was previously changed)
                query.status = 'PENDING';
                query.scheduledDate = { $gt: now };
            } else if (statusUpper === 'UNASSIGNED') {
                query.status = 'PENDING';
                query.assignedSelectorId = null;
            } else {
                const statuses = status.split(',').map(s => s.trim().toUpperCase());
                
                // If it includes RATE_FIXED, we want to include database status:
                // - RATE_FIXED
                // - COMPLETED
                // - CLOSED
                // - ASSIGNED (where purchaseRate is not null)
                const mappedStatuses = [...statuses];
                const hasRateFixed = statuses.includes('RATE_FIXED');
                const hasAssigned = statuses.includes('ASSIGNED');

                if (hasRateFixed) {
                    ['COMPLETED', 'CLOSED'].forEach(st => {
                        if (!mappedStatuses.includes(st)) {
                            mappedStatuses.push(st);
                        }
                    });
                }

                const statusConditions = [];
                
                // 1. Any status in mappedStatuses EXCEPT ASSIGNED
                const nonAssignedStatuses = mappedStatuses.filter(s => s !== 'ASSIGNED');
                if (nonAssignedStatuses.length > 0) {
                    statusConditions.push({ status: { $in: nonAssignedStatuses } });
                }

                // 2. Handling ASSIGNED
                if (hasAssigned && hasRateFixed) {
                    // Both tabs requested, so match any ASSIGNED
                    statusConditions.push({ status: 'ASSIGNED' });
                } else if (hasRateFixed) {
                    // Only Rate Fixed requested, match ASSIGNED only if purchaseRate is not null
                    statusConditions.push({ status: 'ASSIGNED', purchaseRate: { $ne: null } });
                } else if (hasAssigned) {
                    // Only Assigned requested, match ASSIGNED only if purchaseRate is null
                    statusConditions.push({ status: 'ASSIGNED', purchaseRate: null });
                }

                if (statusConditions.length > 0) {
                    andFilters.push({ $or: statusConditions });
                }
            }
        }

        if (location) query.location = location;

        if (search) {
            andFilters.push({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { farmerMobile: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                ]
            });
        }

        if (andFilters.length > 0) {
            query.$and = andFilters;
        }

        const [enquiries, total] = await Promise.all([
            Enquiry.find(query)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('assignedSelectorId', 'firstName lastName mobileNo bikeNumber')
                .populate('companyId', 'companyName')
                .populate('generation', 'name')
                .lean(),
            Enquiry.countDocuments(query),
        ]);

        // ── Bulk fetch linked inspections (single query, avoids N+1) ──────────────────────
        const enquiryIds = enquiries.map((e) => e._id);
        const inspections = await Inspection.find({ enquiryId: { $in: enquiryIds } })
            .select('enquiryId minVolume maxVolume recoveryPercent packingSize generalNotes volumeBoxRange')
            .lean();
        const inspectionMap = {};
        inspections.forEach((insp) => {
            inspectionMap[insp.enquiryId.toString()] = insp;
        });

        // Shape response with all required plot card fields
        const data = enquiries.map((enq) => {
            const insp = inspectionMap[enq._id.toString()] || null;

            // Map status for frontend: if it is ASSIGNED in DB but has purchaseRate,
            // return status as RATE_FIXED so FO app opens the correct Rate Fixed screen.
            let displayStatus = enq.status;
            if (enq.status === 'ASSIGNED' && enq.purchaseRate != null) {
                displayStatus = 'RATE_FIXED';
            }

            return {
                ...enq,
                status: displayStatus,
                // Extra fields required by the updated plot card
                fixRate:      enq.purchaseRate    ?? null,
                companyName:  enq.companyId       ? enq.companyId.companyName : null,
                packing:      enq.packingType     ?? null,
                minVolume:    insp               ? (insp.minVolume ?? null)    : null,
                maxVolume:    insp               ? (insp.maxVolume ?? null)    : null,
                recovery:     insp               ? (insp.recoveryPercent ?? null) : null,
                rejectReason: (enq.status === 'REJECTED' && insp) ? (insp.generalNotes ?? null) : null,
                location:     enq.location,
                mobileNumber: enq.farmerMobile,
                inspection:   insp                || null,
            };
        });

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
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
    // Filter out null values (enquiries with no selector assigned) to prevent CastError
    const rawIds = await Enquiry.find({}).distinct('assignedSelectorId');
    const selectorIds = rawIds.filter((id) => id != null);
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
            startMeterPhotoUrl: log.startMeterPhotoUrl ? getFullUrl(req, log.startMeterPhotoUrl) : null,
            endMeterPhotoUrl: log.endMeterPhotoUrl ? getFullUrl(req, log.endMeterPhotoUrl) : null,
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
            .select('firstName lastName mobileNo role bikeNumber')
            .sort({ firstName: 1, lastName: 1 });

        res.json({ data: selectors });
    } catch (error) {
        console.error('Error fetching selectors:', error);
        res.status(500).json({ message: 'Server error fetching selectors', error: error.message });
    }
};

// @desc    Get all plots where no Field Selector has been assigned (Unassigned Tab)
// @route   GET /api/field-owner/plots/unassigned
// @access  Private (Field Owner, Admin)
const getUnassignedPlots = async (req, res) => {
    try {
        const { search, page = 1, limit = 20, date } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const andFilters = [
            { assignedSelectorId: null },
            { status: 'PENDING' }
        ];

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            andFilters.push({
                $or: [
                    { scheduledDate: { $gte: startOfDay, $lt: endOfDay } },
                    {
                        $and: [
                            { $or: [{ scheduledDate: null }, { scheduledDate: { $exists: false } }] },
                            { createdAt: { $gte: startOfDay, $lt: endOfDay } }
                        ]
                    }
                ]
            });
        }

        if (search) {
            andFilters.push({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName:  { $regex: search, $options: 'i' } },
                    { farmerMobile:    { $regex: search, $options: 'i' } },
                    { enquiryId:       { $regex: search, $options: 'i' } },
                ]
            });
        }

        const query = { $and: andFilters };

        const [enquiries, total] = await Promise.all([
            Enquiry.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('fieldOwnerId', 'firstName lastName mobileNo')
                .populate('generation', 'name')
                .lean(),
            Enquiry.countDocuments(query),
        ]);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: enquiries,
        });
    } catch (error) {
        console.error('FO Unassigned Plots error:', error);
        res.status(500).json({ message: 'Server error fetching unassigned plots', error: error.message });
    }
};

// @desc    Get OMs metrics (unassigned, assigned, completed counts) for Field Owners
// @route   GET /api/field-owner/oms-metrics
// @access  Private (Field Owner, Admin)
const getOmMetricsForFO = async (req, res) => {
    try {
        // Fetch all OMs
        const oms = await User.find({ role: 'Operational Manager', isActive: true }).select('firstName lastName mobileNo').lean();

        // Calculate counts for each OM
        const data = await Promise.all(oms.map(async (om) => {
            // Find enquiry IDs that already have a logistics assignment FROM THIS OM
            // (scoped to om._id so we don't exclude enquiries assigned to other OMs)
            const assignedEnquiryIds = await Logistics.distinct('enquiryId', { omId: om._id });

            const [unassignedCount, assignedCount, completedCount] = await Promise.all([
                // Unassigned: Enquiries that are rate fixed by this OM but have no logistics assignment
                Enquiry.countDocuments({
                    status: 'RATE_FIXED',
                    rateFixedBy: om._id,
                    _id: { $nin: assignedEnquiryIds },
                }),
                // Assigned: Logistics records managed by this OM that are PENDING
                Logistics.countDocuments({
                    omId: om._id,
                    assignmentStatus: 'PENDING',
                }),
                // Completed: Logistics records managed by this OM that are COMPLETED or APPROVED
                Logistics.countDocuments({
                    omId: om._id,
                    assignmentStatus: { $in: ['COMPLETED', 'APPROVED'] },
                }),
            ]);

            return {
                _id: om._id,
                firstName: om.firstName,
                lastName: om.lastName,
                mobileNo: om.mobileNo,
                unassigned: unassignedCount,
                assigned: assignedCount,
                completed: completedCount,
                total: unassignedCount + assignedCount + completedCount,
            };
        }));

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching OM metrics for FO:', error);
        res.status(500).json({ message: 'Server error while fetching OM metrics' });
    }
};

module.exports = {
    getFODashboard,
    getFOPlots,
    getUnassignedPlots,
    getSelectorsPerformance,
    getSelectorsPerformanceWeekly,
    getSelectorsPerformanceMonthly,
    getSelectorMileage,
    getFOSelectors,
    getOmMetricsForFO,
};
