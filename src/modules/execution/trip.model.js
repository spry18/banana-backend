const mongoose = require('mongoose');

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
            type: String, // E.g., names of helpers
            required: true,
        },
        startRoute: {
            type: String,
            required: true,
        },
        midRoute: {
            type: String,
        },
        destination: {
            type: String,
            required: true,
        },
        totalKm: {
            type: Number,
            required: true,
        },
        tollExpense: {
            type: Number,
            required: true,
        },
        farmerBoxBreakdown: {
            type: [
                {
                    farmerName: { type: String, required: true },
                    boxCount: { type: Number, required: true },
                },
            ],
            required: true,
        },
        weightSlipUrl: {
            type: String,
            required: true,
        },
        dieselSlipUrl: {
            type: String,
            required: true,
        },
        unloadSlipUrl: {
            type: String,
        },
        isLocked: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Trip', tripSchema);
