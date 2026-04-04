const Logistics = require('./logistics.model');
const Enquiry = require('../enquiries/enquiry.model');
const User = require('../users/user.model');
const NotificationService = require('../../services/notification.service');

// @desc    Create new logistics assignment
// @route   POST /api/logistics/assign
// @access  Protected (Admin, Operational Manager)
const createAssignment = async (req, res) => {
    try {
        const {
            enquiryId,
            companyId,
            purchaseRate,
            packingType,
            totalBoxes,
            munshiId,
            driverId,
            priority,
            lightInTime,
            lightOutTime,
            teamName,
        } = req.body;

        // Verify the enquiryId exists
        const enquiry = await Enquiry.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found with the provided ID' });
        }

        // === GUARD: Enquiry MUST be RATE_FIXED before logistics can be assigned ===
        if (enquiry.status !== 'RATE_FIXED') {
            return res.status(400).json({
                message: `Cannot assign logistics. Enquiry status must be 'RATE_FIXED'. Current status: '${enquiry.status}'`,
            });
        }

        // === AUTO-RESOLVE vehicleId from the Driver's user profile ===
        // We never trust vehicleId/vehicleNumber from the payload directly.
        // The driver always carries their own vehicle — pull it from the User document.
        if (!driverId) {
            return res.status(400).json({ message: 'driverId is required to auto-resolve vehicle.' });
        }
        const driver = await User.findById(driverId).populate('vehicleId', 'vehicleNumber vehicleType');
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found with the provided driverId.' });
        }
        if (!driver.vehicleId) {
            return res.status(400).json({
                message: `Driver "${driver.firstName} ${driver.lastName}" has no vehicle linked to their profile. Please link a vehicle first.`,
            });
        }
        const resolvedVehicleId = driver.vehicleId._id;

        // === ENQUIRY OVERRIDE: OM can update planning fields on the Enquiry before finalising ===
        // This keeps the Enquiry as the single source of truth for planning data.
        const enquiryUpdates = {};
        if (companyId)    enquiryUpdates.companyId    = companyId;
        if (packingType)  enquiryUpdates.packingType  = packingType;
        if (totalBoxes)   enquiryUpdates.estimatedBoxes = totalBoxes;

        if (Object.keys(enquiryUpdates).length > 0) {
            Object.assign(enquiry, enquiryUpdates);
        }

        // Set omId to logged-in Operational Manager / Admin
        const omId = req.user._id;

        // Create the logistics assignment document
        const assignment = await Logistics.create({
            enquiryId,
            omId,
            companyId:   companyId   || enquiry.companyId,
            purchaseRate,
            totalBoxes,
            munshiId,
            driverId,
            vehicleId:   resolvedVehicleId,
            priority,
            lightInTime,
            lightOutTime,
            teamName:    teamName    || null,
        });

        // Update Enquiry status to ASSIGNED (and persist any planning overrides)
        enquiry.status = 'ASSIGNED';
        await enquiry.save();

        // === NOTIFICATIONS ===
        if (munshiId) {
            const munshi = await User.findById(munshiId);
            if (munshi?.mobileNo) {
                const timeWindow = lightInTime && lightOutTime ? `${lightInTime} – ${lightOutTime}` : 'TBD';
                NotificationService.sendLogisticsAlert(munshi.mobileNo, 'Munshi', `You have been assigned a new packing task. Time window: ${timeWindow}.`);
                NotificationService.sendScheduleConfirmed(
                    enquiry.farmerMobile,
                    enquiry.farmerFirstName,
                    timeWindow,
                    munshi.firstName,
                    munshi.mobileNo
                );
            }
        }

        if (driver?.mobileNo) {
            NotificationService.sendLogisticsAlert(driver.mobileNo, 'Driver', 'You have a new route assigned.');
        }

        res.status(201).json(assignment);
    } catch (error) {
        console.error('Error creating assignment:', error);

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
            .populate({
                path: 'enquiryId',
                populate: [
                    { path: 'fieldOwnerId', select: 'firstName lastName mobileNo role' },
                    { path: 'assignedSelectorId', select: 'firstName lastName mobileNo role' },
                ],
            })
            .populate('companyId')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
            .populate('vehicleId', 'vehicleNumber vehicleType');

        res.status(200).json(assignments);
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ message: 'Server error while fetching assignments' });
    }
};

const getAssignmentById = async (req, res) => {
    try {
        const assignment = await Logistics.findById(req.params.id)
            .populate({
                path: 'enquiryId',
                populate: [
                    { path: 'fieldOwnerId', select: 'firstName lastName mobileNo role' },
                    { path: 'assignedSelectorId', select: 'firstName lastName mobileNo role' },
                ],
            })
            .populate('companyId')
            .populate({ path: 'munshiId', select: 'firstName lastName mobileNo' })
            .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
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
