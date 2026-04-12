const DieselAdvance = require('./dieselAdvance.model');
const User = require('../users/user.model');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');

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

module.exports = {
    createAdvance,
    getAdvanceHistory,
};
