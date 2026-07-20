'use strict';
/**
 * Billing module notification helper.
 * Uses Firebase Admin (already initialized in the project) to send push notifications.
 * Future: WhatsApp via Pinnacle API hook.
 */
const admin = require('firebase-admin');

/**
 * Send a push notification to a device token.
 * @param {Object} opts
 * @param {string} opts.deviceToken - FCM device token
 * @param {string} opts.title - Notification title
 * @param {string} opts.body - Notification body
 * @param {Object} [opts.data] - Optional key-value payload
 * @returns {Promise<{status:string, messageId?:string, error?:string}>}
 */
const sendBillNotification = async ({ deviceToken, title, body, data = {} }) => {
  if (!deviceToken) {
    return { status: 'skipped', reason: 'no_device_token' };
  }
  try {
    const message = {
      token: deviceToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
    };
    const messageId = await admin.messaging().send(message);
    return { status: 'sent', messageId };
  } catch (err) {
    console.error('[billing.notify] FCM error:', err.message);
    return { status: 'failed', error: err.message };
  }
};

/**
 * Placeholder for WhatsApp sharing via Pinnacle API.
 * Wire in Pinnacle credentials and template name when ready.
 */
const sendWhatsAppBill = async ({ phone, pdfUrl, templateName = 'bill_share' }) => {
  // TODO: Integrate Pinnacle Partners WhatsApp API
  console.log(`[billing.notify] WhatsApp hook — phone: ${phone}, url: ${pdfUrl}, template: ${templateName}`);
  return { status: 'pending_integration' };
};

module.exports = { sendBillNotification, sendWhatsAppBill };
