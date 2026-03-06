const Logistics = require('./logistics.model');
const Enquiry = require('../enquiries/enquiry.model');
const User = require('../users/user.model');
const NotificationService = require('../../services/notification.service');

// @desc    Create new logistics assignment
// @route   POST /api/logistics
// @access  Protected (Admin, Operational Manager)
const createAssignment = async (req, res) => {
    try {
        const {
            enquiryId,
            companyId,
            purchaseRate,
            totalBoxes,
            munshiId,
            driverId,
            vehicleId,
            priority,
            lightInTime,
            lightOutTime
        } = req.body;

        // Verify the enquiryId exists
        const enquiry = await Enquiry.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found with the provided ID' });
        }

        // === PHASE 5 GUARD: Enquiry MUST be RATE_FIXED before logistics can be assigned ===
        if (enquiry.status !== 'RATE_FIXED') {
            return res.status(400).json({
                message: `Cannot assign logistics. Enquiry status must be 'RATE_FIXED'. Current status: '${enquiry.status}'`,
            });
        }

        // Set omId to logged-in Operational Manager / Admin
        const omId = req.user._id;

        // Save the logistics assignment document
        const assignment = await Logistics.create({
            enquiryId,
            omId,
            companyId,
            purchaseRate,
            totalBoxes,
            munshiId,
            driverId,
            vehicleId,
            priority,
            lightInTime,
            lightOutTime
        });

        // CRITICAL TRIGGER: Update the original Enquiry document status
        enquiry.status = 'ASSIGNED';
        await enquiry.save();

        if (munshiId) {
            const munshi = await User.findById(munshiId);
            if (munshi && munshi.mobileNo) {
                NotificationService.sendLogisticsAlert(munshi.mobileNo, 'Munshi', `You have been assigned a new packing task. Light-In: ${lightInTime}, Light-Out: ${lightOutTime}.`);
                NotificationService.sendScheduleConfirmed(
                    enquiry.farmerMobile,
                    enquiry.farmerFirstName,
                    `${lightInTime} – ${lightOutTime}`,  // actual scheduled window, not runtime date
                    munshi.firstName,
                    munshi.mobileNo
                );
            }
        }

        if (driverId) {
            const driver = await User.findById(driverId);
            if (driver && driver.mobileNo) {
                NotificationService.sendLogisticsAlert(driver.mobileNo, 'Driver', 'You have a new route assigned.');
            }
        }

        res.status(201).json(assignment);
    } catch (error) {
        console.error('Error creating assignment:', error);

        // Handle MongoDB duplicate key error for unique enquiryId
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A logistics assignment already exists for this Enquiry.' });
        }

        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(400).json({ message: error.message || 'Error creating assignment' });
    }
};

// @desc    Get assignments
// @route   GET /api/logistics
// @access  Protected
const getAssignments = async (req, res) => {
    try {
        const assignments = await Logistics.find()
            .populate('enquiryId')
            .populate('companyId')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('vehicleId', 'vehicleNumber');

        res.status(200).json(assignments);
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ message: 'Server error while fetching assignments' });
    }
};

const getAssignmentById = async (req, res) => {
    try {
        const assignment = await Logistics.findById(req.params.id)
            .populate('enquiryId companyId')
            .populate('munshiId driverId', 'firstName lastName mobileNo')
            .populate('vehicleId');

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }
        res.status(200).json(assignment);
    } catch (error) {
        console.error('Error fetching assignment by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching assignment' });
    }
};

module.exports = {
    createAssignment,
    getAssignments,
    getAssignmentById,
};
