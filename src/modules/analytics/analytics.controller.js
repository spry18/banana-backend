const mongoose = require('mongoose');
const Enquiry = require('../enquiries/enquiry.model');
const Packing = require('../execution/packing.model');
const Logistics = require('../logistics/logistics.model');
const ExcelJS = require('exceljs');

// ─── Shared helper ────────────────────────────────────────────────────────────
// Builds a Logistics match stage from common query params.
const buildLogisticsMatch = ({ startDate, endDate, companyId }) => {
    const match = {};
    if (companyId) match.companyId = new mongoose.Types.ObjectId(companyId);
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate)   match.createdAt.$lte = new Date(endDate);
    }
    return match;
};

// Builds an Enquiry match stage from common query params.
const buildEnquiryMatch = ({ startDate, endDate, location, companyId, status } = {}) => {
    const match = {};
    if (location)  match.location  = { $regex: location, $options: 'i' };
    if (companyId) match.companyId = new mongoose.Types.ObjectId(companyId);
    if (status)    match.status    = status;
    if (startDate || endDate) {
        match.createdAt = {};
        if (startDate) match.createdAt.$gte = new Date(startDate);
        if (endDate)   match.createdAt.$lte = new Date(endDate);
    }
    return match;
};

// ─── 1. Analytics Dashboard ───────────────────────────────────────────────────
// @desc    Combined analytics dashboard (top stats + charts + recent transactions)
// @route   GET /api/analytics/dashboard
// @access  Private (Admin)
const getAnalyticsDashboard = async (req, res) => {
    try {
        const { startDate, endDate, location, companyId } = req.query;

        const logisticsMatch = buildLogisticsMatch({ startDate, endDate, companyId });
        const enquiryMatch   = buildEnquiryMatch({ startDate, endDate, location, companyId });

        // ── Run all aggregations concurrently ─────────────────────────────────
        const [
            topStats,
            monthlyTrend,
            locationPerformance,
            companyPerformance,
            recentTransactions,
            fieldSelectors,
            munshis,
            drivers,
        ] = await Promise.all([

            // ── Top Stats: Revenue + Boxes + Avg Rate from Logistics + Packing ──
            // Revenue = purchaseRate (per box) × totalBoxes on each logistics record.
            // Boxes   = sum of confirmed boxes from Packing (submitted/approved).
            // We run two sub-aggregations and merge them.
            (async () => {
                const [revStats, boxStats] = await Promise.all([
                    Logistics.aggregate([
                        { $match: logisticsMatch },
                        {
                            $group: {
                                _id: null,
                                totalRevenue: {
                                    $sum: { $multiply: ['$purchaseRate', '$totalBoxes'] },
                                },
                                avgPurchaseRate: { $avg: '$purchaseRate' },
                                assignmentsCount: { $sum: 1 },
                            },
                        },
                    ]),
                    Packing.aggregate([
                        { $match: { status: { $in: ['SUBMITTED', 'APPROVED'] } } },
                        {
                            $group: {
                                _id: null,
                                totalBoxes: { $sum: '$totalBoxes' },
                            },
                        },
                    ]),
                ]);

                return {
                    totalRevenue:    revStats[0]?.totalRevenue    ?? 0,
                    avgPurchaseRate: revStats[0]?.avgPurchaseRate  ?? 0,
                    assignmentsCount: revStats[0]?.assignmentsCount ?? 0,
                    totalBoxes:      boxStats[0]?.totalBoxes       ?? 0,
                };
            })(),

            // ── Monthly Trend: enquiries grouped by month (total vs converted) ─
            Enquiry.aggregate([
                { $match: enquiryMatch },
                {
                    $group: {
                        _id: {
                            year:  { $year:  '$createdAt' },
                            month: { $month: '$createdAt' },
                        },
                        total:     { $sum: 1 },
                        selected:  { $sum: { $cond: [{ $eq: ['$status', 'SELECTED'] },   1, 0] } },
                        ratFixed:  { $sum: { $cond: [{ $eq: ['$status', 'RATE_FIXED'] }, 1, 0] } },
                        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] },  1, 0] } },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
                {
                    $project: {
                        _id: 0,
                        year:      '$_id.year',
                        month:     '$_id.month',
                        total:     1,
                        selected:  1,
                        ratFixed:  1,
                        completed: 1,
                        // convenient label for chart x-axis
                        label: {
                            $concat: [
                                { $toString: '$_id.year' },
                                '-',
                                {
                                    $cond: [
                                        { $lt: ['$_id.month', 10] },
                                        { $concat: ['0', { $toString: '$_id.month' }] },
                                        { $toString: '$_id.month' },
                                    ],
                                },
                            ],
                        },
                    },
                },
            ]),

            // ── Location Performance: boxes + revenue grouped by location ──────
            Logistics.aggregate([
                { $match: logisticsMatch },
                {
                    // Join with Enquiry so we can group by enquiry.location
                    $lookup: {
                        from:         'enquiries',
                        localField:   'enquiryId',
                        foreignField: '_id',
                        as:           'enquiry',
                    },
                },
                { $unwind: { path: '$enquiry', preserveNullAndEmptyArrays: true } },
                ...(location ? [{ $match: { 'enquiry.location': { $regex: location, $options: 'i' } } }] : []),
                {
                    $group: {
                        _id:         '$enquiry.location',
                        totalBoxes:  { $sum: '$totalBoxes' },
                        totalRevenue: {
                            $sum: { $multiply: ['$purchaseRate', '$totalBoxes'] },
                        },
                        avgRate:      { $avg: '$purchaseRate' },
                        plotCount:    { $sum: 1 },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        location:     '$_id',
                        totalBoxes:   1,
                        totalRevenue: 1,
                        avgRate:      { $round: ['$avgRate', 2] },
                        plotCount:    1,
                    },
                },
                { $sort: { totalRevenue: -1 } },
            ]),

            // ── Company Performance: boxes + avg rate + revenue per company ────
            Logistics.aggregate([
                { $match: { ...logisticsMatch, companyId: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id:          '$companyId',
                        totalBoxes:   { $sum: '$totalBoxes' },
                        totalRevenue: {
                            $sum: { $multiply: ['$purchaseRate', '$totalBoxes'] },
                        },
                        avgRate:      { $avg: '$purchaseRate' },
                        assignmentsCount: { $sum: 1 },
                    },
                },
                {
                    $lookup: {
                        from:         'companies',
                        localField:   '_id',
                        foreignField: '_id',
                        as:           'company',
                    },
                },
                { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        companyId:        '$_id',
                        companyName:      { $ifNull: ['$company.companyName', 'Unknown'] },
                        totalBoxes:       1,
                        totalRevenue:     1,
                        avgRate:          { $round: ['$avgRate', 2] },
                        assignmentsCount: 1,
                    },
                },
                { $sort: { totalRevenue: -1 } },
            ]),

            // ── Recent Transactions: last 5 logistics assignments ─────────────
            Logistics.find(logisticsMatch)
                .sort({ createdAt: -1 })
                .limit(5)
                .populate({
                    path: 'enquiryId',
                    select: 'enquiryId farmerFirstName farmerLastName location',
                })
                .populate('companyId', 'companyName')
                .populate('munshiId', 'firstName lastName')
                .select('enquiryId companyId munshiId purchaseRate totalBoxes assignmentStatus createdAt teamName')
                .lean(),

            // ── Field Selectors: visits + selection percentage ───────────────
            Enquiry.aggregate([
                {
                    $match: {
                        ...enquiryMatch,
                        assignedSelectorId: { $exists: true, $ne: null },
                    },
                },
                {
                    $group: {
                        _id: '$assignedSelectorId',
                        visits: { $sum: 1 },
                        selectedCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'SELECTED'] }, 1, 0] },
                        },
                    },
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'selector',
                    },
                },
                { $unwind: { path: '$selector', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        name: {
                            $trim: {
                                input: {
                                    $concat: [
                                        { $ifNull: ['$selector.firstName', ''] },
                                        ' ',
                                        { $ifNull: ['$selector.lastName', ''] },
                                    ],
                                },
                            },
                        },
                        visits: 1,
                        selectPercentage: {
                            $round: [
                                {
                                    $cond: [
                                        { $eq: ['$visits', 0] },
                                        0,
                                        {
                                            $multiply: [
                                                { $divide: ['$selectedCount', '$visits'] },
                                                100,
                                            ],
                                        },
                                    ],
                                },
                                1,
                            ],
                        },
                    },
                },
                { $match: { name: { $ne: '' } } },
                { $sort: { visits: -1 } },
            ]),

            // ── Munshis: assignment loads ────────────────────────────────────
            Logistics.aggregate([
                {
                    $match: {
                        ...logisticsMatch,
                        munshiId: { $exists: true, $ne: null },
                    },
                },
                {
                    $lookup: {
                        from: 'enquiries',
                        localField: 'enquiryId',
                        foreignField: '_id',
                        as: 'enquiry',
                    },
                },
                { $unwind: { path: '$enquiry', preserveNullAndEmptyArrays: true } },
                ...(location ? [{ $match: { 'enquiry.location': { $regex: location, $options: 'i' } } }] : []),
                {
                    $group: {
                        _id: '$munshiId',
                        loads: { $sum: 1 },
                    },
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'munshi',
                    },
                },
                { $unwind: { path: '$munshi', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        name: {
                            $trim: {
                                input: {
                                    $concat: [
                                        { $ifNull: ['$munshi.firstName', ''] },
                                        ' ',
                                        { $ifNull: ['$munshi.lastName', ''] },
                                    ],
                                },
                            },
                        },
                        loads: 1,
                        wastage: { $literal: '-' },
                    },
                },
                { $match: { name: { $ne: '' } } },
                { $sort: { loads: -1 } },
            ]),

            // ── Drivers: total trips ──────────────────────────────────────────
            Logistics.aggregate([
                {
                    $match: {
                        ...logisticsMatch,
                        driverId: { $exists: true, $ne: null },
                    },
                },
                {
                    $lookup: {
                        from: 'enquiries',
                        localField: 'enquiryId',
                        foreignField: '_id',
                        as: 'enquiry',
                    },
                },
                { $unwind: { path: '$enquiry', preserveNullAndEmptyArrays: true } },
                ...(location ? [{ $match: { 'enquiry.location': { $regex: location, $options: 'i' } } }] : []),
                {
                    $group: {
                        _id: '$driverId',
                        trips: { $sum: 1 },
                    },
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'driver',
                    },
                },
                { $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 0,
                        name: {
                            $trim: {
                                input: {
                                    $concat: [
                                        { $ifNull: ['$driver.firstName', ''] },
                                        ' ',
                                        { $ifNull: ['$driver.lastName', ''] },
                                    ],
                                },
                            },
                        },
                        trips: 1,
                        onTime: { $literal: '-' },
                    },
                },
                { $match: { name: { $ne: '' } } },
                { $sort: { trips: -1 } },
            ]),
        ]);

        res.json({
            topStats,
            monthlyTrend,
            locationPerformance,
            companyPerformance,
            recentTransactions,
            fieldSelectors,
            munshis,
            drivers,
        });
    } catch (error) {
        console.error('Analytics dashboard error:', error);
        res.status(500).json({ message: 'Server error while fetching analytics dashboard', error: error.message });
    }
};

// ─── 2. Generated Report ──────────────────────────────────────────────────────
// @desc    Location-grouped performance report with pagination
// @route   GET /api/analytics/generated-report
// @access  Private (Admin)
const getGeneratedReport = async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            location,
            companyId,
            status,
            page  = 1,
            limit = 20,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        // Build the base enquiry match (used for both summary counts and table data)
        const enquiryMatch = buildEnquiryMatch({ startDate, endDate, location, companyId, status });

        // ── Aggregation: group by location ────────────────────────────────────
        // We join Logistics to get confirmed box/revenue data per location.
        const locationPipeline = [
            { $match: enquiryMatch },
            // Join matching logistics record (1:1 via enquiryId)
            {
                $lookup: {
                    from:         'logistics',
                    localField:   '_id',
                    foreignField: 'enquiryId',
                    as:           'logistics',
                },
            },
            { $unwind: { path: '$logistics', preserveNullAndEmptyArrays: true } },
            // Group by location
            {
                $group: {
                    _id:             '$location',
                    totalEnquiries:  { $sum: 1 },
                    selectedCount:   { $sum: { $cond: [{ $eq: ['$status', 'SELECTED'] },   1, 0] } },
                    ratFixedCount:   { $sum: { $cond: [{ $eq: ['$status', 'RATE_FIXED'] }, 1, 0] } },
                    completedCount:  { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] },  1, 0] } },
                    totalBoxes:      { $sum: { $ifNull: ['$logistics.totalBoxes', 0] } },
                    totalRevenue:    {
                        $sum: {
                            $multiply: [
                                { $ifNull: ['$logistics.purchaseRate', 0] },
                                { $ifNull: ['$logistics.totalBoxes',   0] },
                            ],
                        },
                    },
                },
            },
            // Compute derived metrics
            {
                $addFields: {
                    selectionPercentage: {
                        $cond: [
                            { $eq: ['$totalEnquiries', 0] },
                            0,
                            {
                                $round: [
                                    {
                                        $multiply: [
                                            { $divide: ['$selectedCount', '$totalEnquiries'] },
                                            100,
                                        ],
                                    },
                                    2,
                                ],
                            },
                        ],
                    },
                },
            },
            {
                $project: {
                    _id: 0,
                    location:            '$_id',
                    totalEnquiries:      1,
                    selectedCount:       1,
                    ratFixedCount:       1,
                    completedCount:      1,
                    selectionPercentage: 1,
                    totalBoxes:          1,
                    totalRevenue:        1,
                },
            },
            { $sort: { totalRevenue: -1 } },
        ];

        // Run location aggregation + total count in parallel
        const [allLocationData] = await Promise.all([
            Enquiry.aggregate(locationPipeline),
        ]);

        // ── Overall summary (totals across all filtered data) ─────────────────
        const summary = allLocationData.reduce(
            (acc, row) => {
                acc.totalLocations    += 1;
                acc.totalEnquiries    += row.totalEnquiries;
                acc.totalSelected     += row.selectedCount;
                acc.totalBoxes        += row.totalBoxes;
                acc.totalRevenue      += row.totalRevenue;
                return acc;
            },
            { totalLocations: 0, totalEnquiries: 0, totalSelected: 0, totalBoxes: 0, totalRevenue: 0 }
        );

        summary.overallSelectionPercentage =
            summary.totalEnquiries > 0
                ? parseFloat(((summary.totalSelected / summary.totalEnquiries) * 100).toFixed(2))
                : 0;

        // ── Paginate the location rows in application code ────────────────────
        const totalPages = Math.ceil(allLocationData.length / Number(limit));
        const tableData  = allLocationData.slice(skip, skip + Number(limit));

        res.json({
            summary,
            tableData,
            page:  Number(page),
            pages: totalPages,
        });
    } catch (error) {
        console.error('Generated report error:', error);
        res.status(500).json({ message: 'Server error while generating report', error: error.message });
    }
};

// ─── 3. Master Report (existing — preserved unchanged) ────────────────────────
// @desc    Master analytics report
// @route   GET /api/analytics/master-report
// @access  Private (Admin)
const masterReport = async (req, res) => {
    try {
        const { location, companyId, startDate, endDate } = req.query;

        const matchStage = { status: 'COMPLETED' };
        if (location)  matchStage.location  = location;
        if (companyId) matchStage.companyId = new mongoose.Types.ObjectId(companyId);
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate)   matchStage.createdAt.$lte = new Date(endDate);
        }

        const [byLocation, byCompany, wastageStats, totals] = await Promise.all([
            Enquiry.aggregate([
                { $match: { ...matchStage, purchaseRate: { $exists: true } } },
                {
                    $group: {
                        _id: '$location',
                        totalPlots:   { $sum: 1 },
                        totalRevenue: { $sum: '$purchaseRate' },
                        avgRate:      { $avg: '$purchaseRate' },
                        minRate:      { $min: '$purchaseRate' },
                        maxRate:      { $max: '$purchaseRate' },
                    },
                },
                { $sort: { totalRevenue: -1 } },
            ]),
            Enquiry.aggregate([
                { $match: { ...matchStage, companyId: { $exists: true } } },
                {
                    $group: {
                        _id:          '$companyId',
                        totalPlots:   { $sum: 1 },
                        totalRevenue: { $sum: '$purchaseRate' },
                        avgRate:      { $avg: '$purchaseRate' },
                    },
                },
                {
                    $lookup: {
                        from: 'companies', localField: '_id', foreignField: '_id', as: 'company',
                    },
                },
                { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        companyName:  '$company.companyName',
                        totalPlots:   1,
                        totalRevenue: 1,
                        avgRate:      1,
                    },
                },
                { $sort: { totalRevenue: -1 } },
            ]),
            Packing.aggregate([
                {
                    $group: {
                        _id:           null,
                        totalBoxes:    { $sum: '$totalBoxes' },
                        totalWastageKg: { $sum: '$wastageKg' },
                        packingRecords: { $sum: 1 },
                    },
                },
            ]),
            Enquiry.aggregate([
                { $match: { ...matchStage, purchaseRate: { $exists: true } } },
                {
                    $group: {
                        _id:            null,
                        totalEnquiries: { $sum: 1 },
                        totalRevenue:   { $sum: '$purchaseRate' },
                        avgRate:        { $avg: '$purchaseRate' },
                    },
                },
            ]),
        ]);

        const wastage       = wastageStats[0] || { totalBoxes: 0, totalWastageKg: 0, packingRecords: 0 };
        const totalBoxes    = wastage.totalBoxes || 1;
        const wastagePercent = ((wastage.totalWastageKg / (totalBoxes * 14)) * 100).toFixed(2);

        res.json({
            summary: totals[0] || { totalEnquiries: 0, totalRevenue: 0, avgRate: 0 },
            wastage: {
                totalWastageKg:  wastage.totalWastageKg,
                totalBoxes:      wastage.totalBoxes,
                wastagePercent:  `${wastagePercent}%`,
            },
            byLocation,
            byCompany,
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ message: 'Server error while generating report', error: error.message });
    }
};

// ─── 4. Export Report (existing — preserved unchanged) ────────────────────────
// @desc    Export analytics report as Excel
// @route   GET /api/analytics/export
// @access  Private (Admin)
const exportReport = async (req, res) => {
    try {
        const { location, companyId, startDate, endDate } = req.query;

        const matchStage = { purchaseRate: { $exists: true } };
        if (location) matchStage.location = location;
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate)   matchStage.createdAt.$lte = new Date(endDate);
        }

        const enquiries = await Enquiry.find(matchStage)
            .populate('companyId', 'companyName')
            .select('enquiryId farmerFirstName farmerLastName location subLocation purchaseRate status createdAt companyId')
            .sort({ createdAt: -1 })
            .lean();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'VaxTrack Admin';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Master Analytics Report');

        sheet.columns = [
            { header: 'Enquiry ID',        key: 'enquiryId',    width: 20 },
            { header: 'Farmer Name',        key: 'farmerName',   width: 25 },
            { header: 'Location',           key: 'location',     width: 20 },
            { header: 'Sub-Location',       key: 'subLocation',  width: 20 },
            { header: 'Company',            key: 'company',      width: 25 },
            { header: 'Purchase Rate (₹)',  key: 'purchaseRate', width: 20 },
            { header: 'Status',             key: 'status',       width: 15 },
            { header: 'Date',               key: 'date',         width: 20 },
        ];

        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };

        enquiries.forEach((e) => {
            sheet.addRow({
                enquiryId:    e.enquiryId,
                farmerName:   `${e.farmerFirstName} ${e.farmerLastName}`,
                location:     e.location,
                subLocation:  e.subLocation || '-',
                company:      e.companyId?.companyName || 'N/A',
                purchaseRate: e.purchaseRate,
                status:       e.status,
                date:         e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-IN') : '-',
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="vaxtrack-analytics.xlsx"');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ message: 'Failed to generate export', error: error.message });
    }
};

module.exports = {
    getAnalyticsDashboard,
    getGeneratedReport,
    masterReport,
    exportReport,
};
