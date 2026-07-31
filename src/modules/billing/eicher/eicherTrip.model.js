'use strict';
const mongoose = require('mongoose');

const eicherTripSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    vehicleNumber: { type: String, required: true, trim: true },
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    assignmentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Logistics', default: null },
    enquiryRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    enquiryId:     { type: String, trim: true },
    tripRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    driverName:    { type: String, trim: true },
    driverRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    route:         { type: String, trim: true },
    km:            { type: Number, default: 0 },
    ratePerKm:     { type: Number, default: 0 },
    toll:          { type: Number, default: 0 },
    hault:         { type: Number, default: 0 },
    dieselAdvance: { type: Number, default: 0 },
    lineCancel:    { type: Number, default: 0 },
    netPayable:    { type: Number, default: 0 },
    status:        { type: String, enum: ['PENDING', 'APPROVED', 'PAID'], default: 'PENDING' },
    period:        { type: String, enum: ['Daily', 'Weekly', 'Monthly'], default: 'Daily' },
  },
  { timestamps: true, collection: 'eicher_trips' }
);

// Mongoose Pre-save hook: Auto-calculate netPayable if not explicitly set
eicherTripSchema.pre('save', function (next) {
  if (!this.netPayable) {
    const kmCost = (this.km || 0) * (this.ratePerKm || 0);
    const grossPayable = kmCost + (this.toll || 0) + (this.hault || 0);
    this.netPayable = Math.max(0, Math.round(grossPayable - (this.dieselAdvance || 0)));
  }
  if (typeof next === 'function') next();
});

eicherTripSchema.index({ date: -1 });
eicherTripSchema.index({ vehicleNumber: 1, date: -1 });
eicherTripSchema.index({ assignmentRef: 1 });
eicherTripSchema.index({ status: 1 });
eicherTripSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EicherTrip', eicherTripSchema);
