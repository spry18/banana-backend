const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: [
                // ── Field Selection Flow ──────────────────────
                'ENQUIRY_CREATED',           // Admin: new enquiry submitted
                'FIELD_SELECTOR_ASSIGNED',   // Field Selector: assigned to a new plot inspection
                'VISIT_SCHEDULED',           // Field Owner / Admin: inspection approved (SELECTED)
                'ENQUIRY_REJECTED',          // Field Owner / Admin: inspection rejected
                'RATE_FIXED',               // Operational Manager / Admin: rate locked, ready for logistics

                // ── Logistics & Execution Flow ────────────────
                'TEAM_ASSIGNED',            // Field Owner: logistics team assigned to their plot
                'LOGISTICS_ASSIGNED',       // Driver / Munshi: assigned to a new route or packing task
                'EXTRA_VEHICLE_ADDED',      // Driver / Munshi: an overflow vehicle has been added

                // ── Packing & Approval Flow ───────────────────
                'PACKING_SUBMITTED',        // Operational Manager / Admin: Munshi submitted packing report
                'PACKING_APPROVED',         // Munshi / Driver / Field Owner: packing report approved
                'PACKING_REJECTED',         // Munshi: packing report rejected, resubmission required
                'TRIP_COMPLETED',           // Field Owner: harvest fully complete and approved

                // ── General ───────────────────────────────────
                'SYSTEM',                   // Any user: system-level alert
                'WHATSAPP_SENT',            // Admin: record of a WhatsApp message sent externally
            ],
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        referenceId: {
            // Optional: links to the related document (Enquiry, Logistics, Packing, Inspection)
            type: mongoose.Schema.Types.ObjectId,
        },
        referenceModel: {
            type: String,
            enum: ['Enquiry', 'Logistics', 'Trip', 'Inspection', 'Packing'],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
