'use strict';
const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    employeeRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'BillingEmployee', required: true },
    employeeName:     { type: String, trim: true },
    month:            { type: String, required: true }, // 'YYYY-MM'
    salaryAmount:     { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    totalPayable:     { type: Number, default: 0 },
    bankName:         { type: String, trim: true },
    status:           { type: String, enum: ['Paid', 'Pending'], default: 'Pending' },
    paidAt:           { type: Date },
  },
  { timestamps: true, collection: 'billing_payroll' }
);

payrollSchema.index({ employeeRef: 1, month: -1 });
payrollSchema.index({ month: -1 });
payrollSchema.index({ status: 1 });
payrollSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payroll', payrollSchema);
