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
            assignmentStatus: 'PENDING',   // Driver has not yet started — becomes IN_PROGRESS on first transitStatus update
        });

        // Advance enquiry: RATE_FIXED → ASSIGNED (awaiting driver dispatch)
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

// @desc    Get a single assignment by ID
// @route   GET /api/logistics/:id
// @access  Protected
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

// @desc    Add an extra vehicle to an existing assignment (overflow)
// @route   POST /api/logistics/:id/add-vehicle
// @access  Protected (Admin, Operational Manager, Munshi)
const addExtraVehicle = async (req, res) => {
    try {
        const {
            driverId,
            munshiId,
            companyId,
            purchaseRate,
            totalBoxes,
            priority,
            lightInTime,
            lightOutTime,
            teamName,
            scheduledDate,
        } = req.body;

        // 1. Validate original assignment
        const original = await Logistics.findById(req.params.id)
            .populate('enquiryId', 'farmerFirstName farmerLastName location')
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('vehicleId', 'vehicleNumber vehicleType');

        if (!original) {
            return res.status(404).json({ message: 'Original assignment not found' });
        }

        if (['COMPLETED', 'CANCELLED', 'APPROVED'].includes(original.assignmentStatus)) {
            return res.status(400).json({
                message: `Cannot add extra vehicle to a ${original.assignmentStatus} assignment`,
            });
        }

        // 2. Validate new driver and resolve their vehicle
        if (!driverId) {
            return res.status(400).json({ message: 'driverId is required for the extra vehicle' });
        }

        const driver = await User.findById(driverId).populate('vehicleId', 'vehicleNumber vehicleType');
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found with the provided driverId' });
        }
        if (!driver.vehicleId) {
            return res.status(400).json({
                message: `Driver "${driver.firstName} ${driver.lastName}" has no vehicle linked. Please link a vehicle first.`,
            });
        }

        // 3. Guard: don't add the same driver that's already on the original
        if (original.driverId && original.driverId._id.toString() === driverId) {
            return res.status(400).json({ message: 'Extra vehicle driver cannot be the same as the original driver' });
        }

        // 4. Resolve Munshi — use provided munshiId or fall back to original
        let resolvedMunshiId = original.munshiId?._id || original.munshiId;
        let resolvedMunshi = original.munshiId; // populated object for notifications
        if (munshiId && munshiId !== resolvedMunshiId?.toString()) {
            const munshi = await User.findById(munshiId);
            if (!munshi) {
                return res.status(404).json({ message: 'Munshi not found with the provided munshiId' });
            }
            resolvedMunshiId = munshi._id;
            resolvedMunshi = munshi;
        }

        // 5. Create the overflow assignment — use provided values or fall back to original
        const overflow = await Logistics.create({
            enquiryId:          original.enquiryId._id || original.enquiryId,
            omId:               original.omId,
            companyId:          companyId       || original.companyId,
            purchaseRate:       purchaseRate    ?? original.purchaseRate,
            totalBoxes:         totalBoxes      ?? original.totalBoxes,
            munshiId:           resolvedMunshiId,
            driverId:           driverId,
            vehicleId:          driver.vehicleId._id,
            priority:           priority        || original.priority,
            lightInTime:        lightInTime     ?? original.lightInTime,
            lightOutTime:       lightOutTime    ?? original.lightOutTime,
            scheduledDate:      scheduledDate   ? new Date(scheduledDate) : original.scheduledDate,
            teamName:           teamName        ?? original.teamName,
            assignmentStatus:   'PENDING',
            isOverflow:         true,
            parentAssignmentId: original._id,
        });

        // 6. WhatsApp Notifications
        const farmLocation = original.enquiryId?.location || 'the farm';
        const extraVehicleNumber = driver.vehicleId.vehicleNumber;

        // Notify the new extra driver
        if (driver.mobileNo) {
            NotificationService.sendExtraVehicleAlert(
                driver.mobileNo,
                `${driver.firstName} ${driver.lastName}`,
                extraVehicleNumber,
                farmLocation
            );
        }

        // Notify the assigned Munshi (could be different from original)
        if (resolvedMunshi?.mobileNo) {
            NotificationService.sendExtraVehicleNotifyMunshi(
                resolvedMunshi.mobileNo,
                `${resolvedMunshi.firstName} ${resolvedMunshi.lastName}`,
                extraVehicleNumber,
                `${driver.firstName} ${driver.lastName}`
            );
        }

        // Notify the original driver
        if (original.driverId?.mobileNo) {
            NotificationService.sendExtraVehicleNotifyOriginalDriver(
                original.driverId.mobileNo,
                `${original.driverId.firstName} ${original.driverId.lastName}`,
                extraVehicleNumber
            );
        }

        // 7. Populate and return
        const populated = await Logistics.findById(overflow._id)
            .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location')
            .populate('companyId', 'companyName')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
            .populate('vehicleId', 'vehicleNumber vehicleType');

        res.status(201).json({
            message: 'Extra vehicle added successfully. All parties have been notified.',
            overflow: populated,
        });
    } catch (error) {
        console.error('Error adding extra vehicle:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: error.message || 'Server error while adding extra vehicle' });
    }
};

// @desc    Get all related assignments for a given assignment (original + rollovers + overflows)
// @route   GET /api/logistics/:id/related
// @access  Protected (Admin, Operational Manager, Munshi)
const getRelatedAssignments = async (req, res) => {
    try {
        const assignment = await Logistics.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Find the root (original) assignment — walk up parentAssignmentId chain
        let rootId = assignment._id;
        if (assignment.parentAssignmentId) {
            // Try to find the top-level parent
            let parent = await Logistics.findById(assignment.parentAssignmentId);
            while (parent && parent.parentAssignmentId) {
                parent = await Logistics.findById(parent.parentAssignmentId);
            }
            if (parent) rootId = parent._id;
        }

        const populateFields = [
            { path: 'enquiryId', select: 'enquiryId farmerFirstName farmerLastName location' },
            { path: 'companyId', select: 'companyName' },
            { path: 'munshiId', select: 'firstName lastName mobileNo' },
            { path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } },
            { path: 'vehicleId', select: 'vehicleNumber vehicleType' },
        ];

        // Fetch the original
        const original = await Logistics.findById(rootId).populate(populateFields).lean();

        // Fetch all children (rollovers + overflows) linked to this root
        const children = await Logistics.find({ parentAssignmentId: rootId })
            .populate(populateFields)
            .sort({ createdAt: 1 })
            .lean();

        // Also fetch grandchildren (rollovers of overflows, etc.)
        const childIds = children.map(c => c._id);
        const grandchildren = childIds.length > 0
            ? await Logistics.find({ parentAssignmentId: { $in: childIds } })
                .populate(populateFields)
                .sort({ createdAt: 1 })
                .lean()
            : [];

        const allRelated = [...children, ...grandchildren];
        const rollovers = allRelated.filter(r => r.isRollover);
        const overflows = allRelated.filter(r => r.isOverflow);

        res.status(200).json({
            original,
            rollovers,
            overflows,
            totalRelated: allRelated.length,
        });
    } catch (error) {
        console.error('Error fetching related assignments:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching related assignments' });
    }
};

module.exports = {
    createAssignment,
    getAssignments,
    getAssignmentById,
    addExtraVehicle,
    getRelatedAssignments,
};
