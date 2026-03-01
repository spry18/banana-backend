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
                'VISIT_SCHEDULED',
                'TEAM_ASSIGNED',
                'TRIP_COMPLETED',
                'RATE_FIXED',
                'ENQUIRY_CREATED',
                'ENQUIRY_REJECTED',
                'SYSTEM',
                'WHATSAPP_SENT',
            ],
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        referenceId: {
            // Optional link to the enquiry / logistics / trip document
            type: mongoose.Schema.Types.ObjectId,
        },
        referenceModel: {
            type: String,
            enum: ['Enquiry', 'Logistics', 'Trip', 'Inspection'],
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
