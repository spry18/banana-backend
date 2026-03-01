const Enquiry = require('../enquiries/enquiry.model');
const Packing = require('../execution/packing.model');
const Logistics = require('../logistics/logistics.model');
const ExcelJS = require('exceljs');

// @desc    Master analytics report
// @route   GET /api/analytics/master-report
// @access  Private (Admin)
const masterReport = async (req, res) => {
    try {
        const { location, companyId, startDate, endDate } = req.query;

        // Build match stage for date filtering
        const matchStage = { status: 'COMPLETED' };
        if (location) matchStage.location = location;
        if (companyId) matchStage.companyId = new (require('mongoose').Types.ObjectId)(companyId);
        if (startDate || endDate) {
            matchStage.createdAt = {};
            if (startDate) matchStage.createdAt.$gte = new Date(startDate);
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
        }

        // 1. Revenue & Rate grouped by Location
        const byLocation = await Enquiry.aggregate([
            { $match: { ...matchStage, purchaseRate: { $exists: true } } },
            {
                $group: {
                    _id: '$location',
                    totalPlots: { $sum: 1 },
                    totalRevenue: { $sum: '$purchaseRate' },
                    avgRate: { $avg: '$purchaseRate' },
                    minRate: { $min: '$purchaseRate' },
                    maxRate: { $max: '$purchaseRate' },
                },
            },
            { $sort: { totalRevenue: -1 } },
        ]);

        // 2. Revenue grouped by Company
        const byCompany = await Enquiry.aggregate([
            { $match: { ...matchStage, companyId: { $exists: true } } },
            {
                $group: {
                    _id: '$companyId',
                    totalPlots: { $sum: 1 },
                    totalRevenue: { $sum: '$purchaseRate' },
                    avgRate: { $avg: '$purchaseRate' },
                },
            },
            {
                $lookup: {
                    from: 'companies',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'company',
                },
            },
            { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    companyName: '$company.companyName',
                    totalPlots: 1,
                    totalRevenue: 1,
                    avgRate: 1,
                },
            },
            { $sort: { totalRevenue: -1 } },
        ]);

        // 3. Wastage stats from Packing
        const wastageStats = await Packing.aggregate([
            {
                $group: {
                    _id: null,
                    totalBoxes: { $sum: '$totalBoxes' },
                    totalWastageKg: { $sum: '$wastageKg' },
                    packingRecords: { $sum: 1 },
                },
            },
        ]);

        // 4. Overall totals
        const totals = await Enquiry.aggregate([
            { $match: { ...matchStage, purchaseRate: { $exists: true } } },
            {
                $group: {
                    _id: null,
                    totalEnquiries: { $sum: 1 },
                    totalRevenue: { $sum: '$purchaseRate' },
                    avgRate: { $avg: '$purchaseRate' },
                },
            },
        ]);

        const wastage = wastageStats[0] || { totalBoxes: 0, totalWastageKg: 0, packingRecords: 0 };
        const totalBoxes = wastage.totalBoxes || 1; // prevent division by zero
        const wastagePercent = ((wastage.totalWastageKg / (totalBoxes * 14)) * 100).toFixed(2); // approx 14kg per box

        res.json({
            summary: totals[0] || { totalEnquiries: 0, totalRevenue: 0, avgRate: 0 },
            wastage: {
                totalWastageKg: wastage.totalWastageKg,
                totalBoxes: wastage.totalBoxes,
                wastagePercent: `${wastagePercent}%`,
            },
            byLocation,
            byCompany,
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ message: 'Server error while generating report', error: error.message });
    }
};

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
            if (endDate) matchStage.createdAt.$lte = new Date(endDate);
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

        // Style the header row
        sheet.columns = [
            { header: 'Enquiry ID', key: 'enquiryId', width: 20 },
            { header: 'Farmer Name', key: 'farmerName', width: 25 },
            { header: 'Location', key: 'location', width: 20 },
            { header: 'Sub-Location', key: 'subLocation', width: 20 },
            { header: 'Company', key: 'company', width: 25 },
            { header: 'Purchase Rate (₹)', key: 'purchaseRate', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Date', key: 'date', width: 20 },
        ];

        // Bold yellow header
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' },
        };

        enquiries.forEach((e) => {
            sheet.addRow({
                enquiryId: e.enquiryId,
                farmerName: `${e.farmerFirstName} ${e.farmerLastName}`,
                location: e.location,
                subLocation: e.subLocation || '-',
                company: e.companyId?.companyName || 'N/A',
                purchaseRate: e.purchaseRate,
                status: e.status,
                date: e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-IN') : '-',
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

module.exports = { masterReport, exportReport };
