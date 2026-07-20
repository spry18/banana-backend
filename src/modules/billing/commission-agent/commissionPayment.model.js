'use strict';
const mongoose = require('mongoose');

const commissionPaymentSchema = new mongoose.Schema(
  {
    agentRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'CommissionAgent' },
    agentName:      { type: String, required: true, trim: true },
    date:           { type: Date, required: true, default: Date.now },
    amount:         { type: Number, required: true, min: 0 },
    bankName:       { type: String, trim: true },
    beneficiaryName:{ type: String, trim: true },
    accountNo:      { type: String, trim: true },
    remark:         { type: String, trim: true },
  },
  { timestamps: true, collection: 'commission_payments' }
);

commissionPaymentSchema.index({ date: -1 });
commissionPaymentSchema.index({ agentRef: 1 });
commissionPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CommissionPayment', commissionPaymentSchema);
