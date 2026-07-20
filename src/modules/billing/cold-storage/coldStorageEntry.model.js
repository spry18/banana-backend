'use strict';
const mongoose = require('mongoose');

const coldStorageEntrySchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    coldStorageName: { type: String, required: true, trim: true },
    vehicleNumber:   { type: String, trim: true },
    vehicleRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    receiptNo:       { type: String, trim: true },
    containerNo:     { type: String, trim: true },
    companyName:     { type: String, trim: true },
    companyRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    brandName:       { type: String, trim: true },
    brandRef:        { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
    kgBoxes:         { type: Number, default: 0 },
    total4h5h6h:     { type: Number, default: 0 },
    total7h8h:       { type: Number, default: 0 },
    time:            { type: String, trim: true },
    amount:          { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'cold_storage_entries' }
);

coldStorageEntrySchema.index({ date: -1 });
coldStorageEntrySchema.index({ coldStorageName: 1, date: -1 });
coldStorageEntrySchema.index({ createdAt: -1 });

module.exports = mongoose.model('ColdStorageEntry', coldStorageEntrySchema);
