'use strict';
const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    name:                 { type: String, required: true, trim: true },
    role:                 { type: String, trim: true },
    monthlySalary:        { type: Number, default: 0 },
    joiningDate:          { type: Date },
    commissionType:       { type: String, enum: ['Per box', 'Fixed', 'None'], default: 'None' },
    commissionValue:      { type: Number, default: 0 },
    petrolAllowance:      { type: Number, default: 0 },
    maintenanceAllowance: { type: Number, default: 0 },
    bankName:             { type: String, trim: true },
    accountNo:            { type: String, trim: true },
    isActive:             { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'billing_employees' }
);

employeeSchema.index({ isActive: 1 });
employeeSchema.index({ role: 1 });
employeeSchema.index({ name: 1 });
employeeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BillingEmployee', employeeSchema);
