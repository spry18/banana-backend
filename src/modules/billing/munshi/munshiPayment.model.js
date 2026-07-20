'use strict';
const mongoose = require('mongoose');

const munshiPaymentSchema = new mongoose.Schema(
  {
    munshiName:     { type: String, required: true, trim: true },
    munshiRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    date:           { type: Date, required: true, default: Date.now },
    amountPaid:     { type: Number, required: true, min: 0 },
    bankName:       { type: String, trim: true },
    beneficiaryName:{ type: String, trim: true },
    accountNo:      { type: String, trim: true },
    remark:         { type: String, trim: true },
  },
  { timestamps: true, collection: 'munshi_payments' }
);

munshiPaymentSchema.index({ date: -1 });
munshiPaymentSchema.index({ munshiName: 1 });
munshiPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MunshiPayment', munshiPaymentSchema);
