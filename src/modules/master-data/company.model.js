const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: true,
        },
        legalName: {
            type: String,
        },
        taxId: {
            type: String,
        },
        headquarters: {
            type: String,
            required: true,
        },
        procurementNotes: {
            type: String,
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
