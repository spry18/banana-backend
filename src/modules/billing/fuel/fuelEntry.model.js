'use strict';
const mongoose = require('mongoose');

const fuelEntrySchema = new mongoose.Schema(
  {
    date:            { type: Date, required: true, default: Date.now },
    vehicleNumber:   { type: String, required: true, trim: true },
    vehicleNo:       { type: String, trim: true }, // Alias
    vehicleRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    pumpName:        { type: String, trim: true },
    fuelType:        { type: String, enum: ['Petrol', 'Diesel'], default: 'Diesel' },
    rate:            { type: Number, default: 0 },
    amount:          { type: Number, required: true, min: 0 },
    remark:          { type: String, trim: true },
    paymentCycle:    { type: String, trim: true },
    cycle:           { type: String, trim: true }, // Alias
    period:          { type: String, enum: ['Daily', 'Weekly', '15Days', 'Monthly'], default: 'Daily' },
    omRef:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driverRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    receiptPhotoUrl: { type: String, default: null },
    status:          { type: String, enum: ['Pending', 'Approved', 'Paid'], default: 'Approved' },
  },
  { timestamps: true, collection: 'fuel_entries' }
);

fuelEntrySchema.index({ date: -1 });
fuelEntrySchema.index({ pumpName: 1, paymentCycle: 1 });
fuelEntrySchema.index({ vehicleNumber: 1, date: -1 });
fuelEntrySchema.index({ fuelType: 1 });
fuelEntrySchema.index({ createdAt: -1 });

module.exports = mongoose.model('FuelEntry', fuelEntrySchema);
