const Enquiry = require('./enquiry.model');
const User = require('../users/user.model');
const Agent = require('../master-data/agent.model'); // Ensure Agent model exists and is imported correctly, will verify after
const { logSystemAction } = require('../../utils/auditLogger');
const NotificationService = require('../../services/notification.service');
const { checkAndResetExpiredEnquiries } = require('../../utils/enquiryService');

// @desc    Create new enquiry
// @route   POST /api/enquiries
// @access  Protected
const createEnquiry = async (req, res) => {
    try {
        const {
            farmerFirstName,
            farmerLastName,
            farmerMobile,
            location,
            subLocation,
            plantCount,
            generation,
            agentId,
            agentAttached,
            visitPriority,
            assignedSelectorId,
        } = req.body;

        if (!assignedSelectorId) {
            return res.status(400).json({ message: 'assignedSelectorId is required' });
        }

        const selector = await User.findById(assignedSelectorId);
        if (!selector) {
            return res.status(404).json({ message: 'Assigned Selector not found with the provided ID' });
        }

        if (agentId) {
            const agent = await Agent.findById(agentId);
            if (!agent) {
                return res.status(404).json({ message: 'Agent not found with the provided ID' });
            }
        }

        // Automatically generate an enquiryId
        const enquiryId = `ENQ-${Date.now()}`;

        // Set fieldOwnerId to logged-in user
        const fieldOwnerId = req.user._id;

        // Calculate editableUntil (exactly 24 hours from current time)
        const editableUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const enquiry = await Enquiry.create({
            enquiryId,
            farmerFirstName,
            farmerLastName,
            farmerMobile,
            location,
            subLocation,
            plantCount,
            generation,
            agentId,
            agentAttached: agentAttached ?? false,
            visitPriority: visitPriority || 'Medium',
            fieldOwnerId,
            assignedSelectorId,
            editableUntil,
        });

        NotificationService.sendEnquiryReceived(enquiry.farmerMobile, enquiry.farmerFirstName, enquiry.enquiryId);

        await logSystemAction(req.user._id, 'CREATE', 'Enquiries', enquiry._id, 'Created a new farmer enquiry');

        res.status(201).json(enquiry);
    } catch (error) {
        console.error('Error creating enquiry:', error);
        res.status(400).json({ message: error.message || 'Error creating enquiry' });
    }
};

// @desc    Get enquiries
// @route   GET /api/enquiries
// @access  Protected
const getEnquiries = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, location } = req.query;
        const skip = (page - 1) * limit;

        let query = {};

        if (req.user.role === 'Admin' || req.user.role === 'Field Owner') {
            // Admin and Field Owner (Global Shared Pool) see all enquiries
            query = {};
        } else {
            // Other roles: deny access
            query = { _id: null };
        }

        if (status) {
            if (status === 'Missed') {
                // 'Missed' = past scheduledDate but still PENDING (never visited)
                query.scheduledDate = { $lt: new Date() };
                query.status = 'PENDING';
            } else {
                query.status = status;
            }
        }

        if (location) {
            query.location = location;
        }

        if (search) {
            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
                { enquiryId: { $regex: search, $options: 'i' } }
            ];
        }

        const enquiries = await Enquiry.find(query)
            .skip(skip)
            .limit(Number(limit))
            .sort({ createdAt: -1 })
            .populate('assignedSelectorId', 'firstName lastName mobileNo')
            .populate('agentId', 'name')
            .populate('generation', 'name');

        const total = await Enquiry.countDocuments(query);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: enquiries
        });
    } catch (error) {
        console.error('Error fetching enquiries:', error);
        res.status(500).json({ message: 'Server error while fetching enquiries' });
    }
};

// @desc    Update enquiry
// @route   PUT /api/enquiries/:id
// @access  Protected (Admin, Field Owner)
const updateEnquiry = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // Check if editable window has expired
        if (new Date() > enquiry.editableUntil) {
            return res.status(403).json({ message: 'Edit window of 24 hours has expired.' });
        }

        // If updating selector or agent, validate their existence
        if (req.body.assignedSelectorId) {
            const selector = await User.findById(req.body.assignedSelectorId);
            if (!selector) {
                return res.status(404).json({ message: 'Assigned Selector not found with the provided ID' });
            }
        }

        if (req.body.agentId) {
            const agent = await Agent.findById(req.body.agentId);
            if (!agent) {
                return res.status(404).json({ message: 'Agent not found with the provided ID' });
            }
        }

        // We should ensure we don't accidentally overwrite system-controlled fields if not allowed, 
        // but simple req.body is what was implicitly requested. We can prevent updating enquiryId, etc.
        const updateData = { ...req.body };
        delete updateData.enquiryId;
        delete updateData.fieldOwnerId; // Usually shouldn't change the creator implicitly

        // If a new selector is being assigned, automatically set the status to 'ASSIGNED'
        if (updateData.assignedSelectorId && updateData.assignedSelectorId !== enquiry.assignedSelectorId?.toString()) {
            updateData.status = 'ASSIGNED';
        }

        // However, standard Mongoose findByIdAndUpdate uses req.body directly
        const updatedEnquiry = await Enquiry.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        // Commercial Rejection Notification
        if (req.body.status && (req.body.status === 'CLOSED' || req.body.status === 'CANCELLED') && enquiry.status !== req.body.status) {
            NotificationService.sendDealCancelled(updatedEnquiry.farmerMobile, updatedEnquiry.farmerFirstName);
        }

        res.status(200).json(updatedEnquiry);
    } catch (error) {
        console.error('Error updating enquiry:', error);

        // Mongoose CastError for invalid ObjectIDs
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }

        res.status(500).json({ message: error.message || 'Internal server error while updating enquiry' });
    }
};

// @desc    Get a single enquiry by ID with full details (for plot detail view)
// @route   GET /api/enquiries/:id
// @access  Protected (Admin, Field Owner, Operational Manager)
const getEnquiryById = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id)
            .populate('generation', 'name description')
            .populate('agentId', 'agentName mobileNo location')
            .populate('fieldOwnerId', 'firstName lastName mobileNo')
            .populate('assignedSelectorId', 'firstName lastName mobileNo')
            .populate('companyId', 'companyName legalName headquarters');

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // Global Shared Pool: Field Owners can view all enquiries — no ownership guard needed

        // Join the inspection record for this enquiry (photos + composition data)
        const Inspection = require('../inspections/inspection.model');
        const inspection = await Inspection.findOne({ enquiryId: enquiry._id })
            .populate('selectorId', 'firstName lastName mobileNo')
            .lean();

        res.status(200).json({
            ...enquiry.toObject(),
            inspection: inspection || null,
        });
    } catch (error) {
        console.error('Error fetching enquiry by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching enquiry' });
    }
};

// @desc    Admin reschedules a missed inspection
// @route   PATCH /api/enquiries/reschedule/:id
// @access  Private (Admin)
const rescheduleEnquiry = async (req, res) => {
    try {
        const { scheduledDate, scheduledTime } = req.body;

        if (!scheduledDate) {
            return res.status(400).json({ message: 'scheduledDate is required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (!['PENDING', 'SELECTED'].includes(enquiry.status)) {
            return res.status(400).json({
                message: `Cannot reschedule an enquiry with status '${enquiry.status}'`,
            });
        }

        const before = { scheduledDate: enquiry.scheduledDate, scheduledTime: enquiry.scheduledTime };
        enquiry.scheduledDate = new Date(scheduledDate);
        enquiry.scheduledTime = scheduledTime || null;
        await enquiry.save();

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Admin rescheduled inspection for Enquiry ${enquiry.enquiryId}`,
            before,
            { scheduledDate: enquiry.scheduledDate, scheduledTime: enquiry.scheduledTime }
        );

        res.json({ message: 'Inspection rescheduled successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Admin / Field Owner fixes the purchase rate for a selected plot
// @route   PATCH /api/enquiries/fix-rate/:id
// @access  Private (Admin, Field Owner)
const fixRate = async (req, res) => {
    try {
        const { companyId, purchaseRate, packingType, estimatedBoxes, remarks } = req.body;

        if (!companyId || !purchaseRate) {
            return res.status(400).json({ message: 'companyId and purchaseRate are required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // Global Shared Pool: any Field Owner can fix the rate on any enquiry — no ownership guard

        if (enquiry.status !== 'SELECTED') {
            return res.status(400).json({
                message: `Rate can only be fixed for enquiries with status 'SELECTED'. Current status: '${enquiry.status}'`,
            });
        }

        // Validate company exists
        const Company = require('../master-data/company.model');
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ message: 'Company not found with the provided ID' });
        }

        const before = {
            companyId: enquiry.companyId,
            purchaseRate: enquiry.purchaseRate,
            packingType: enquiry.packingType,
            estimatedBoxes: enquiry.estimatedBoxes,
            status: enquiry.status,
        };

        enquiry.companyId      = companyId;
        enquiry.purchaseRate   = purchaseRate;
        enquiry.remarks        = remarks || '';
        enquiry.status         = 'RATE_FIXED';
        // Record which FO actually closed the deal (Global Shared Pool model)
        enquiry.rateFixedBy    = req.user._id;

        // Optional planning fields — set if provided, leave existing value if not
        if (packingType)    enquiry.packingType    = packingType;
        if (estimatedBoxes) enquiry.estimatedBoxes = estimatedBoxes;

        await enquiry.save();

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Rate fixed at ₹${purchaseRate} for Enquiry ${enquiry.enquiryId}`,
            before,
            { companyId, purchaseRate, packingType, estimatedBoxes, status: 'RATE_FIXED' }
        );

        res.json({ message: 'Rate fixed successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Field Owner reschedules a SELECTED enquiry
// @route   PUT /api/enquiries/:id/reschedule
// @access  Protected (Field Owner, Admin)
const foRescheduleEnquiry = async (req, res) => {
    try {
        const { rescheduleDate, reason } = req.body;

        if (!rescheduleDate || !reason) {
            return res.status(400).json({ message: 'rescheduleDate and reason are required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (enquiry.status !== 'SELECTED') {
            return res.status(400).json({
                message: `Only 'SELECTED' enquiries can be rescheduled. Current status: '${enquiry.status}'`,
            });
        }

        const before = { status: enquiry.status, rescheduleDate: enquiry.rescheduleDate, assignedSelectorId: enquiry.assignedSelectorId };

        // Record the history
        enquiry.rescheduleHistory.push({
            rescheduleDate: new Date(rescheduleDate),
            reason: reason,
            rescheduledBy: req.user._id,
        });

        enquiry.status = 'RESCHEDULED';
        enquiry.rescheduleDate = new Date(rescheduleDate);
        enquiry.assignedSelectorId = null;

        await enquiry.save();

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Field Owner rescheduled Enquiry ${enquiry.enquiryId}`,
            before,
            { status: 'RESCHEDULED', rescheduleDate: enquiry.rescheduleDate, assignedSelectorId: null }
        );

        res.json({ message: 'Enquiry rescheduled successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        console.error('Error rescheduling enquiry:', error);
        res.status(500).json({ message: 'Server error while rescheduling enquiry', error: error.message });
    }
};

// @desc    SLA automation – reset ASSIGNED enquiries not visited within 24 hours
// @route   POST /api/enquiries/run-sla-check
// @access  Private (Admin, Field Owner)
const runSlaTimeoutCheck = async (req, res) => {
    try {
        const { resetCount, affectedEnquiryIds } = await checkAndResetExpiredEnquiries();

        return res.status(200).json({
            message: resetCount === 0
                ? 'SLA check complete. No expired assignments found.'
                : `SLA check complete. ${resetCount} enquiry/enquiries reset to PENDING.`,
            resetCount,
            affectedEnquiryIds,
        });
    } catch (error) {
        console.error('Error running SLA timeout check:', error);
        res.status(500).json({ message: 'Server error during SLA check', error: error.message });
    }
};

// @desc    Get all enquiries that missed their 24-hour SLA (missed plots report)
// @route   GET /api/enquiries/reports/missed
// @access  Private (Admin, Field Owner)
const getMissedPlots = async (req, res) => {
    try {
        const missedEnquiries = await Enquiry.find({
            'missedAssignments.0': { $exists: true },
        })
            .sort({ updatedAt: -1 })
            .populate('missedAssignments.selectorId', 'firstName lastName mobileNo')
            .populate('fieldOwnerId', 'firstName lastName mobileNo')
            .populate('generation', 'name');

        res.status(200).json({
            total: missedEnquiries.length,
            data: missedEnquiries,
        });
    } catch (error) {
        console.error('Error fetching missed plots report:', error);
        res.status(500).json({ message: 'Server error while fetching missed plots report' });
    }
};

module.exports = {
    createEnquiry,
    getEnquiries,
    updateEnquiry,
    getEnquiryById,
    rescheduleEnquiry,
    fixRate,
    foRescheduleEnquiry,
    runSlaTimeoutCheck,
    getMissedPlots,
};
