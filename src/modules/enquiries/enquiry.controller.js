const Enquiry = require('./enquiry.model');
const User = require('../users/user.model');
const Agent = require('../master-data/agent.model'); // Ensure Agent model exists and is imported correctly, will verify after
const { logSystemAction } = require('../../utils/auditLogger');
const NotificationService = require('../../services/notification.service');

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

        if (req.user.role === 'Admin') {
            // Admin gets all enquiries
            query = {};
        } else if (req.user.role === 'Field Owner') {
            // Field Owner gets only their own enquiries
            query = { fieldOwnerId: req.user._id };
        } else {
            // Other roles not defined in prompt, returning what they own or denying
            query = { _id: null }; // or return 403
        }

        if (status) {
            query.status = status;
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

const getEnquiryById = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id)
            .populate('assignedSelectorId', 'firstName lastName mobileNo')
            .populate('agentId', 'name')
            .populate('generation', 'name');

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }
        res.status(200).json(enquiry);
    } catch (error) {
        console.error('Error fetching enquiry by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching enquiry' });
    }
};

module.exports = {
    createEnquiry,
    getEnquiries,
    updateEnquiry,
    getEnquiryById,
};
