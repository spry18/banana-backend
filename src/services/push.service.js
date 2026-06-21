'use strict';

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK using the local credentials JSON
try {
    if (!admin.apps.length) {
        const serviceAccountPath = path.join(__dirname, '../../banana-management-system-firebase-adminsdk.json');
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('[Firebase] Admin SDK initialized successfully using local JSON.');
    }
} catch (error) {
    console.error('[Firebase] Failed to initialize Admin SDK:', error.message);
}

/**
 * Sends a push notification to a specific user's active device tokens.
 * Automatically cleans up invalid/unregistered tokens.
 *
 * @param {string} userId - Recipient user database ID
 * @param {string} title - Push notification title
 * @param {string} body - Push notification body message
 * @param {Object} [data] - Optional metadata payload
 */
const sendPushToUser = async (userId, title, body, data = {}) => {
    // Guard: ignore if invalid arguments
    if (!userId || !title || !body) return;

    try {
        const User = require('../modules/users/user.model');
        const user = await User.findById(userId).select('fcmTokens');
        if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
            return;
        }

        // Format data: Firebase values must be string key-value pairs
        const stringifiedData = {};
        for (const [key, val] of Object.entries(data)) {
            if (val !== undefined && val !== null) {
                stringifiedData[key] = String(val);
            }
        }

        // Prepare multicast messages
        const messages = user.fcmTokens.map(fcm => ({
            token: fcm.token,
            notification: { title, body },
            data: stringifiedData
        }));

        console.log(`[Firebase Push OUT] Attempting to send ${messages.length} pushes to User: ${userId}`);

        const response = await admin.messaging().sendEach(messages);

        const tokensToRemove = [];
        response.responses.forEach((res, index) => {
            if (res.success) {
                console.log(`[Firebase Push SUCCESS] To: ${user.fcmTokens[index].token}`);
            } else {
                const errorCode = res.error?.code;
                console.warn(`[Firebase Push FAIL] To: ${user.fcmTokens[index].token} | Error: ${errorCode || res.error?.message}`);
                
                // Clean up invalid or expired tokens
                if (
                    errorCode === 'messaging/registration-token-not-registered' ||
                    errorCode === 'messaging/invalid-argument'
                ) {
                    tokensToRemove.push(user.fcmTokens[index].token);
                }
            }
        });

        if (tokensToRemove.length > 0) {
            await User.findByIdAndUpdate(userId, {
                $pull: { fcmTokens: { token: { $in: tokensToRemove } } }
            });
            console.log(`[Firebase Token Cleanup] Removed ${tokensToRemove.length} stale tokens for User: ${userId}`);
        }

    } catch (err) {
        console.error('[Firebase Push ERROR] Error sending push notification:', err.message);
    }
};

module.exports = {
    sendPushToUser
};
