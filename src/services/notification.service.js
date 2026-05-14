'use strict';
const https = require('https');

// ─────────────────────────────────────────────────────────────────────────────
// Pinnacle WhatsApp API helper
// Endpoint (from Partners_API_V3_Postman_Collection):
//   POST https://partnersv1.pinbot.ai/v3/{phone_number_id}/messages
// Headers : apikey, Content-Type: application/json
// Body    : { to, type:"template", template: { name, language, components } }
// ─────────────────────────────────────────────────────────────────────────────

const PINNACLE_API_KEY = process.env.PINNACLE_API_KEY || '';
const PINNACLE_PHONE_NUMBER_ID = process.env.PINNACLE_PHONE_NUMBER_ID || '';

/**
 * Private helper – sends a WhatsApp template message via Pinnacle API.
 * If credentials are missing it gracefully falls back to console.log
 * so the existing flow is never broken during development / staging.
 *
 * @param {Object} params
 * @param {string} params.templateName - The approved template name in Pinnacle
 * @param {string} params.language - Language code (e.g., 'mr' for Marathi, 'en_US' for English)
 * @param {string} params.phone - Recipient number with country code, no "+"
 * @param {Array<string>} params.variables - Array of dynamic variables to replace in the template body
 */
function _sendWhatsAppTemplate({ templateName, language = 'mr', phone, variables = [] }) {
    // Always echo to console for traceability
    console.log(`[WhatsApp OUT (Template)] To: ${phone} | Template: ${templateName} | Vars: [${variables.join(', ')}]`);

    // Skip real API call if credentials are not configured yet
    if (!PINNACLE_API_KEY || !PINNACLE_PHONE_NUMBER_ID) {
        console.warn('[WhatsApp] PINNACLE_API_KEY or PINNACLE_PHONE_NUMBER_ID not set – skipping real send.');
        return;
    }

    const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
            name: templateName,
            language: {
                code: language
            }
        }
    };

    if (variables && variables.length > 0) {
        payload.template.components = [
            {
                type: 'body',
                parameters: variables.map(v => ({
                    type: 'text',
                    text: String(v)
                }))
            }
        ];
    }

    const payloadString = JSON.stringify(payload);

    const options = {
        hostname: 'partnersv1.pinbot.ai',
        path: `/v3/${PINNACLE_PHONE_NUMBER_ID}/messages`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadString),
            'apikey': PINNACLE_API_KEY,
        },
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`[WhatsApp] ✅ Template '${templateName}' sent to ${phone} | status=${res.statusCode}`);
            } else {
                console.error(`[WhatsApp] ❌ Failed to send template '${templateName}' to ${phone} | status=${res.statusCode} | body=${body}`);
            }
        });
    });

    req.on('error', (err) => {
        console.error(`[WhatsApp] ❌ Request error to ${phone}:`, err.message);
    });

    req.write(payloadString);
    req.end();
}

// ─────────────────────────────────────────────────────────────────────────────

class NotificationService {

    // 1. Farmer inquiry
    static sendEnquiryReceived(mobile) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_enquiry_received',
            language: 'mr',
            phone: mobile,
            variables: []
        });
    }

    // 2. Farmer Visit Scheduled
    static sendVisitScheduled(mobile, supervisorName, supervisorMobile) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_visit_scheduled',
            language: 'mr',
            phone: mobile,
            variables: [supervisorName, supervisorMobile]
        });
    }

    // 3. Field Selected
    static sendFieldSelected(mobile, contactPersonName) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_field_selected',
            language: 'mr',
            phone: mobile,
            variables: [contactPersonName]
        });
    }

    // 3. Field Rejected
    static sendInspectionRejected(mobile, contactNumber) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_inspection_rejected',
            language: 'mr',
            phone: mobile,
            variables: [contactNumber]
        });
    }

    // 4. Field Visit Rescheduled - after 6 pm
    static sendVisitRescheduled(mobile) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_visit_rescheduled',
            language: 'mr',
            phone: mobile,
            variables: []
        });
    }

    // 5. Field Selector Rescheduled
    static sendSelectorRescheduled(mobile, supervisorName, supervisorMobile) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_selector_rescheduled',
            language: 'mr',
            phone: mobile,
            variables: [supervisorName, supervisorMobile]
        });
    }

    // ── Logistics & Other ─────────────────────────────────────────────────────

    static sendScheduleConfirmed(mobile, name, date, munshiName, munshiMobile) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_schedule_confirmed',
            language: 'mr',
            phone: mobile,
            variables: [name, date, munshiName, munshiMobile]
        });
    }

    static sendPackingSummary(mobile, name, totalBoxes, wastage) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_packing_summary',
            language: 'mr',
            phone: mobile,
            variables: [name, totalBoxes, wastage]
        });
    }

    static sendLogisticsAlert(mobile, role, message) {
        _sendWhatsAppTemplate({
            templateName: 'logistics_alert',
            language: 'mr',
            phone: mobile,
            variables: [role, message]
        });
    }

    static sendDealCancelled(mobile, name) {
        _sendWhatsAppTemplate({
            templateName: 'farmer_deal_cancelled',
            language: 'mr',
            phone: mobile,
            variables: [name]
        });
    }

    static sendDieselAdvanceReceipt(mobile, driverName, amount, vehicleNumber) {
        _sendWhatsAppTemplate({
            templateName: 'driver_diesel_advance',
            language: 'mr',
            phone: mobile,
            variables: [driverName, amount, vehicleNumber]
        });
    }

    static sendPetrolAdvanceReceipt(mobile, name, amount, vehicleNumber) {
        const vInfo = vehicleNumber || 'N/A';
        _sendWhatsAppTemplate({
            templateName: 'driver_petrol_advance',
            language: 'mr',
            phone: mobile,
            variables: [name, amount, vInfo]
        });
    }

    static sendExtraVehicleAlert(mobile, name, vehicleNumber, farmLocation) {
        _sendWhatsAppTemplate({
            templateName: 'driver_extra_vehicle_assigned',
            language: 'mr',
            phone: mobile,
            variables: [name, vehicleNumber, farmLocation]
        });
    }

    static sendExtraVehicleNotifyMunshi(mobile, munshiName, extraVehicleNumber, extraDriverName) {
        _sendWhatsAppTemplate({
            templateName: 'munshi_extra_vehicle_added',
            language: 'mr',
            phone: mobile,
            variables: [munshiName, extraVehicleNumber, extraDriverName]
        });
    }

    static sendExtraVehicleNotifyOriginalDriver(mobile, driverName, extraVehicleNumber) {
        _sendWhatsAppTemplate({
            templateName: 'driver_extra_vehicle_added',
            language: 'mr',
            phone: mobile,
            variables: [driverName, extraVehicleNumber]
        });
    }
}

module.exports = NotificationService;