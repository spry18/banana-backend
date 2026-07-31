'use strict';
const mongoose = require('mongoose');

const companyPaymentSchema = new mongoose.Schema(
  {
    date:                { type: Date, required: true, default: Date.now },
    companyName:         { type: String, required: true, trim: true },
    companyRef:          { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    companyBillRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyBill', default: null },
    transactionId:       { type: String, trim: true },
    receivedBankName:    { type: String, trim: true },
    receivedCompanyName: { type: String, trim: true },
    amount:              { type: Number, required: true, min: 0 },
    mode:                { type: String, enum: ['NEFT', 'IMPS', 'Cash', 'Settlement', 'RTGS', 'Cheque'], default: 'NEFT' },
    status:              { type: String, enum: ['VERIFIED', 'PENDING'], default: 'VERIFIED' },
    remark:              { type: String, trim: true },
  },
  { timestamps: true, collection: 'company_payments' }
);

companyPaymentSchema.index({ date: -1 });
companyPaymentSchema.index({ companyName: 1 });
companyPaymentSchema.index({ transactionId: 1 });
companyPaymentSchema.index({ status: 1 });
// Mongoose post-save hook to auto-reconcile linked CompanyBill status
companyPaymentSchema.post('save', async function (doc) {
  if (doc && doc.companyBillRef) {
    try {
      const CompanyPayment = mongoose.model('CompanyPayment');
      const CompanyBill = mongoose.model('CompanyBill');
      const allPayments = await CompanyPayment.find({ companyBillRef: doc.companyBillRef }).lean();
      const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const bill = await CompanyBill.findById(doc.companyBillRef).lean();
      if (bill && totalPaid >= (bill.billAmount || 0)) {
        await CompanyBill.findByIdAndUpdate(doc.companyBillRef, { status: 'PAID' });
      }
    } catch (err) {
      console.error('Error auto-reconciling CompanyBill status:', err);
    }
  }
});

module.exports = mongoose.model('CompanyPayment', companyPaymentSchema);
