'use strict';
const mongoose = require('mongoose');

const companyBillSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    farmerName:    { type: String, trim: true },
    farmerContact: { type: String, trim: true },
    farmerRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Farmer', default: null },
    enquiryRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    assignmentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Logistics', default: null },
    enquiryId:     { type: String, trim: true },
    location:      { type: String, trim: true },
    vehicleNumber: { type: String, trim: true },
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    companyName:   { type: String, required: true, trim: true },
    companyRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    rate:          { type: Number, default: 0 },
    packingType:   { type: String, enum: ['13 kg', '13.5 kg', '14 kg', '16 kg', '13 KG', '13.5 KG', '14 KG', '16 KG', 'Other'], default: '13 kg' },
    boxes:         { type: Number, default: 0 },
    totalWeight:   { type: Number, default: 0 },
    grossWeight:   { type: Number, default: 0 },
    billAmount:    { type: Number, default: 0 },
    status:        { type: String, enum: ['PENDING', 'SUBMITTED', 'PAID'], default: 'PENDING' },
    isClubBill:    { type: Boolean, default: false },
    clubVehicles:  [{ type: String }],
    invoiceNo:     { type: String, sparse: true },
    pdfUrl:        { type: String },
    invoiceUrl:    { type: String },
  },
  { timestamps: true, collection: 'company_bills' }
);

// Mongoose Pre-save hook to calculate billAmount
companyBillSchema.pre('save', function (next) {
  this.billAmount = Math.round(this.totalWeight * this.rate * 100) / 100;
  if (typeof next === 'function') next();
});

companyBillSchema.index({ date: -1 });
companyBillSchema.index({ companyName: 1, date: -1 });
companyBillSchema.index({ status: 1 });
companyBillSchema.index({ vehicleNumber: 1 });
companyBillSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CompanyBill', companyBillSchema);
