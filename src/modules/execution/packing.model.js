const mongoose = require('mongoose');

const packingSchema = new mongoose.Schema(
    {
        assignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Logistics',
            required: true,
        },
        munshiId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        lineNo: {
            type: String,
            required: true,
        },
        teamName: {
            type: String,
            required: true,
        },
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand', // Assuming Brand model exists
            required: true,
        },
        box4H: {
            type: Number,
            default: 0,
        },
        box5H: {
            type: Number,
            default: 0,
        },
        box6H: {
            type: Number,
            default: 0,
        },
        box8H: {
            type: Number,
            default: 0,
        },
        boxCL: {
            type: Number,
            default: 0,
        },
        totalBoxes: {
            type: Number,
            required: true,
        },
        wastageKg: {
            type: Number,
            required: true,
        },
        wastageReason: {
            type: String,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Packing', packingSchema);
