const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../middlewares/auth.middleware');
const {
    getNotifications,
    sendWhatsApp,
} = require('./notification.controller');

// All routes require authentication
router.use(protect);

// ── Feed (every authenticated user sees their own notifications) ──
router.get('/', getNotifications);  // GET /api/notifications?page=1&limit=20

// ── Admin-only manual WhatsApp trigger ──
router.post('/whatsapp', authorize('Admin'), sendWhatsApp);

module.exports = router;
