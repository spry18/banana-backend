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
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);

        // ── 1. Calculate Stats ──
        // totalBoxes, totalWastage, lineRejected come from Packing
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

        // totalRejected from Enquiry
        const totalRejected = await Enquiry.countDocuments({ status: 'REJECTED' });

        // totalTrips from Logistics
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

        // We find Enquiries matching the filters first
        if (search) {
            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
            ];
        }

        const enquiries = await Enquiry.find(query)
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('assignedSelectorId', 'firstName lastName')
            .populate('companyId', 'companyName')
            .lean();

        const enquiryIds = enquiries.map(e => e._id);

        // Find Inspections for these Enquiries
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

        const tableData = inspections.map(ins => {
            const e = enquiryMap[ins.enquiryId.toString()] || {};
            return {
                date: ins.createdAt,
                farmerName: e.farmerFirstName ? `${e.farmerFirstName} ${e.farmerLastName}` : 'Unknown',
                mobileNumber: e.farmerMobile || 'N/A',
                location: e.location || 'N/A',
                rate: e.purchaseRate || null,
                fieldOwner: e.fieldOwnerId ? `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}` : null,
                fieldSelector: e.assignedSelectorId ? `${e.assignedSelectorId.firstName} ${e.assignedSelectorId.lastName}` : null,
                company: e.companyId ? e.companyId.companyName : null,
                weight: e.estimatedBoxes || e.plantCount || 0, // Fallback for "weight"
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
            Enquiry.countDocuments({ status: { $in: ['SELECTED', 'RATE_FIXED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] } }),
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
                .populate('enquiryId', 'farmerMobile location')
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

module.exports = {
    getFieldSelectionReport,
    getExecutionDetailedReport,
    getMunshiHarvestingReport,
};
