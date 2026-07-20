'use strict';
const mongoose = require('mongoose');

const farmerPaymentSchema = new mongoose.Schema(
  {
    farmerBillRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'FarmerBill' },
    farmerName:     { type: String, required: true, trim: true },
    farmerRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null },
    date:           { type: Date, required: true, default: Date.now },
    amountPaid:     { type: Number, required: true, min: 0 },
    bankName:       { type: String, trim: true },
    beneficiaryName:{ type: String, trim: true },
    accountNo:      { type: String, trim: true },
    submittedDate:  { type: Date },
    remark:         { type: String, trim: true },
    isCompleted:    { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'farmer_payments' }
);

farmerPaymentSchema.index({ date: -1 });
farmerPaymentSchema.index({ farmerBillRef: 1 });
farmerPaymentSchema.index({ farmerName: 1 });
farmerPaymentSchema.index({ isCompleted: 1 });
farmerPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FarmerPayment', farmerPaymentSchema);
