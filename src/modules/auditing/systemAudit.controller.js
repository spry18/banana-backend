const SystemAudit = require('./systemAudit.model');

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
        } = req.query;

        const filter = {};
        if (userId) filter.userId = userId;
        if (moduleName) filter.moduleName = new RegExp(moduleName, 'i');
        if (action) filter.action = action;
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
