/**
 * broadcastToRole.js
 *
 * Utility to send an in-app notification to ALL active users of a given role.
 * Used for events like "Rate Fixed" that need to reach every Operational Manager,
 * or system events that every Admin should see.
 *
 * Usage:
 *   const { broadcastToRole } = require('../../utils/broadcastToRole');
 *   await broadcastToRole('Admin', 'ENQUIRY_CREATED', 'New enquiry received.', enquiry._id, 'Enquiry');
 *   await broadcastToRole('Operational Manager', 'RATE_FIXED', 'Rate fixed — ready for logistics.', enquiry._id, 'Enquiry');
 */

const User = require('../modules/users/user.model');
const { createNotification } = require('./notificationHelper');

/**
 * broadcastToRole
 * @param {string|string[]} role           - Role name(s) to broadcast to
 * @param {string}          type           - Notification type enum
 * @param {string}          message        - Human-readable message
 * @param {ObjectId|string} [referenceId]  - Optional linked document _id
 * @param {string}          [referenceModel] - Optional model name
 */
const broadcastToRole = async (role, type, message, referenceId = null, referenceModel = null) => {
    try {
        const roles = Array.isArray(role) ? role : [role];

        const recipients = await User.find({
            role:     { $in: roles },
            isActive: true,
        }).select('_id').lean();

        if (!recipients.length) return;

        // Fire all DB writes in parallel
        await Promise.all(
            recipients.map(u => createNotification(u._id, type, message, referenceId, referenceModel))
        );
    } catch (err) {
        console.error('[Notification] broadcastToRole failed:', err.message);
    }
};

module.exports = { broadcastToRole };
