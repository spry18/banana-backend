'use strict';
const mongoose = require('mongoose');

const fuelPaymentSchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    pumpName:        { type: String, required: true, trim: true },
    paymentCycle:    { type: String, trim: true },
    totalAmount:     { type: Number, required: true, min: 0 },
    bankName:        { type: String, trim: true },
    beneficiaryName: { type: String, trim: true },
    accountNo:       { type: String, trim: true },
    remark:          { type: String, trim: true },
  },
  { timestamps: true, collection: 'fuel_payments' }
);

fuelPaymentSchema.index({ date: -1 });
fuelPaymentSchema.index({ pumpName: 1 });
fuelPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FuelPayment', fuelPaymentSchema);
