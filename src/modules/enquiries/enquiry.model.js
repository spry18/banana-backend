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
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Generation',
            required: true,
        },
        agentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Agent',
            default: null,
        },
        agentAttached: {
            type: Boolean,
            default: false,
        },
        visitPriority: {
            type: String,
            enum: ['High', 'Medium', 'Low'],
            default: 'Medium',
        },
        fieldOwnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        assignedSelectorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        scheduledDate: {
            type: Date,
        },
        scheduledTime: {
            type: String,
        },
        packingType: {
            type: String,
            enum: ['4H', '5H', '6H', '8H', 'CL', '7Kg', 'Other'],
        },
        estimatedBoxes: {
            type: Number,
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
        },
        purchaseRate: {
            type: Number,
        },
        rateFixedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        remarks: {
            type: String,
        },
        status: {
            type: String,
            enum: [
                'PENDING',
                'SELECTED',
                'REJECTED',
                'RATE_FIXED',
                'RESCHEDULED',
                'ASSIGNED',
                'IN_PROGRESS',
                'COMPLETED',
                'CLOSED',
                'CANCELLED',
            ],
            default: 'PENDING',
        },
        rescheduleDate: {
            type: Date,
            default: null,
        },
        rescheduleHistory: [
            {
                rescheduleDate: { type: Date },
                reason: { type: String },
                rescheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                timestamp: { type: Date, default: Date.now },
            }
        ],
        missedAssignments: [
            {
                selectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                missedAt: { type: Date, default: Date.now },
            }
        ],
        editableUntil: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Enquiry', enquirySchema);
