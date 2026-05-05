const Enquiry = require('../enquiries/enquiry.model');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get Field Selector dashboard KPIs
// @route   GET /api/field-selector/dashboard
// @access  Protected (Field Selector, Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getDashboard = async (req, res) => {
    try {
        const selectorId = req.user._id;
        const createdWithin24Hours = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
        const baseFilter = { assignedSelectorId: selectorId, createdAt: createdWithin24Hours };

        // Run all aggregation counters in parallel for performance
        const [
            assigned,
            selected,
            rejected,
            missed,
            visited,
            recentActivity,
        ] = await Promise.all([
            // Assigned = still in PENDING (not yet inspected)
            Enquiry.countDocuments({ ...baseFilter, status: 'PENDING' }),

            // Selector marked the plot as SELECTED (inspection approved)
            Enquiry.countDocuments({ ...baseFilter, status: 'SELECTED' }),

            // Selector rejected the plot
            Enquiry.countDocuments({ ...baseFilter, status: 'REJECTED' }),

            // Missed = still PENDING but the scheduledDate has passed
            Enquiry.countDocuments({
                ...baseFilter,
                scheduledDate: { $lt: new Date() },
                status: 'PENDING',
            }),

            // Visited = inspection was submitted (SELECTED + REJECTED + downstream statuses)
            Enquiry.countDocuments({
                ...baseFilter,
                status: { $in: ['SELECTED', 'REJECTED', 'RATE_FIXED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'] },
            }),

            // Last 5 activity items for the feed
            Enquiry.find(baseFilter)
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('enquiryId farmerFirstName farmerLastName location status scheduledDate updatedAt')
                .lean(),
        ]);

        res.status(200).json({
            kpis: {
                assigned,
                selected,
                rejected,
                missed,
                visited,
            },
            recentActivity,
        });
    } catch (error) {
        console.error('Error fetching field-selector dashboard:', error);
        res.status(500).json({ message: 'Server error while fetching dashboard' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all enquiries assigned to the logged-in Field Selector
// @route   GET /api/field-selector/fields
// @access  Protected (Field Selector, Admin)
//
// Query params:
//   status   — filter by enquiry status (e.g. PENDING, SELECTED, REJECTED)
//   search   — search by farmer name or location (case-insensitive)
//   page     — page number (default: 1)
//   limit    — results per page (default: 20)
// ─────────────────────────────────────────────────────────────────────────────
const getAssignedFields = async (req, res) => {
    try {
        const selectorId = req.user._id;
        const { status, search, page = 1, limit = 20 } = req.query;

        // Base filter: only this selector's enquiries created in the last 24 hours
        const filter = {
            assignedSelectorId: selectorId,
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        };

        // Optional status filter (single value or comma-separated list)
        if (status) {
            const statuses = status.split(',').map(s => s.trim().toUpperCase());
            filter.status = { $in: statuses };
        }

        // Optional text search across farmer name and location
        if (search) {
            const regex = new RegExp(search, 'i');
            filter.$or = [
                { farmerFirstName: regex },
                { farmerLastName: regex },
                { location: regex },
                { subLocation: regex },
                { enquiryId: regex },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [data, total] = await Promise.all([
            Enquiry.find(filter)
                .sort({ scheduledDate: 1, createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('generation', 'name')
                .populate('fieldOwnerId', 'firstName lastName mobileNo')
                .lean(),
            Enquiry.countDocuments(filter),
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });
    } catch (error) {
        console.error('Error fetching assigned fields:', error);
        res.status(500).json({ message: 'Server error while fetching assigned fields' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single enquiry assigned to the logged-in Field Selector
// @route   GET /api/field-selector/fields/:id
// @access  Protected (Field Selector, Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getFieldDetails = async (req, res) => {
    try {
        const selectorId = req.user._id;
        const enquiryId = req.params.id;

        const enquiry = await Enquiry.findOne({
            _id: enquiryId,
            assignedSelectorId: selectorId,
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        })
            .populate('generation', 'name')
            .populate('fieldOwnerId', 'firstName lastName mobileNo')
            .lean();

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found, not assigned to you, or no longer visible' });
        }

        res.status(200).json(enquiry);
    } catch (error) {
        console.error('Error fetching field details:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid enquiry ID format' });
        }
        res.status(500).json({ message: 'Server error while fetching field details' });
    }
};

module.exports = {
    getDashboard,
    getAssignedFields,
    getFieldDetails,
};
