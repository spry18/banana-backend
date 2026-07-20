'use strict';
const mongoose = require('mongoose');

const farmerBillSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    farmerName:    { type: String, required: true, trim: true },
    farmerContact: { type: String, trim: true },
    farmerRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null },
    location:      { type: String, trim: true },
    companyName:   { type: String, trim: true },
    companyRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    vehicleNumber: { type: String, trim: true },
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    packingType:   { type: String, enum: ['13 KG', '13.5 KG', '14 KG', '16 KG', 'Other'], default: '13 KG' },
    boxes:         { type: Number, default: 0 },
    totalWeight:   { type: Number, default: 0 },
    grossWeight:   { type: Number, default: 0 },
    wastage:       { type: Number, default: 0 },
    netWeight:     { type: Number, default: 0 },
    danda:         { type: Number, default: 0 },
    remainingWeight: { type: Number, default: 0 },
    rate:          { type: Number, default: 0 },
    transport:     { type: Number, default: 0 },
    initialAmount: { type: Number, default: 0 },
    totalAmount:   { type: Number, default: 0 },
    netPayable:    { type: Number, default: 0 },
    status:        { type: String, enum: ['PENDING', 'SENT', 'PAID'], default: 'PENDING' },
    sentDate:      { type: Date },
    note:          { type: String, trim: true },
    pdfUrl:        { type: String },
    receiptUrl:    { type: String },
  },
  { timestamps: true, collection: 'farmer_bills' }
);

// Mongoose Pre-save hook to ensure mathematical calculations on the backend
farmerBillSchema.pre('save', function (next) {
  // 1. Calculate net weight: totalWeight (or grossWeight) - wastage
  this.netWeight = Math.max(0, this.totalWeight - this.wastage);
  
  // 2. Calculate remaining weight: netWeight - danda
  this.remainingWeight = Math.max(0, this.netWeight - this.danda);
  
  // 3. Calculate initial amount: remainingWeight * rate
  this.initialAmount = Math.round(this.remainingWeight * this.rate * 100) / 100;
  this.totalAmount = this.initialAmount;
  
  // 4. Calculate net payable: totalAmount - transport
  this.netPayable = Math.max(0, Math.round((this.totalAmount - this.transport) * 100) / 100);
  
  next();
});

farmerBillSchema.index({ date: -1 });
farmerBillSchema.index({ status: 1 });
farmerBillSchema.index({ farmerName: 1, date: -1 });
farmerBillSchema.index({ status: 1, sentDate: 1 });
farmerBillSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FarmerBill', farmerBillSchema);
