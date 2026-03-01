const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    sendWhatsApp,
} = require('./notification.controller');

router.use(protect);

router.get('/', authorize('Admin', 'Operational Manager'), getNotifications);
router.patch('/mark-all-read', authorize('Admin', 'Operational Manager'), markAllAsRead);
router.patch('/:id/read', authorize('Admin', 'Operational Manager'), markAsRead);
router.post('/whatsapp', authorize('Admin'), sendWhatsApp);

module.exports = router;
