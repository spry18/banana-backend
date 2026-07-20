'use strict';
const mongoose = require('mongoose');

const pickupPaymentSchema = new mongoose.Schema(
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
  { timestamps: true, collection: 'pickup_payments' }
);

pickupPaymentSchema.index({ date: -1 });
pickupPaymentSchema.index({ vehicleNumber: 1 });
pickupPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PickupPayment', pickupPaymentSchema);
