'use strict';
const mongoose = require('mongoose');

const packingProcurementSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    billNo:        { type: String, trim: true },
    companyName:   { type: String, trim: true },
    company:       { type: String, trim: true }, // Alias for companyName
    companyRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    supplier:      { type: String, required: true, trim: true },
    vendorName:    { type: String, trim: true }, // Alias for supplier
    material:      { type: String, trim: true },
    qty:           { type: Number, default: 0 },
    rate:          { type: Number, default: 0 },
    amount:        { type: Number, required: true, min: 0 },
    vehicleNumber: { type: String, trim: true },
    vehicleNo:     { type: String, trim: true }, // Alias for vehicleNumber
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    billPhotoUrl:  { type: String },
    status:        { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
  },
  { timestamps: true, collection: 'packing_procurements' }
);

packingProcurementSchema.index({ date: -1 });
packingProcurementSchema.index({ supplier: 1 });
packingProcurementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PackingProcurement', packingProcurementSchema);
