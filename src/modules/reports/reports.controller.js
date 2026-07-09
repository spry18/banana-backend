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

// @desc    Export Transport Summary Report to Excel
// @route   GET /api/reports/transport-summary/export
// @access  Private (Admin, Operational Manager)
const exportTransportSummaryReport = async (req, res) => {
    try {
        const Trip = require('../execution/trip.model');
        const DieselAdvance = require('../diesel-advance/dieselAdvance.model');
        const Company = require('../master-data/company.model');
        const Vehicle = require('../master-data/vehicle.model');
        const Brand = require('../master-data/brand.model');
        const ExcelJS = require('exceljs');

        const { dateFilter, startDate, endDate, date } = req.query;
        const query = {
            assignmentStatus: { $in: ['COMPLETED', 'APPROVED'] }
        };

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

        const logisticsList = await Logistics.find(query)
            .populate('enquiryId')
            .populate('companyId', 'companyName')
            .populate('munshiId', 'firstName lastName')
            .populate({
                path: 'driverId',
                select: 'firstName lastName mobileNo vehicleId',
                populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' }
            })
            .populate({
                path: 'pickupDriverId',
                select: 'firstName lastName mobileNo vehicleId',
                populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' }
            })
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .lean();

        const assignmentIds = logisticsList.map(l => l._id);
        const enquiryIds = logisticsList.map(l => l.enquiryId?._id).filter(Boolean);

        const trips = await Trip.find({ assignmentId: { $in: assignmentIds } }).lean();
        const packings = await Packing.find({ assignmentId: { $in: assignmentIds } }).populate('brandId', 'brandName').lean();
        const inspections = await Inspection.find({ enquiryId: { $in: enquiryIds } }).lean();
        const dieselAdvances = await DieselAdvance.find({ assignmentId: { $in: assignmentIds } }).lean();

        const tripsMap = {};
        trips.forEach(t => {
            const key = t.assignmentId.toString();
            if (!tripsMap[key]) tripsMap[key] = [];
            tripsMap[key].push(t);
        });

        const packingMap = {};
        packings.forEach(p => {
            packingMap[p.assignmentId.toString()] = p;
        });

        const inspectionMap = {};
        inspections.forEach(ins => {
            inspectionMap[ins.enquiryId.toString()] = ins;
        });

        const dieselMap = {};
        dieselAdvances.forEach(da => {
            const key = da.assignmentId.toString();
            if (!dieselMap[key]) dieselMap[key] = [];
            dieselMap[key].push(da);
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Transport Summary');

        sheet.columns = [
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Vehicle Number', key: 'vehicleNumber', width: 15 },
            { header: 'Vehicle Km', key: 'vehicleKm', width: 12 },
            { header: 'Munsi', key: 'munsi', width: 20 },
            { header: 'Company Name', key: 'companyName', width: 20 },
            { header: 'Location', key: 'location', width: 15 },
            { header: 'Farmer\'s Name', key: 'farmerName', width: 20 },
            { header: 'Mobile No.', key: 'mobileNo', width: 15 },
            { header: 'Weight', key: 'weight', width: 12 },
            { header: 'Wastage', key: 'wastage', width: 12 },
            { header: 'Farmer Rate', key: 'farmerRate', width: 12 },
            { header: 'Rate', key: 'rate', width: 10 },
            { header: 'Remaining Box', key: 'remainingBox', width: 15 },
            { header: 'Extra Transport', key: 'extraTransport', width: 15 },
            { header: '3kg', key: 'box3Kg', width: 10 },
            { header: '3kg*', key: 'box3KgStar', width: 10 },
            { header: '5kg', key: 'box5Kg', width: 10 },
            { header: '5kg*', key: 'box5KgStar', width: 10 },
            { header: '7kg', key: 'box7Kg', width: 10 },
            { header: '7kg*', key: 'box7KgStar', width: 10 },
            { header: '13kg', key: 'box13Kg', width: 10 },
            { header: '13kg*', key: 'box13KgStar', width: 10 },
            { header: '13.5kg', key: 'box13_5Kg', width: 10 },
            { header: '13.5kg*', key: 'box13_5KgStar', width: 10 },
            { header: '14Kg', key: 'box14Kg', width: 10 },
            { header: '16kg', key: 'box16Kg', width: 10 },
            { header: '16kg*', key: 'box16KgStar', width: 10 },
            { header: 'Maximum Box Type', key: 'maxBoxType', width: 18 },
            { header: 'Second Box Type', key: 'secondBoxType', width: 18 },
            { header: 'Third Box Type', key: 'thirdBoxType', width: 18 },
            { header: 'Fourth Box Type', key: 'fourthBoxType', width: 18 },
            { header: '4H', key: 'box4H', width: 10 },
            { header: '5H', key: 'box5H', width: 10 },
            { header: '6H', key: 'box6H', width: 10 },
            { header: '7H', key: 'box7H', width: 10 },
            { header: '8H', key: 'box8H', width: 10 },
            { header: 'Vehicle Owner Name', key: 'vehicleOwnerName', width: 20 },
            { header: 'Disel', key: 'dieselEicher', width: 12 },
            { header: 'Toll', key: 'tollEicher', width: 10 },
            { header: 'Company', key: 'company', width: 20 },
            { header: 'Field Owner', key: 'fieldOwner', width: 20 },
            { header: 'Field Selectior', key: 'fieldSelector', width: 20 },
            { header: 'Partner', key: 'partner', width: 15 },
            { header: 'Pickup Trip Details', key: 'pickupTripDetails', width: 30 },
            { header: 'Pickup KM', key: 'pickupKm', width: 12 },
            { header: 'Pickup Number', key: 'pickupNumber', width: 15 },
            { header: 'Pickup Owner Name', key: 'pickupOwnerName', width: 20 },
            { header: 'Disel', key: 'dieselPickup', width: 12 },
            { header: 'Toll', key: 'tollPickup', width: 10 },
            { header: 'Line Status', key: 'lineStatus', width: 15 },
        ];

        logisticsList.forEach(l => {
            const e = l.enquiryId || {};
            const p = packingMap[l._id.toString()] || {};
            const ins = e._id ? inspectionMap[e._id.toString()] : null;
            const assocTrips = tripsMap[l._id.toString()] || [];

            const eicherTrip = assocTrips.find(t => t.driverType === 'Eicher');
            const pickupTrip = assocTrips.find(t => t.driverType === 'Pickup');

            const assocDiesels = dieselMap[l._id.toString()] || [];

            let dieselEicherAmount = 0;
            if (l.driverId) {
                const eicherDriverIdStr = l.driverId._id.toString();
                const eicherAdvances = assocDiesels.filter(da => da.driverId && da.driverId.toString() === eicherDriverIdStr);
                dieselEicherAmount = eicherAdvances.reduce((sum, da) => sum + (da.amount || 0), 0);
            }

            let dieselPickupAmount = 0;
            if (l.pickupDriverId) {
                const pickupDriverIdStr = l.pickupDriverId._id.toString();
                const pickupAdvances = assocDiesels.filter(da => da.driverId && da.driverId.toString() === pickupDriverIdStr);
                dieselPickupAmount = pickupAdvances.reduce((sum, da) => sum + (da.amount || 0), 0);
            }

            const dateStr = l.scheduledDate ? new Date(l.scheduledDate).toLocaleDateString('en-IN') : '';
            const remainingBox = (e.estimatedBoxes && p.totalBoxes) ? (e.estimatedBoxes - p.totalBoxes) : '';
            const extraTransport = l.isOverflow ? 'Yes' : 'No';
            const partner = (ins && ins.isThroughPartner) ? (ins.partnerName || 'N/A') : '';

            const box4H = p.box4H || 0;
            const box5H = p.box5H || 0;
            const box6H = p.box6H || 0;
            const box7Kg = p.box7Kg || 0;
            const box8H = p.box8H || 0;
            const boxCL = p.boxCL || 0;
            const box5Kg = p.box5Kg || 0;
            const box13Kg = p.box13Kg || 0;
            const box13_5Kg = p.box13_5Kg || 0;
            const box14Kg = p.box14Kg || 0;
            const box16Kg = p.box16Kg || 0;
            const boxOther = p.boxOther || 0;

            const hSum = box4H + box5H + box6H + box8H + boxCL;

            const enquiryPackingType = e.packingType || '';
            const is13Kg = enquiryPackingType.toLowerCase() === '13kg';
            const is13_5Kg = enquiryPackingType.toLowerCase() === '13.5kg';
            const is16Kg = enquiryPackingType.toLowerCase() === '16kg';
            const is5Kg = enquiryPackingType.toLowerCase() === '5kg';
            const is7Kg = enquiryPackingType.toLowerCase() === '7kg';

            const box13KgStar = is13Kg ? hSum : 0;
            const box13_5KgStar = is13_5Kg ? hSum : 0;
            const box16KgStar = is16Kg ? hSum : 0;
            const box5KgStar = is5Kg ? hSum : 0;
            const box7KgStar = is7Kg ? hSum : 0;
            const box3KgStar = 0;

            const boxCounts = [
                { name: '4H', count: box4H },
                { name: '5H', count: box5H },
                { name: '6H', count: box6H },
                { name: '7H/7Kg', count: box7Kg },
                { name: '8H', count: box8H },
                { name: 'CL', count: boxCL },
                { name: '5Kg', count: box5Kg },
                { name: '13Kg', count: box13Kg },
                { name: '13.5Kg', count: box13_5Kg },
                { name: '14Kg', count: box14Kg },
                { name: '16Kg', count: box16Kg },
                { name: 'Other', count: boxOther }
            ].filter(b => b.count > 0);

            boxCounts.sort((a, b) => b.count - a.count);

            const maxBoxType = boxCounts[0] ? `${boxCounts[0].name} (${boxCounts[0].count})` : '';
            const secondBoxType = boxCounts[1] ? `${boxCounts[1].name} (${boxCounts[1].count})` : '';
            const thirdBoxType = boxCounts[2] ? `${boxCounts[2].name} (${boxCounts[2].count})` : '';
            const fourthBoxType = boxCounts[3] ? `${boxCounts[3].name} (${boxCounts[3].count})` : '';

            let pickupTripDetails = '';
            if (pickupTrip && pickupTrip.routes && pickupTrip.routes.length > 0) {
                pickupTripDetails = pickupTrip.routes.map(r => `${r.startPoint} -> ${r.destination}`).join(', ');
            } else if (pickupTrip && pickupTrip.startRoute) {
                pickupTripDetails = `${pickupTrip.startRoute} -> ${pickupTrip.destination}`;
            }

            sheet.addRow({
                date: dateStr,
                vehicleNumber: l.vehicleId ? l.vehicleId.vehicleNumber : '',
                vehicleKm: eicherTrip ? (eicherTrip.totalKm || '') : '',
                munsi: l.munshiId ? `${l.munshiId.firstName} ${l.munshiId.lastName}` : '',
                companyName: l.companyId ? l.companyId.companyName : '',
                location: e.location || '',
                farmerName: e.farmerFirstName ? `${e.farmerFirstName} ${e.farmerLastName}` : '',
                mobileNo: e.farmerMobile || '',
                weight: e.actualWeight !== undefined && e.actualWeight !== null ? e.actualWeight : (p.totalBoxes || l.totalBoxes || ''),
                wastage: p.wastageKg || 0,
                farmerRate: e.purchaseRate || '',
                rate: e.purchaseRate || '',
                remainingBox: remainingBox,
                extraTransport: extraTransport,
                box3Kg: '',
                box3KgStar: box3KgStar || '',
                box5Kg: box5Kg || '',
                box5KgStar: box5KgStar || '',
                box7Kg: box7Kg || '',
                box7KgStar: box7KgStar || '',
                box13Kg: box13Kg || '',
                box13KgStar: box13KgStar || '',
                box13_5Kg: box13_5Kg || '',
                box13_5KgStar: box13_5KgStar || '',
                box14Kg: box14Kg || '',
                box16Kg: box16Kg || '',
                box16KgStar: box16KgStar || '',
                maxBoxType: maxBoxType,
                secondBoxType: secondBoxType,
                thirdBoxType: thirdBoxType,
                fourthBoxType: fourthBoxType,
                box4H: box4H || '',
                box5H: box5H || '',
                box6H: box6H || '',
                box7H: box7Kg || '',
                box8H: box8H || '',
                vehicleOwnerName: l.driverId ? `${l.driverId.firstName} ${l.driverId.lastName}` : '',
                dieselEicher: dieselEicherAmount || '',
                tollEicher: eicherTrip ? (eicherTrip.tollExpense || '') : '',
                company: l.companyId ? l.companyId.companyName : '',
                fieldOwner: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : '',
                fieldSelector: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : '',
                partner: partner,
                pickupTripDetails: pickupTripDetails,
                pickupKm: pickupTrip ? (pickupTrip.totalKm || '') : '',
                pickupNumber: l.pickupDriverId && l.pickupDriverId.vehicleId ? l.pickupDriverId.vehicleId.vehicleNumber : '',
                pickupOwnerName: l.pickupDriverId ? `${l.pickupDriverId.firstName} ${l.pickupDriverId.lastName}` : '',
                dieselPickup: dieselPickupAmount || '',
                tollPickup: pickupTrip ? (pickupTrip.tollExpense || '') : '',
                lineStatus: l.assignmentStatus || '',
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=transport_summary_report.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Transport Summary Report:', error);
        res.status(500).json({ message: 'Server error during report export' });
    }
};

module.exports = {
    getFieldSelectionReport,
    getExecutionDetailedReport,
    getMunshiHarvestingReport,
    exportFieldSelectionReport,
    exportMunshiHarvestingReport,
    exportTransportSummaryReport,
};
