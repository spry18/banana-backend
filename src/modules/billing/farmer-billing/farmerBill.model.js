'use strict';
const mongoose = require('mongoose');

const farmerBillSchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    farmerName:      { type: String, required: true, trim: true },
    farmerContact:   { type: String, trim: true },
    farmerRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null },
    enquiryRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    assignmentRef:   { type: mongoose.Schema.Types.ObjectId, ref: 'Logistics', default: null },
    enquiryId:       { type: String, trim: true },
    location:        { type: String, trim: true },
    companyName:     { type: String, trim: true },
    companyRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    vehicleNumber:   { type: String, trim: true },
    vehicleRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    packingType:     { type: String, enum: ['13 KG', '13.5 KG', '14 KG', '16 KG', '7 KG', '5 KG', '4H', '5H', '6H', '8H', 'CL', 'Other'], default: '13 KG' },
    boxes:           { type: Number, default: 0 },
    vehicleWeight:   { type: Number, default: 0 },
    totalWeight:     { type: Number, default: 0 },
    grossWeight:     { type: Number, default: 0 },
    wastage:         { type: Number, default: 0 },
    netWeight:       { type: Number, default: 0 },
    danda:           { type: Number, default: 0 },
    remainingWeight: { type: Number, default: 0 },
    rate:            { type: Number, default: 0 },
    transport:       { type: Number, default: 0 },
    initialAmount:   { type: Number, default: 0 },
    totalAmount:     { type: Number, default: 0 },
    netPayable:      { type: Number, default: 0 },
    status:          { type: String, enum: ['PENDING', 'SENT', 'PAID'], default: 'PENDING' },
    sentDate:        { type: Date },
    note:            { type: String, trim: true },
    pdfUrl:          { type: String },
    receiptUrl:      { type: String },
  },
  { timestamps: true, collection: 'farmer_bills' }
);

// Mongoose Pre-save hook to ensure mathematical calculations match the UI specification
farmerBillSchema.pre('save', function (next) {
  const boxes = this.boxes || 0;
  const gross = this.vehicleWeight || this.grossWeight || this.totalWeight || 0;
  this.vehicleWeight = gross;
  this.grossWeight = gross;

  // 1. Remaining Weight = Gross Vehicle Weight - Box Tare (1kg per box)
  this.remainingWeight = Math.max(0, gross - boxes);

  // 2. Net Weight (before Danda) = Remaining Weight + Wastage
  this.netWeight = this.remainingWeight + (this.wastage || 0);

  // 3. Final Total Weight = Net Weight + Danda
  const finalTotalWeight = this.netWeight + (this.danda || 0);
  this.totalWeight = finalTotalWeight;

  // 4. Initial Amount / First Amount = Final Total Weight * Rate
  this.initialAmount = Math.round(finalTotalWeight * (this.rate || 0) * 100) / 100;
  this.totalAmount = this.initialAmount;

  // 5. Net Payable / Net Amount = Initial Amount - Transport (rounded to nearest integer)
  this.netPayable = Math.max(0, Math.round(this.initialAmount - (this.transport || 0)));

  if (typeof next === 'function') next();
});

farmerBillSchema.index({ date: -1 });
farmerBillSchema.index({ status: 1 });
farmerBillSchema.index({ farmerName: 1, date: -1 });
farmerBillSchema.index({ status: 1, sentDate: 1 });
farmerBillSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FarmerBill', farmerBillSchema);
