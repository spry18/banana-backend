const Notification = require('./notification.model');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');

// @desc    Get notification feed for the logged-in Admin
// @route   GET /api/notifications
// @access  Private (Admin)
const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20, unreadOnly } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter = { recipientId: req.user._id };
        if (unreadOnly === 'true') filter.isRead = false;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Notification.countDocuments(filter),
            Notification.countDocuments({ recipientId: req.user._id, isRead: false }),
        ]);

        res.json({
            total,
            unreadCount,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: notifications,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Mark a notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private (Admin)
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientId: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Marked as read', notification });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/notifications/mark-all-read
// @access  Private (Admin)
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipientId: req.user._id, isRead: false },
            { isRead: true }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Send a WhatsApp notification to a farmer (HTTP trigger)
// @route   POST /api/notifications/whatsapp
// @access  Private (Admin)
const sendWhatsApp = async (req, res) => {
    try {
        const { mobile, farmerName, message, enquiryId, type = 'WHATSAPP_SENT' } = req.body;

        if (!mobile || !farmerName || !message) {
            return res.status(400).json({ message: 'mobile, farmerName, and message are required' });
        }

        // Fire the WhatsApp mock/service
        NotificationService.sendLogisticsAlert(mobile, 'Farmer', message);

        // Persist a notification record for the Admin feed
        await Notification.create({
            recipientId: req.user._id,
            type,
            message: `WhatsApp sent to ${farmerName} (${mobile}): ${message}`,
            referenceId: enquiryId || null,
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
    markAsRead,
    markAllAsRead,
    sendWhatsApp,
};
