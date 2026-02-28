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
            required: true,
        },
        startTime: {
            type: Date,
            default: Date.now,
        },
        endKm: {
            type: Number,
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
    },
    { timestamps: true }
);

module.exports = mongoose.model('DailyLog', dailyLogSchema);
