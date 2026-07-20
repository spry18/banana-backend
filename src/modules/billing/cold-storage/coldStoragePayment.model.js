'use strict';
const mongoose = require('mongoose');

const coldStoragePaymentSchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    coldStorageName: { type: String, trim: true },
    paymentCycle:    { type: String, trim: true },
    totalAmount:     { type: Number, required: true, min: 0 },
    noOfContainers:  { type: Number, default: 0 },
    bankName:        { type: String, trim: true },
    beneficiaryName: { type: String, trim: true },
    accountNo:       { type: String, trim: true },
    remark:          { type: String, trim: true },
  },
  { timestamps: true, collection: 'cold_storage_payments' }
);

coldStoragePaymentSchema.index({ date: -1 });
coldStoragePaymentSchema.index({ coldStorageName: 1 });
coldStoragePaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ColdStoragePayment', coldStoragePaymentSchema);
