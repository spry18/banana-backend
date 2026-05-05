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
        box5Kg: {
            type: Number,
            default: 0,
        },
        box13Kg: {
            type: Number,
            default: 0,
        },
        box13_5Kg: {
            type: Number,
            default: 0,
        },
        box14Kg: {
            type: Number,
            default: 0,
        },
        box16Kg: {
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
        lineNo: {
            type: String,
            default: '',
        },
        teamName: {
            type: String,
            default: '',
        },
        brandId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
        },
        status: {
            type: String,
            enum: ['PENDING', 'SUBMITTED', 'CANCELLED', 'REJECTED', 'APPROVED'],
            default: 'PENDING',
        },
        omRemark: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Packing', packingSchema);
