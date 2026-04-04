const mongoose = require('mongoose');

const logisticsSchema = new mongoose.Schema(
    {
        enquiryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Enquiry',
            required: true,
        },
        omId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true,
        },
        purchaseRate: {
            type: Number,
        },
        totalBoxes: {
            type: Number,
            required: true,
        },
        munshiId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        pickupDriverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        vehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vehicle',
            required: true,
        },
        priority: {
            type: String,
            enum: ['LOW', 'MEDIUM', 'HIGH'],
            default: 'MEDIUM',
        },
        lightInTime: {
            type: String,
            default: null,
        },
        lightOutTime: {
            type: String,
            default: null,
        },
        scheduledDate: {
            type: Date,
            default: null,
        },
        isRollover: {
            type: Boolean,
            default: false,
        },
        parentAssignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Logistics',
            default: null,
        },
        teamName: {
            type: String,
            default: null,
        },
        assignmentStatus: {
            type: String,
            enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REJECTED', 'APPROVED'],
            default: 'PENDING',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Logistics', logisticsSchema);
