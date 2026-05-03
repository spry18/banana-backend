const PetrolAdvance = require('./petrolAdvance.model');
const User = require('../users/user.model');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');
const mongoose = require('mongoose');

// @desc    Issue a petrol advance to a field selector
// @route   POST /api/petrol-advance
// @access  Protected (Admin, Operational Manager, Field Owner)
const createAdvance = async (req, res) => {
    try {
        const { fieldSelectorId, vehicleNumber, amount, remark } = req.body;

        if (!fieldSelectorId || !amount) {
            return res.status(400).json({ message: 'fieldSelectorId and amount are required' });
        }

        // Validate the field selector exists and is a Field Selector role
        const fieldSelector = await User.findById(fieldSelectorId);
        if (!fieldSelector) {
            return res.status(404).json({ message: 'Field Selector not found with the provided ID' });
        }
        
        const roleNormalized = (fieldSelector.role || '').toLowerCase();
        if (roleNormalized !== 'field selector') {
            return res.status(400).json({ message: 'The provided user is not a Field Selector role' });
        }

        // Handle optional receipt photo upload
        const receiptPhotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const advance = await PetrolAdvance.create({
            omId: req.user._id,
            fieldSelectorId,
            vehicleNumber: vehicleNumber || null,
            amount,
            remark: remark || '',
            receiptPhotoUrl,
        });

        // Send WhatsApp notification to the field selector
        if (fieldSelector.mobileNo) {
            NotificationService.sendPetrolAdvanceReceipt(
                fieldSelector.mobileNo,
                fieldSelector.firstName,
                amount,
                vehicleNumber
            );
        }

        await logSystemAction(
            req.user._id,
            'CREATE',
            'PetrolAdvance',
            advance._id,
            `Issued petrol advance of ₹${amount} to field selector ${fieldSelector.firstName} ${fieldSelector.lastName}`
        );

        res.status(201).json(advance);
    } catch (error) {
        console.error('Error creating petrol advance:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: error.message || 'Server error while creating petrol advance' });
    }
};

// @desc    Get petrol advance history (paginated, filterable by fieldSelectorId)
// @route   GET /api/petrol-advance
// @access  Protected (Admin, Operational Manager, Field Owner, Field Selector)
const getAdvanceHistory = async (req, res) => {
    try {
        const { page = 1, limit = 20, fieldSelectorId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = {};
        
        // If the user requesting is a field selector, restrict to their own ID
        if (req.user.role === 'Field Selector') {
            query.fieldSelectorId = req.user._id;
        } else if (fieldSelectorId) {
            query.fieldSelectorId = fieldSelectorId;
        }

        const [advances, total] = await Promise.all([
            PetrolAdvance.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate({ path: 'fieldSelectorId', select: 'firstName lastName mobileNo role' })
                .populate('omId', 'firstName lastName')
                .lean(),
            PetrolAdvance.countDocuments(query),
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: advances,
        });
    } catch (error) {
        console.error('Error fetching petrol advance history:', error);
        res.status(500).json({ message: 'Server error while fetching petrol advances' });
    }
};

// @desc    Get petrol advance distribution — day / month / year wise + per field-selector breakdown
// @route   GET /api/petrol-advance/distribution
// @access  Protected (Admin, Operational Manager)
const getDistribution = async (req, res) => {
    try {
        const { groupBy = 'month', fieldSelectorId } = req.query;

        const matchStage = {};
        if (fieldSelectorId) {
            matchStage.fieldSelectorId = new mongoose.Types.ObjectId(fieldSelectorId);
        }

        // ── Date grouping expression ──────────────────────────────────────
        let groupId;
        let labelFormat;
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
        const timeSeriesRaw = await PetrolAdvance.aggregate([
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

        // ── 2. Per field-selector breakdown ──────────────────────────────
        const perSelectorRaw = await PetrolAdvance.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$fieldSelectorId',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
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
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    totalAmount: 1,
                    count: 1,
                    selectorName: { 
                        $concat: [
                            { $ifNull: ['$user.firstName', 'Unknown'] }, 
                            ' ', 
                            { $ifNull: ['$user.lastName', 'User'] }
                        ] 
                    },
                    mobile: '$user.mobileNo',
                },
            },
            { $sort: { totalAmount: -1 } },
        ]);

        res.json({
            groupBy,
            timeSeries,
            perSelector: perSelectorRaw,
        });
    } catch (error) {
        console.error('Error fetching petrol advance distribution:', error);
        try {
            require('fs').appendFileSync('c:/Users/Vaibhav/Desktop/Banana Import Expoort/backend-error.log', `PETROL ERROR: ${error.stack}\n`);
        } catch (e) {}
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching petrol advance distribution', error: error.message });
    }
};

module.exports = {
    createAdvance,
    getAdvanceHistory,
    getDistribution,
};
