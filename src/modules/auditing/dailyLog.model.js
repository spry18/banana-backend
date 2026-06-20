const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        startKm: {
            type: Number,
            required: true,
        },
        startMeterPhotoUrl: {
            type: String,
            required: false,
        },
        startTime: {
            type: Date,
            default: Date.now,
        },
        endKm: {
            type: Number,
            validate: {
                validator: function(value) {
                    if (value == null) return true;
                    return (value - this.startKm) <= 999;
                },
                message: 'Total daily KM (endKm - startKm) cannot exceed 3 digits (999 KM)'
            }
        },
        endMeterPhotoUrl: {
            type: String,
        },
        endTime: {
            type: Date,
        },
        status: {
            type: String,
            enum: ['STARTED', 'COMPLETED'],
            default: 'STARTED',
        },
        vehicleNumber: {
            type: String,
            default: null,
        },
        // Field Selector morning report — petrol expense tracking
        petrolAdvance: {
            type: Number,
            default: null,
        },
        petrolReceiptPhoto: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('DailyLog', dailyLogSchema);
