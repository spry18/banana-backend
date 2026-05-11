const Notification = require('./notification.model');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get in-app notification feed for the logged-in user (all roles)
// @route   GET /api/notifications
// @access  Private (all authenticated users)
// @query   ?page=1  ?limit=20
// ─────────────────────────────────────────────────────────────────────────────
const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Scope strictly to the logged-in user
        const filter = { recipientId: req.user._id };

        const [notifications, total] = await Promise.all([
            Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            Notification.countDocuments(filter),
        ]);

        res.json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: notifications,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Manually send a WhatsApp alert (Admin only)
// @route   POST /api/notifications/whatsapp
// @access  Private (Admin)
// ─────────────────────────────────────────────────────────────────────────────
const sendWhatsApp = async (req, res) => {
    try {
        const { mobile, farmerName, message, enquiryId } = req.body;

        if (!mobile || !farmerName || !message) {
            return res.status(400).json({ message: 'mobile, farmerName, and message are required' });
        }

        // Fire the WhatsApp console stub (will be real API in future)
        NotificationService.sendLogisticsAlert(mobile, 'Farmer', message);

        // Persist a record in the Admin's own notification feed
        await Notification.create({
            recipientId:    req.user._id,
            type:           'WHATSAPP_SENT',
            message:        `WhatsApp sent to ${farmerName} (${mobile}): ${message}`,
            referenceId:    enquiryId || null,
            referenceModel: enquiryId ? 'Enquiry' : undefined,
        });

        await logSystemAction(
            req.user._id,
            'CREATE',
            'Notifications',
            null,
            `WhatsApp sent to farmer ${farmerName} at ${mobile}`
        );

        res.status(200).json({ message: 'WhatsApp message triggered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = {
    getNotifications,
    sendWhatsApp,
};
