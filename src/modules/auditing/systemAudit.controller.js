const SystemAudit = require('./systemAudit.model');
const User = require('../users/user.model');

// @desc    Get all system audit logs with pagination and filtering
// @route   GET /api/audit/logs
// @access  Private (Admin)
const getSystemAudits = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            userId,
            moduleName,
            action,
            startDate,
            endDate,
            search,
            role,
        } = req.query;

        const filter = {};
        if (userId) filter.userId = userId;
        
        // If role is provided, find all users with that role
        if (role && role !== 'ALL') {
            const usersWithRole = await User.find({ role }).select('_id');
            const userIds = usersWithRole.map(u => u._id);
            filter.userId = { $in: userIds };
        }

        if (moduleName) filter.moduleName = new RegExp(moduleName, 'i');
        if (action) filter.action = action;
        
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            
            // Also search for users matching the name
            const matchingUsers = await User.find({
                $or: [
                    { firstName: searchRegex },
                    { lastName: searchRegex },
                    { mobileNo: searchRegex }
                ]
            }).select('_id');
            const matchingUserIds = matchingUsers.map(u => u._id);

            filter.$or = [
                { moduleName: searchRegex },
                { action: searchRegex },
                { details: searchRegex },
                { userId: { $in: matchingUserIds } }
            ];
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [audits, total] = await Promise.all([
            SystemAudit.find(filter)
                .populate('userId', 'firstName lastName role mobileNo')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            SystemAudit.countDocuments(filter),
        ]);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: audits,
        });
    } catch (error) {
        console.error('Error fetching system audits:', error);
        res.status(500).json({ message: 'Server error while fetching system audits' });
    }
};

module.exports = { getSystemAudits };
