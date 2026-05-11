/**
 * notificationHelper.js
 *
 * Utility to write a single in-app notification record to MongoDB.
 * This is a fire-and-forget helper — it never throws so it cannot
 * crash the parent request even if the DB write fails.
 *
 * Usage:
 *   const { createNotification } = require('../../utils/notificationHelper');
 *   await createNotification(userId, 'LOGISTICS_ASSIGNED', 'You have a new route.', assignmentId, 'Logistics');
 */

const Notification = require('../modules/notifications/notification.model');
const User = require('../modules/users/user.model');

/**
 * createNotification
 * @param {ObjectId|string} recipientId  - The _id of the user receiving the notification
 * @param {string}          type         - Must match the enum in notification.model.js
 * @param {string}          message      - Human-readable notification text
 * @param {ObjectId|string} [referenceId]    - Optional: linked document _id (Enquiry, Logistics, etc.)
 * @param {string}          [referenceModel] - Optional: model name ('Enquiry' | 'Logistics' | 'Inspection' | 'Packing')
 */
const createNotification = async (recipientId, type, message, referenceId = null, referenceModel = null) => {
    // Guard: skip silently if no recipient provided
    if (!recipientId) return;

    try {
        await Notification.create({
            recipientId,
            type,
            message,
            referenceId:    referenceId    || null,
            referenceModel: referenceModel || undefined,
        });

        // Log to console for debugging/tracking
        const user = await User.findById(recipientId).select('firstName lastName role');
        const userName = user ? `${user.firstName} ${user.lastName} (${user.role})` : recipientId;
        console.log(`[In-App Notification OUT] To: ${userName} | Type: ${type} | Msg: "${message}"`);

    } catch (err) {
        // Log but never re-throw — notification failure must not break business logic
        console.error('[Notification] Failed to persist in-app notification:', err.message);
    }
};

module.exports = { createNotification };
