const mongoose = require('mongoose');

const routeSubSchema = new mongoose.Schema(
    {
        startPoint: { type: String, required: true },
        midPoint: { type: String, default: '' },
        destination: { type: String, required: true },
        task: { type: String, default: '' },
        teamName: { type: String, default: '' },
    },
    { _id: false }
);

const tripSchema = new mongoose.Schema(
    {
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        assignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Logistics',
            required: true,
        },
        driverType: {
            type: String,
            enum: ['Eicher', 'Pickup'],
            required: true,
        },
        isBackupTrip: {
            type: Boolean,
            default: false,
        },
        parentTripId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Trip',
            default: null,
        },
        teamMembers: {
            type: String,
            default: '',
        },
        // Flat route fields (Eicher — single route)
        startRoute: {
            type: String,
            default: '',
        },
        midRoute: {
            type: String,
        },
        destination: {
            type: String,
            default: '',
        },
        // Multi-route array (Pickup — multiple stops)
        routes: {
            type: [routeSubSchema],
            default: [],
        },
        totalKm: {
            type: Number,
            required: true,
            max: [999, 'Total KM cannot exceed 3 digits (999 KM)'],
            min: [0, 'Total KM cannot be negative'],
        },
        tollExpense: {
            type: Number,
            default: 0,
            max: [999, 'Toll expense cannot exceed 3 digits (999)'],
            min: [0, 'Toll expense cannot be negative'],
        },
        isHault: {
            type: Boolean,
            default: false,
        },
        isLineCancel: {
            type: Boolean,
            default: false,
        },
        farmerBoxBreakdown: {
            type: [
                {
                    farmerName: { type: String, required: true },
                    boxCount: { type: Number, required: true },
                },
            ],
            default: [],
        },
        // Eicher file uploads
        weightSlipUrl: {
            type: String,
            default: null,
        },
        dieselSlipUrl: {
            type: String,
            default: null,
        },
        unloadSlipUrl: {
            type: String,
            default: null,
        },
        // Pickup file uploads
        uploadSlipUrl: {
            type: String,
            default: null,
        },
        meterPhotoUrl: {
            type: String,
            default: null,
        },
        tollSlipUrl: {
            type: String,
            default: null,
        },
        // Shared
        endKmPhotoUrl: {
            type: String,
            default: null,
        },
        isLocked: {
            type: Boolean,
            default: true,
        },
        systemReportUrl: {
            type: String,
        },
        // OM Review fields
        reviewStatus: {
            type: String,
            enum: ['PENDING', 'APPROVED', 'REJECTED'],
            default: 'PENDING',
        },
        reviewNote: {
            type: String,
            default: '',
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Trip', tripSchema);
