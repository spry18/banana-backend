const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
    {
        vehicleNumber: {
            type: String,
            required: true,
            unique: true,
        },
        vehicleType: {
            type: String,
            enum: ['Eicher', 'Pickup'],
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Vehicle', vehicleSchema);
