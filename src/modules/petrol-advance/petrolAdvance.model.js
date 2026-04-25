const mongoose = require('mongoose');

const petrolAdvanceSchema = new mongoose.Schema(
    {
        // Who issued the advance
        omId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Who received the advance (Field Selector)
        fieldSelectorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Vehicle the advance is for (optional for Field Selectors)
        vehicleNumber: {
            type: String,
            trim: true,
            default: null,
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

module.exports = mongoose.model('PetrolAdvance', petrolAdvanceSchema);
