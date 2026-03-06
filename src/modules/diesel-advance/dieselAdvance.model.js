const mongoose = require('mongoose');

const dieselAdvanceSchema = new mongoose.Schema(
    {
        // Who issued the advance
        omId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Who received the advance
        driverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Which logistics assignment this advance is for (optional — can issue standalone)
        assignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Logistics',
            default: null,
        },
        // Vehicle the advance is for
        vehicleNumber: {
            type: String,
            required: true,
            trim: true,
        },
        // Advance amount in INR
        amount: {
            type: Number,
            required: true,
            min: [1, 'Amount must be at least ₹1'],
        },
        // Optional reason / notes
        remark: {
            type: String,
            trim: true,
            default: '',
        },
        // Receipt photo URL (uploaded by OM)
        receiptPhotoUrl: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('DieselAdvance', dieselAdvanceSchema);
