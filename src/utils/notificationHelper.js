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
const pushService = require('../services/push.service');

const resolveNotificationMetadata = async (referenceId, referenceModel) => {
    let farmerName = null;
    let location = null;
    let status = null;

    if (!referenceId || !referenceModel) {
        return { farmerName, location, status };
    }

    try {
        if (referenceModel === 'Enquiry') {
            const Enquiry = require('../modules/enquiries/enquiry.model');
            const enquiry = await Enquiry.findById(referenceId).lean();
            if (enquiry) {
                farmerName = `${enquiry.farmerFirstName} ${enquiry.farmerLastName}`.trim();
                location = enquiry.location;
                status = enquiry.status;
            }
        } else if (referenceModel === 'Logistics') {
            const Logistics = require('../modules/logistics/logistics.model');
            const logistics = await Logistics.findById(referenceId).populate('enquiryId').lean();
            if (logistics && logistics.enquiryId) {
                const enq = logistics.enquiryId;
                farmerName = `${enq.farmerFirstName} ${enq.farmerLastName}`.trim();
                location = enq.location;
                status = enq.status;
            }
        } else if (referenceModel === 'Packing') {
            const Packing = require('../modules/execution/packing.model');
            const packing = await Packing.findById(referenceId)
                .populate({ path: 'assignmentId', populate: { path: 'enquiryId' } })
                .lean();
            if (packing && packing.assignmentId && packing.assignmentId.enquiryId) {
                const enq = packing.assignmentId.enquiryId;
                farmerName = `${enq.farmerFirstName} ${enq.farmerLastName}`.trim();
                location = enq.location;
                status = enq.status;
            }
        } else if (referenceModel === 'Inspection') {
            const Inspection = require('../modules/inspections/inspection.model');
            const inspection = await Inspection.findById(referenceId).populate('enquiryId').lean();
            if (inspection && inspection.enquiryId) {
                const enq = inspection.enquiryId;
                farmerName = `${enq.farmerFirstName} ${enq.farmerLastName}`.trim();
                location = enq.location;
                status = enq.status;
            }
        }
    } catch (err) {
        console.error('[Notification Helper] Failed to resolve metadata:', err.message);
    }

    return { farmerName, location, status };
};

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
        const metadata = await resolveNotificationMetadata(referenceId, referenceModel);

        await Notification.create({
            recipientId,
            type,
            message,
            referenceId:    referenceId    || null,
            referenceModel: referenceModel || undefined,
            farmerName:     metadata.farmerName,
            location:       metadata.location,
            status:         metadata.status,
        });

        // Log to console for debugging/tracking
        const user = await User.findById(recipientId).select('firstName lastName role');
        const userName = user ? `${user.firstName} ${user.lastName} (${user.role})` : recipientId;
        console.log(`[In-App Notification OUT] To: ${userName} | Type: ${type} | Msg: "${message}"`);

        // Propagate to real-time FCM push notification (fire-and-forget)
        pushService.sendPushToUser(
            recipientId,
            String(type).replace(/_/g, ' '),
            message,
            { referenceId, referenceModel }
        ).catch(err => {
            console.error('[Notification] Failed to send push notification:', err.message);
        });

    } catch (err) {
        // Log but never re-throw — notification failure must not break business logic
        console.error('[Notification] Failed to persist in-app notification:', err.message);
    }
};

module.exports = { createNotification };
