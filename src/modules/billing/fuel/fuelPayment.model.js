'use strict';
const mongoose = require('mongoose');

const fuelPaymentSchema = new mongoose.Schema(
  {
    fuelAdvanceId:    { type: mongoose.Schema.Types.ObjectId, default: null }, // Generic reference ID
    fuelEntryRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'FuelEntry', default: null },
    petrolAdvanceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'PetrolAdvance', default: null },
    dieselAdvanceRef: { type: mongoose.Schema.Types.ObjectId, ref: 'DieselAdvance', default: null },
    date:             { type: Date, required: true, default: Date.now },
    pumpName:         { type: String, required: true, trim: true },
    paymentCycle:     { type: String, trim: true },
    cycle:            { type: String, trim: true }, // Alias for paymentCycle
    totalAmount:      { type: Number, required: true, min: 0 },
    amount:           { type: Number }, // Alias for totalAmount
    bankName:         { type: String, trim: true },
    bank:             { type: String, trim: true }, // Alias for bankName
    beneficiaryName:  { type: String, trim: true },
    accountNo:        { type: String, trim: true },
    paymentMode:     { type: String, trim: true, default: 'Bank Transfer' },
    transactionId:  { type: String, trim: true },
    paidBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    remark:           { type: String, trim: true },
  },
  { timestamps: true, collection: 'fuel_payments' }
);

fuelPaymentSchema.index({ date: -1 });
fuelPaymentSchema.index({ pumpName: 1 });
fuelPaymentSchema.index({ fuelAdvanceId: 1 });
fuelPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FuelPayment', fuelPaymentSchema);
