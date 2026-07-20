'use strict';
const mongoose = require('mongoose');

const commissionAgentSchema = new mongoose.Schema(
  {
    agentName:           { type: String, required: true, trim: true },
    agentRef:            { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null },
    harvestType:         { type: String, trim: true },
    commissionStructure: { type: String, enum: ['Per box', '% of value', 'Fixed'], default: 'Per box' },
    commissionValue:     { type: Number, default: 0 },
    totalBusiness:       { type: Number, default: 0 },
    totalCommission:     { type: Number, default: 0 },
    isActive:            { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'commission_agents' }
);

commissionAgentSchema.index({ isActive: 1 });
commissionAgentSchema.index({ agentName: 1 });
commissionAgentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CommissionAgent', commissionAgentSchema);
