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
// Mongoose post-save hook to auto-reconcile linked FarmerBill status
farmerPaymentSchema.post('save', async function (doc) {
  if (doc && doc.farmerBillRef) {
    try {
      const FarmerPayment = mongoose.model('FarmerPayment');
      const FarmerBill = mongoose.model('FarmerBill');
      const allPayments = await FarmerPayment.find({ farmerBillRef: doc.farmerBillRef }).lean();
      const totalPaid = allPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      const bill = await FarmerBill.findById(doc.farmerBillRef).lean();
      if (bill && totalPaid >= (bill.netPayable || 0)) {
        await FarmerBill.findByIdAndUpdate(doc.farmerBillRef, { status: 'PAID' });
      }
    } catch (err) {
      console.error('Error auto-reconciling FarmerBill status:', err);
    }
  }
});

module.exports = mongoose.model('FarmerPayment', farmerPaymentSchema);
