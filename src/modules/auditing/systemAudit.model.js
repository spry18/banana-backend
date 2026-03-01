const mongoose = require('mongoose');

const systemAuditSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        action: {
            type: String,
            enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'APPROVE', 'REJECT'],
            required: true,
        },
        moduleName: {
            type: String,
            required: true,
        },
        documentId: {
            type: mongoose.Schema.Types.ObjectId,
        },
        details: {
            type: String,
        },
        beforeChange: {
            type: mongoose.Schema.Types.Mixed,
        },
        afterChange: {
            type: mongoose.Schema.Types.Mixed,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('SystemAudit', systemAuditSchema);
