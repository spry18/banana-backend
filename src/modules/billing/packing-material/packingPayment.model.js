'use strict';
const mongoose = require('mongoose');

const packingPaymentSchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    vendorName:      { type: String, required: true, trim: true },
    supplier:        { type: String, trim: true }, // Alias for vendorName
    vendorRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
  { timestamps: true, collection: 'packing_payments' }
);

packingPaymentSchema.index({ date: -1 });
packingPaymentSchema.index({ vendorName: 1 });
packingPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PackingPayment', packingPaymentSchema);
