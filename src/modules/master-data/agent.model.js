const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
    {
        agentName: {
            type: String,
            required: true,
        },
        mobileNo: {
            type: String,
            required: true,
            match: [/^\d{10}$/, 'Valid 10 digit mobile number required'],
        },
        contactPerson: {
            type: String,
            required: true,
        },
        location: {
            type: String,
            required: true,
        },
        notes: {
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

module.exports = mongoose.model('Agent', agentSchema);
