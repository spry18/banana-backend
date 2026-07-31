'use strict';
const mongoose = require('mongoose');

const pickupPaymentSchema = new mongoose.Schema(
  {
    tripRef:        { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    driverRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    vehicleNumber:  { type: String, trim: true },
    vehicleNo:      { type: String, trim: true }, // Alias for vehicleNumber
    vehicleRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    date:           { type: Date, required: true, default: Date.now },
    amountPaid:     { type: Number, required: true, min: 0 },
    bankName:       { type: String, trim: true },
    beneficiaryName:{ type: String, trim: true },
    accountNo:      { type: String, trim: true },
    paymentMode:    { type: String, trim: true, default: 'Bank Transfer' },
    transactionId: { type: String, trim: true },
    paidBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remark:         { type: String, trim: true },
  },
  { timestamps: true, collection: 'pickup_payments' }
);

pickupPaymentSchema.index({ date: -1 });
pickupPaymentSchema.index({ vehicleNumber: 1 });
pickupPaymentSchema.index({ tripRef: 1 });
pickupPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PickupPayment', pickupPaymentSchema);
