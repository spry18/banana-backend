'use strict';
const mongoose = require('mongoose');

const kharchiPaymentSchema = new mongoose.Schema(
  {
    expenseRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Kharchi' },
    omExpenseRef:   { type: mongoose.Schema.Types.ObjectId, ref: 'OMKharchi' },
    date:           { type: Date, required: true, default: Date.now },
    term:           { type: String, enum: ['Short', 'Long'], default: 'Short' },
    nature:         { type: String, trim: true },
    totalAmount:    { type: Number, required: true, min: 0 },
    bankName:       { type: String, trim: true },
    beneficiaryName:{ type: String, trim: true },
    accountNo:      { type: String, trim: true },
    paymentMode:    { type: String, trim: true, default: 'Bank Transfer' },
    transactionId: { type: String, trim: true },
    paidBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remark:         { type: String, trim: true },
  },
  { timestamps: true, collection: 'kharchi_payments' }
);

kharchiPaymentSchema.index({ date: -1 });
kharchiPaymentSchema.index({ expenseRef: 1 });
kharchiPaymentSchema.index({ omExpenseRef: 1 });
kharchiPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('KharchiPayment', kharchiPaymentSchema);
