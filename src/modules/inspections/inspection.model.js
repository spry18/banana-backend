const mongoose = require('mongoose');

const inspectionSchema = new mongoose.Schema(
    {
        enquiryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Enquiry',
            required: true,
        },
        selectorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        harvestingStage: {
            type: String,
            required: true,
        },
        volumeBoxRange: {
            type: String,
            required: true,
        },
        recoveryPercent: {
            type: String,
            required: true,
        },
        packingSize: {
            type: String,
            enum: ['5kg', '7kg', '13kg', '13.5kg', '14kg', '16kg'],
            required: true,
        },
        chelling: {
            type: String,
            required: true,
        },
        spikling: {
            type: String,
            required: true,
        },
        pulpe: {
            type: String,
            required: true,
        },
        phreeps: {
            type: String,
            required: true,
        },
        harvestingTime: {
            type: String,
            enum: ['Immediate', 'After 3-4 days', 'After 1 week'],
            required: true,
        },
        generalNotes: {
            type: String,
        },
        isThroughPartner: {
            type: Boolean,
            default: false,
        },
        partnerName: {
            type: String,
        },
        photos: {
            type: [String],
            required: true,
        },
        // New fields added for updated Field Selector report
        generation: {
            type: String,
            required: false,
        },
        plantCount: {
            type: Number,
            required: false,
        },
        status: {
            type: String,
            required: false,
        },
        caliper: {
            type: String,
            required: false,
        },
        length: {
            type: String,
            required: false,
        },
        plotType: {
            type: String,
            required: false,
        },
        greenLeaf: {
            type: String,
            required: false,
        },
        decision: {
            type: String,
            enum: ['APPROVED', 'REJECTED'],
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Inspection', inspectionSchema);
