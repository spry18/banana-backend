'use strict';
const mongoose = require('mongoose');

const munshiPaymentSchema = new mongoose.Schema(
  {
    munshiName:      { type: String, required: true, trim: true },
    munshi:          { type: String, trim: true }, // Alias for munshiName
    munshiRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    date:            { type: Date, required: true, default: Date.now },
    amountPaid:      { type: Number, required: true, min: 0 },
    amount:          { type: Number }, // Alias for amountPaid
    bankName:        { type: String, trim: true },
    bank:            { type: String, trim: true }, // Alias for bankName
    beneficiaryName: { type: String, trim: true },
    accountNo:       { type: String, trim: true },
    paymentMode:     { type: String, trim: true, default: 'Bank Transfer' },
    transactionId:   { type: String, trim: true },
    paidBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remark:          { type: String, trim: true },
  },
  { timestamps: true, collection: 'munshi_payments' }
);

munshiPaymentSchema.index({ date: -1 });
munshiPaymentSchema.index({ munshiName: 1 });
munshiPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MunshiPayment', munshiPaymentSchema);
