const mongoose = require('mongoose');

const logisticsSchema = new mongoose.Schema(
    {
        enquiryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Enquiry',
            required: true,
            unique: true,
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
            required: true,
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
            required: true,
        },
        lightOutTime: {
            type: String,
            required: true,
        },
        assignmentStatus: {
            type: String,
            enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
            default: 'PENDING',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Logistics', logisticsSchema);
