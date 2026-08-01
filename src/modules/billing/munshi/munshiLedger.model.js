'use strict';
const mongoose = require('mongoose');

const munshiLedgerSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    farmerName:    { type: String, trim: true },
    farmer:        { type: String, trim: true }, // Alias for farmerName
    farmerRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null },
    munshiName:    { type: String, required: true, trim: true },
    munshi:        { type: String, trim: true }, // Alias for munshiName
    munshiRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    companyName:   { type: String, trim: true },
    company:       { type: String, trim: true }, // Alias for companyName
    companyRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    boxes:         { type: Number, default: 0 },
    vehicleNumber: { type: String, trim: true },
    vehicleNo:     { type: String, trim: true }, // Alias for vehicleNumber
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    amountPayable: { type: Number, default: 0 },
    amount:        { type: Number }, // Alias for amountPayable
    status:        { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
  },
  { timestamps: true, collection: 'munshi_ledger' }
);

munshiLedgerSchema.index({ date: -1 });
munshiLedgerSchema.index({ munshiName: 1, date: -1 });
munshiLedgerSchema.index({ status: 1 });
munshiLedgerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MunshiLedger', munshiLedgerSchema);
