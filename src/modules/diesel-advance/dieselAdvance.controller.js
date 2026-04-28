const DieselAdvance = require('./dieselAdvance.model');
const User = require('../users/user.model');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');
const mongoose = require('mongoose');

// @desc    Issue a diesel advance to a driver
// @route   POST /api/diesel-advance
// @access  Protected (Admin, Operational Manager)
const createAdvance = async (req, res) => {
    try {
        const { driverId, assignmentId, vehicleNumber: bodyVehicleNumber, amount, remark } = req.body;

        if (!driverId || !amount) {
            return res.status(400).json({ message: 'driverId and amount are required' });
        }

        // Validate the driver exists and is a driver role
        const driver = await User.findById(driverId).populate('vehicleId', 'vehicleNumber vehicleType');
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found with the provided ID' });
        }
        const roleNormalized = (driver.role || '').toLowerCase();
        if (!roleNormalized.includes('driver')) {
            return res.status(400).json({ message: 'The provided user is not a Driver role' });
        }

        // Auto-resolve vehicleNumber from the driver's linked vehicle; allow body override for edge cases
        const vehicleNumber = bodyVehicleNumber || driver.vehicleId?.vehicleNumber || null;
        if (!vehicleNumber) {
            return res.status(400).json({
                message: 'No vehicle linked to this driver. Please assign a vehicle first or provide vehicleNumber in the request body.',
            });
        }

        // Handle optional receipt photo upload
        const receiptPhotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const advance = await DieselAdvance.create({
            omId: req.user._id,
            driverId,
            assignmentId: assignmentId || null,
            vehicleNumber,
            amount,
            remark: remark || '',
            receiptPhotoUrl,
        });

        // Send WhatsApp notification to the driver
        if (driver.mobileNo) {
            NotificationService.sendDieselAdvanceReceipt(
                driver.mobileNo,
                driver.firstName,
                amount,
                vehicleNumber
            );
        }

        await logSystemAction(
            req.user._id,
            'CREATE',
            'DieselAdvance',
            advance._id,
            `Issued diesel advance of ₹${amount} to driver ${driver.firstName} ${driver.lastName} for vehicle ${vehicleNumber}`
        );

        res.status(201).json(advance);
    } catch (error) {
        console.error('Error creating diesel advance:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: error.message || 'Server error while creating diesel advance' });
    }
};

// @desc    Get diesel advance history (paginated, filterable by driverId)
// @route   GET /api/diesel-advance
// @access  Protected (Admin, Operational Manager, Field Owner, Field Selector, driver)
const getAdvanceHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, driverId, assignmentId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = {};
        
        // If the user requesting is a driver or field selector, restrict to their own ID
        if (['driver eicher', 'driver pickup', 'Field Selector'].includes(req.user.role)) {
            query.driverId = req.user._id;
        } else if (driverId) {
            query.driverId = driverId;
        }

        if (assignmentId) query.assignmentId = assignmentId;

        const [advances, total] = await Promise.all([
            DieselAdvance.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('omId', 'firstName lastName')
                .populate('assignmentId', 'enquiryId lightInTime lightOutTime')
                .lean(),
            DieselAdvance.countDocuments(query),
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: advances,
        });
    } catch (error) {
        console.error('Error fetching diesel advance history:', error);
        res.status(500).json({ message: 'Server error while fetching diesel advances' });
    }
};

// @desc    Get diesel advance distribution — day / month / year wise + per-driver breakdown
// @route   GET /api/diesel-advance/distribution
// @access  Protected (Admin, Operational Manager)
const getDistribution = async (req, res) => {
    try {
        const { groupBy = 'month', driverId } = req.query;

        const matchStage = {};
        if (driverId) {
            matchStage.driverId = new mongoose.Types.ObjectId(driverId);
        }

        // ── Date grouping expression ──────────────────────────────────────
        let groupId;
        const now = new Date();

        if (groupBy === 'day') {
            // Last 30 days
            matchStage.createdAt = { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) };
            groupId = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
                day: { $dayOfMonth: '$createdAt' },
            };
        } else if (groupBy === 'year') {
            groupId = { year: { $year: '$createdAt' } };
        } else {
            // Default: month — last 12 months
            matchStage.createdAt = { $gte: new Date(new Date().setMonth(now.getMonth() - 11)) };
            groupId = {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' },
            };
        }

        // ── 1. Time-series aggregation ────────────────────────────────────
        const timeSeriesRaw = await DieselAdvance.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: groupId,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
        ]);

        // Build readable labels
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const timeSeries = timeSeriesRaw.map(r => {
            let label;
            if (groupBy === 'day') {
                label = `${r._id.day} ${MONTHS[r._id.month - 1]} ${r._id.year}`;
            } else if (groupBy === 'year') {
                label = `${r._id.year}`;
            } else {
                label = `${MONTHS[r._id.month - 1]} ${r._id.year}`;
            }
            return { label, totalAmount: r.totalAmount, count: r.count };
        });

        // ── 2. Per-driver breakdown ───────────────────────────────────────
        const perDriverRaw = await DieselAdvance.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$driverId',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    vehicleNumbers: { $addToSet: '$vehicleNumber' },
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
            { $unwind: { path: '$user', preserveNullAndEmpty: true } },
            {
                $project: {
                    _id: 1,
                    totalAmount: 1,
                    count: 1,
                    vehicleNumbers: 1,
                    driverName: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
                    mobile: '$user.mobileNo',
                    role: '$user.role',
                },
            },
            { $sort: { totalAmount: -1 } },
        ]);

        res.json({
            groupBy,
            timeSeries,
            perDriver: perDriverRaw,
        });
    } catch (error) {
        console.error('Error fetching diesel advance distribution:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching diesel advance distribution' });
    }
};

module.exports = {
    createAdvance,
    getAdvanceHistory,
    getDistribution,
};
