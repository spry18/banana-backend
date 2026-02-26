const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
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

module.exports = mongoose.model('Company', companySchema);
