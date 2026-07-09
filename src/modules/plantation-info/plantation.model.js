const mongoose = require('mongoose');

const farmerPlantationSchema = new mongoose.Schema(
    {
        farmerName: {
            type: String,
            required: [true, 'Farmer name is required.'],
            trim: true,
        },
        location: {
            type: String,
            required: [true, 'Location is required.'],
            trim: true,
        },
        mobileNo: {
            type: String,
            required: [true, 'Mobile number is required.'],
            trim: true,
            match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number.'],
        },
        totalPlants: {
            type: Number,
            required: [true, 'Total plant count is required.'],
            min: [1, 'Plant count must be at least 1.'],
        },
        spacing: {
            type: String,
            required: [true, 'Spacing is required.'],
            trim: true,
        },
        plantationDate: {
            type: Date,
            required: [true, 'Plantation date is required.'],
        },
        acres: {
            type: Number,
            required: [true, 'Total area in acres is required.'],
            min: [0, 'Area cannot be negative.'],
        },
        variety: {
            type: String,
            required: [true, 'Variety is required.'],
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('FarmerPlantation', farmerPlantationSchema);
