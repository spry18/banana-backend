'use strict';
const mongoose = require('mongoose');

const companyPaymentSchema = new mongoose.Schema(
  {
    date:                { type: Date, required: true, default: Date.now },
    companyName:         { type: String, required: true, trim: true },
    companyRef:          { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    transactionId:       { type: String, trim: true },
    receivedBankName:    { type: String, trim: true },
    receivedCompanyName: { type: String, trim: true },
    amount:              { type: Number, required: true, min: 0 },
    mode:                { type: String, enum: ['NEFT', 'IMPS', 'Cash', 'Settlement', 'RTGS', 'Cheque'], default: 'NEFT' },
    status:              { type: String, enum: ['VERIFIED', 'PENDING'], default: 'PENDING' },
    remark:              { type: String, trim: true },
  },
  { timestamps: true, collection: 'company_payments' }
);

companyPaymentSchema.index({ date: -1 });
companyPaymentSchema.index({ companyName: 1 });
companyPaymentSchema.index({ transactionId: 1 });
companyPaymentSchema.index({ status: 1 });
companyPaymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CompanyPayment', companyPaymentSchema);
