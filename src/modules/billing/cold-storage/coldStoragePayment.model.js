'use strict';
const mongoose = require('mongoose');

const coldStoragePaymentSchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    coldStorageName: { type: String, trim: true },
    storage:         { type: String, trim: true }, // Alias for coldStorageName
    companyName:     { type: String, trim: true },
    company:         { type: String, trim: true }, // Alias for companyName
    paymentCycle:    { type: String, trim: true },
    cycle:           { type: String, trim: true }, // Alias for paymentCycle
    totalAmount:     { type: Number, required: true, min: 0 },
    amount:          { type: Number }, // Alias for totalAmount
    noOfContainers:  { type: Number, default: 0 },
    containers:      { type: Number }, // Alias for noOfContainers
    bankName:        { type: String, trim: true },
    bank:            { type: String, trim: true }, // Alias for bankName
    beneficiaryName: { type: String, trim: true },
    accountNo:       { type: String, trim: true },
    paymentMode:     { type: String, trim: true, default: 'Bank Transfer' },
    transactionId:   { type: String, trim: true },
    paidBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remark:          { type: String, trim: true },
  },
  { timestamps: true, collection: 'cold_storage_payments' }
);

coldStoragePaymentSchema.index({ date: -1 });
coldStoragePaymentSchema.index({ coldStorageName: 1 });
coldStoragePaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ColdStoragePayment', coldStoragePaymentSchema);
