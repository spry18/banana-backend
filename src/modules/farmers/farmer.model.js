const mongoose = require('mongoose');

const farmerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Farmer name is required.'],
            trim: true,
        },
        mobile: {
            type: String,
            required: [true, 'Farmer mobile number is required.'],
            unique: true,
            trim: true,
            match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number.'],
        },
        location: {
            type: String,
            required: [true, 'Farmer location is required.'],
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Farmer', farmerSchema);
