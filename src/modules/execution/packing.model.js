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
        box7Kg: {
            type: Number,
            default: 0,
        },
        boxOther: {
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
        remarks: {
            type: String,
            default: '',
        },
        photos: {
            type: [String],
            default: [],
        },
        cancellationReason: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: ['PENDING', 'SUBMITTED', 'CANCELLED'],
            default: 'PENDING',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Packing', packingSchema);
