'use strict';
const mongoose = require('mongoose');

const packingPaymentSchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    vendorName:      { type: String, required: true, trim: true },
    amount:          { type: Number, required: true, min: 0 },
    bankName:        { type: String, trim: true },
    beneficiaryName: { type: String, trim: true },
    accountNo:       { type: String, trim: true },
    remark:          { type: String, trim: true },
  },
  { timestamps: true, collection: 'packing_payments' }
);

packingPaymentSchema.index({ date: -1 });
packingPaymentSchema.index({ vendorName: 1 });
packingPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PackingPayment', packingPaymentSchema);
