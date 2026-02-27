const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema(
    {
        enquiryId: {
            type: String,
            required: true,
            unique: true,
        },
        farmerFirstName: {
            type: String,
            required: true,
        },
        farmerLastName: {
            type: String,
            required: true,
        },
        farmerMobile: {
            type: String,
            required: true,
            match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number.'],
        },
        location: {
            type: String,
            required: true,
        },
        subLocation: {
            type: String,
        },
        plantCount: {
            type: Number,
            required: true,
            min: [1000, 'Plant count must be at least 1000.'],
        },
        generation: {
            type: String,
            enum: ['Mother', 'F1', 'F2'],
            required: true,
        },
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agent',
            default: null,
        },
        fieldOwnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        assignedSelectorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: [
                'PENDING',
                'SELECTED',
                'REJECTED',
                'RATE_FIXED',
                'ASSIGNED',
                'COMPLETED',
                'CLOSED',
            ],
            default: 'PENDING',
        },
        editableUntil: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Enquiry', enquirySchema);
