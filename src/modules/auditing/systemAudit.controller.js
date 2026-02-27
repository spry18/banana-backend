const SystemAudit = require('./systemAudit.model');

// @desc    Get all system audit logs
// @route   GET /api/system-audits
// @access  Protected (Admin only)
const getSystemAudits = async (req, res) => {
    try {
        const audits = await SystemAudit.find()
            .populate('userId', 'firstName lastName role')
            .sort({ createdAt: -1 });

        res.status(200).json(audits);
    } catch (error) {
        console.error('Error fetching system audits:', error);
        res.status(500).json({ message: 'Server error while fetching system audits' });
    }
};

module.exports = {
    getSystemAudits,
};
