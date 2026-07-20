'use strict';
const mongoose = require('mongoose');

const eicherPaymentSchema = new mongoose.Schema(
  {
    vehicleNumber:  { type: String, required: true, trim: true },
    vehicleRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    date:           { type: Date, required: true, default: Date.now },
    amountPaid:     { type: Number, required: true, min: 0 },
    bankName:       { type: String, trim: true },
    beneficiaryName:{ type: String, trim: true },
    accountNo:      { type: String, trim: true },
    remark:         { type: String, trim: true },
  },
  { timestamps: true, collection: 'eicher_payments' }
);

eicherPaymentSchema.index({ date: -1 });
eicherPaymentSchema.index({ vehicleNumber: 1 });
eicherPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EicherPayment', eicherPaymentSchema);
