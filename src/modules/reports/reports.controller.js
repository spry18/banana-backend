const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');
const Logistics = require('../logistics/logistics.model');
const Packing = require('../execution/packing.model');
const User = require('../users/user.model');

// @desc    Get Detailed Field Selection Report
// @route   GET /api/reports/field-selection
// @access  Private (Admin, Operational Manager)
const getFieldSelectionReport = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            location,
            companyId,
            dateFilter,
            startDate,
            endDate,
            fieldOwnerId,
            assignedSelectorId,
            date,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        // ── 1. Calculate Stats ──
        const packingStats = await Packing.aggregate([
            {
                $group: {
                    _id: null,
                    totalBoxes: { $sum: '$totalBoxes' },
                    totalWastage: { $sum: '$wastageKg' },
                    lineRejected: {
                        $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] },
                    },
                },
            },
        ]);

        const pStats = packingStats[0] || { totalBoxes: 0, totalWastage: 0, lineRejected: 0 };
        const totalRejected = await Enquiry.countDocuments({ status: 'REJECTED' });
        const totalTrips = await Logistics.countDocuments();

        const stats = {
            totalBoxes: pStats.totalBoxes,
            totalWastage: pStats.totalWastage,
            totalRejected,
            totalTrips,
            lineRejected: pStats.lineRejected,
        };

        // ── 2. Table Data (from Inspection joined to Enquiry) ──
        const query = {};
        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }
        if (companyId) {
            query.companyId = companyId;
        }

        if (fieldOwnerId) {
            query.fieldOwnerId = fieldOwnerId;
        }
        if (assignedSelectorId) {
            query.assignedSelectorId = assignedSelectorId;
        }

        if (search) {
            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
            ];
        }

        // Apply common date filters
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
                query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }

        const enquiries = await Enquiry.find(query)
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('assignedSelectorId', 'firstName lastName bikeNumber')
            .populate('companyId', 'companyName')
            .lean();

        const enquiryIds = enquiries.map(e => e._id);

        const [inspections, total] = await Promise.all([
            Inspection.find({ enquiryId: { $in: enquiryIds } })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Inspection.countDocuments({ enquiryId: { $in: enquiryIds } }),
        ]);

        const enquiryMap = enquiries.reduce((acc, e) => {
            acc[e._id.toString()] = e;
            return acc;
        }, {});

        const associatedLogistics = await Logistics.find({ enquiryId: { $in: enquiryIds } }).lean();
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

        const tableData = inspections.map(ins => {
            const e = enquiryMap[ins.enquiryId.toString()] || {};
            const logistics = logisticsMap[e._id?.toString()];
            const packing = logistics ? packingMap[logistics._id.toString()] : null;

            return {
                date: ins.createdAt,
                farmerName: e.farmerFirstName ? `${e.farmerFirstName} ${e.farmerLastName}` : 'Unknown',
                mobileNumber: e.farmerMobile || 'N/A',
                location: e.location || 'N/A',
                rate: e.purchaseRate || null,
                fieldOwner: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : null,
                fieldSelector: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : null,
                fieldSelectorBike: e.assignedSelectorId ? (e.assignedSelectorId.bikeNumber || null) : null,
                company: e.companyId ? e.companyId.companyName : null,
                weight: e.estimatedBoxes || e.plantCount || 0, 

                // Additional response fields
                status: e.status || null,
                fieldOwnerName: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : null,
                fieldSelectorName: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : null,
                totalBoxes: packing ? (packing.totalBoxes || 0) : (e.estimatedBoxes || 0),
            };
        });

        res.json({
            stats,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            tableData,
        });
    } catch (error) {
        console.error('Error fetching Field Selection Report:', error);
        res.status(500).json({ message: 'Server error while fetching Field Selection Report' });
    }
};

// @desc    Get Detailed Execution Report
// @route   GET /api/reports/execution-detailed
// @access  Private (Admin, Operational Manager)
const getExecutionDetailedReport = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search,
            location,
            companyId,
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);
        const now = new Date();

        // ── 1. Calculate Stats (from Enquiry) ──
        const [
            totalEnquiries,
            selectedPlots,
            rejectedPlots,
            missedPlots,
            rescheduled,
        ] = await Promise.all([
            Enquiry.countDocuments(),
            Enquiry.countDocuments({
                $or: [
                    { status: { $in: ['SELECTED', 'RATE_FIXED', 'COMPLETED'] } },
                    { status: 'ASSIGNED', purchaseRate: { $ne: null, $exists: true } }
                ]
            }),
            Enquiry.countDocuments({ status: 'REJECTED' }),
            Enquiry.countDocuments({ scheduledDate: { $lt: now }, status: 'PENDING' }),
            Enquiry.countDocuments({ status: 'RESCHEDULED' }),
        ]);

        const stats = {
            totalEnquiries,
            selectedPlots,
            rejectedPlots,
            missedPlots,
            rescheduled,
        };

        // ── 2. Table Data (from Logistics joined to Enquiry and Packing) ──
        const query = {};
        if (companyId) {
            query.companyId = companyId;
        }

        // Filter Logistics based on Enquiry criteria if needed
        let matchingEnquiryIds = null;
        if (location || search) {
            const eqQuery = {};
            if (location) eqQuery.location = { $regex: location, $options: 'i' };
            if (search) {
                eqQuery.$or = [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { farmerMobile: { $regex: search, $options: 'i' } },
                ];
            }
            const matchingEnquiries = await Enquiry.find(eqQuery).select('_id').lean();
            matchingEnquiryIds = matchingEnquiries.map(e => e._id);
            query.enquiryId = { $in: matchingEnquiryIds };
        }

        const [logistics, total] = await Promise.all([
            Logistics.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('enquiryId', 'farmerMobile location subLocation')
                .populate('driverId', 'firstName lastName')
                .populate('munshiId', 'firstName lastName')
                .lean(),
            Logistics.countDocuments(query),
        ]);

        const logisticsIds = logistics.map(l => l._id);
        const packings = await Packing.find({ assignmentId: { $in: logisticsIds } }).lean();
        
        const packingMap = packings.reduce((acc, p) => {
            acc[p.assignmentId.toString()] = p;
            return acc;
        }, {});

        const tableData = logistics.map(l => {
            const p = packingMap[l._id.toString()] || {};
            const e = l.enquiryId || {};
            
            // "teamName" might come from Packing or Logistics
            let teamName = l.teamName;
            if (!teamName && p.teamName) teamName = p.teamName;
            if (!teamName && l.munshiId) teamName = `${l.munshiId.firstName} ${l.munshiId.lastName}'s Team`;

            return {
                mobile: e.farmerMobile || 'N/A',
                location: e.location || 'N/A',
                teamName: teamName || 'N/A',
                eicherDriver: l.driverId ? `${l.driverId.firstName} ${l.driverId.lastName}` : 'N/A',
                weight: p.totalBoxes || l.totalBoxes || 0, // Using totalBoxes as proxy for weight
                wastage: p.wastageKg || 0,
            };
        });

        res.json({
            stats,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            tableData,
        });

    } catch (error) {
        console.error('Error fetching Execution Detailed Report:', error);
        res.status(500).json({ message: 'Server error while fetching Execution Detailed Report' });
    }
};

// @desc    Get Munshi Harvesting Data Report
// @route   GET /api/reports/munshi-harvesting
// @access  Private (Admin, Operational Manager)
const getMunshiHarvestingReport = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfQuarter = new Date(now.getFullYear(), now.getMonth() - 2, 1);

        // Fetch all SUBMITTED/APPROVED packings for the quarter
        const packings = await Packing.find({
            status: { $in: ['SUBMITTED', 'APPROVED'] },
            createdAt: { $gte: startOfQuarter },
        })
            .populate('munshiId', 'firstName lastName')
            .lean();

        // Aggregate by Munshi
        const munshiStats = {};

        packings.forEach(p => {
            const munshiIdStr = p.munshiId ? p.munshiId._id.toString() : 'unknown';
            if (munshiIdStr === 'unknown') return;

            if (!munshiStats[munshiIdStr]) {
                munshiStats[munshiIdStr] = {
                    munshiName: `${p.munshiId.firstName} ${p.munshiId.lastName}`,
                    totalBoxesQuarter: 0,
                    totalBoxesMonth: 0,
                    daysActiveInMonth: new Set(),
                };
            }

            const isCurrentMonth = p.createdAt >= startOfMonth;
            
            munshiStats[munshiIdStr].totalBoxesQuarter += (p.totalBoxes || 0);
            
            if (isCurrentMonth) {
                munshiStats[munshiIdStr].totalBoxesMonth += (p.totalBoxes || 0);
                const dayString = new Date(p.createdAt).toISOString().split('T')[0];
                munshiStats[munshiIdStr].daysActiveInMonth.add(dayString);
            }
        });

        const reportData = Object.values(munshiStats).map(stats => {
            const daysActive = stats.daysActiveInMonth.size || 1; // avoid div by 0
            const perDay = Math.round(stats.totalBoxesMonth / daysActive);
            
            return {
                munshiName: stats.munshiName,
                perDay: perDay,
                perMonth: stats.totalBoxesMonth,
                quarterly: stats.totalBoxesQuarter,
            };
        });

        res.json(reportData);

    } catch (error) {
        console.error('Error fetching Munshi Harvesting Report:', error);
        res.status(500).json({ message: 'Server error while fetching Munshi Harvesting Report' });
    }
};

// @desc    Export Field Selection Report to Excel
// @route   GET /api/reports/field-selection/export
// @access  Private (Admin, Operational Manager)
const exportFieldSelectionReport = async (req, res) => {
    try {
        const {
            search,
            location,
            companyId,
            dateFilter,
            startDate,
            endDate,
            fieldOwnerId,
            assignedSelectorId,
            date,
        } = req.query;

        // ── 2. Query Data (no pagination limit) ──
        const query = {};
        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }
        if (companyId) {
            query.companyId = companyId;
        }

        if (fieldOwnerId) {
            query.fieldOwnerId = fieldOwnerId;
        }
        if (assignedSelectorId) {
            query.assignedSelectorId = assignedSelectorId;
        }

        if (search) {
            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
            ];
        }

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
                query.createdAt = { $gte: dateRange.startOfDay, $lt: dateRange.endOfDay };
            }
        }

        const enquiries = await Enquiry.find(query)
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('assignedSelectorId', 'firstName lastName bikeNumber')
            .populate('companyId', 'companyName')
            .lean();

        const enquiryIds = enquiries.map(e => e._id);

        const inspections = await Inspection.find({ enquiryId: { $in: enquiryIds } })
            .sort({ createdAt: -1 })
            .lean();

        const enquiryMap = enquiries.reduce((acc, e) => {
            acc[e._id.toString()] = e;
            return acc;
        }, {});

        const associatedLogistics = await Logistics.find({ enquiryId: { $in: enquiryIds } }).lean();
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

        // Build Excel Workbook
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Field Selection Report');

        sheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Farmer Name', key: 'farmerName', width: 20 },
            { header: 'Mobile Number', key: 'mobileNumber', width: 15 },
            { header: 'Location', key: 'location', width: 15 },
            { header: 'Rate (₹)', key: 'rate', width: 10 },
            { header: 'Field Owner', key: 'fieldOwner', width: 20 },
            { header: 'Field Selector', key: 'fieldSelector', width: 20 },
            { header: 'Company', key: 'company', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Total Boxes', key: 'totalBoxes', width: 12 },
        ];

        inspections.forEach(ins => {
            const e = enquiryMap[ins.enquiryId.toString()] || {};
            const logistics = logisticsMap[e._id?.toString()];
            const packing = logistics ? packingMap[logistics._id.toString()] : null;

            sheet.addRow({
                date: new Date(ins.createdAt).toLocaleDateString('en-IN'),
                farmerName: e.farmerFirstName ? `${e.farmerFirstName} ${e.farmerLastName}` : 'Unknown',
                mobileNumber: e.farmerMobile || 'N/A',
                location: e.location || 'N/A',
                rate: e.purchaseRate || null,
                fieldOwner: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : null,
                fieldSelector: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : null,
                company: e.companyId ? e.companyId.companyName : null,
                status: e.status || 'N/A',
                totalBoxes: packing ? (packing.totalBoxes || 0) : (e.estimatedBoxes || 0),
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=field_selection_report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Field Selection Report:', error);
        res.status(500).json({ message: 'Server error during report export' });
    }
};

// @desc    Export Munshi Harvesting Report to Excel
// @route   GET /api/reports/munshi-harvesting/export
// @access  Private (Admin, Operational Manager)
const exportMunshiHarvestingReport = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfQuarter = new Date(now.getFullYear(), now.getMonth() - 2, 1);

        const packings = await Packing.find({
            status: { $in: ['SUBMITTED', 'APPROVED'] },
            createdAt: { $gte: startOfQuarter },
        })
            .populate('munshiId', 'firstName lastName')
            .lean();

        const munshiStats = {};
        packings.forEach(p => {
            const munshiIdStr = p.munshiId ? p.munshiId._id.toString() : 'unknown';
            if (munshiIdStr === 'unknown') return;

            if (!munshiStats[munshiIdStr]) {
                munshiStats[munshiIdStr] = {
                    munshiName: `${p.munshiId.firstName} ${p.munshiId.lastName}`,
                    totalBoxesQuarter: 0,
                    totalBoxesMonth: 0,
                    daysActiveInMonth: new Set(),
                };
            }

            const isCurrentMonth = p.createdAt >= startOfMonth;
            munshiStats[munshiIdStr].totalBoxesQuarter += (p.totalBoxes || 0);
            if (isCurrentMonth) {
                munshiStats[munshiIdStr].totalBoxesMonth += (p.totalBoxes || 0);
                const dayString = new Date(p.createdAt).toISOString().split('T')[0];
                munshiStats[munshiIdStr].daysActiveInMonth.add(dayString);
            }
        });

        // Build Excel Workbook
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Munshi Harvesting Report');

        sheet.columns = [
            { header: 'Munshi Name', key: 'munshiName', width: 25 },
            { header: 'Per Day (Avg)', key: 'perDay', width: 15 },
            { header: 'Per Month (Total)', key: 'perMonth', width: 18 },
            { header: 'Quarterly (Total)', key: 'quarterly', width: 18 },
        ];

        Object.values(munshiStats).forEach(stats => {
            const daysActive = stats.daysActiveInMonth.size || 1;
            const perDay = Math.round(stats.totalBoxesMonth / daysActive);

            sheet.addRow({
                munshiName: stats.munshiName,
                perDay: perDay,
                perMonth: stats.totalBoxesMonth,
                quarterly: stats.totalBoxesQuarter,
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=munshi_harvesting_report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Munshi Harvesting Report:', error);
        res.status(500).json({ message: 'Server error during report export' });
    }
};

module.exports = {
    getFieldSelectionReport,
    getExecutionDetailedReport,
    getMunshiHarvestingReport,
    exportFieldSelectionReport,
    exportMunshiHarvestingReport,
};
