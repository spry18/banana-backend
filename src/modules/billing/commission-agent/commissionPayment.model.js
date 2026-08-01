'use strict';
const mongoose = require('mongoose');

const commissionPaymentSchema = new mongoose.Schema(
  {
    agentRef:        { type: mongoose.Schema.Types.ObjectId, ref: 'CommissionAgent', default: null },
    agentName:       { type: String, required: true, trim: true },
    date:            { type: Date, required: true, default: Date.now },
    amount:          { type: Number, required: true, min: 0 },
    amountPaid:      { type: Number }, // Alias for amount
    bankName:        { type: String, trim: true },
    bank:            { type: String, trim: true }, // Alias for bankName
    beneficiaryName: { type: String, trim: true },
    accountNo:       { type: String, trim: true },
    paymentMode:     { type: String, trim: true, default: 'Bank Transfer' },
    transactionId:   { type: String, trim: true },
    paidBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remark:          { type: String, trim: true },
  },
  { timestamps: true, collection: 'commission_payments' }
);

commissionPaymentSchema.index({ date: -1 });
commissionPaymentSchema.index({ agentRef: 1 });
commissionPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CommissionPayment', commissionPaymentSchema);
