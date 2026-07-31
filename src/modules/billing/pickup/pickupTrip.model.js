'use strict';
const mongoose = require('mongoose');

const pickupTripSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    vehicleNumber: { type: String, required: true, trim: true },
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    assignmentRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Logistics', default: null },
    enquiryRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    enquiryId:     { type: String, trim: true },
    tripRef:       { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', default: null },
    driver:        { type: String, trim: true },
    driverRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    route1:        { type: String, trim: true },
    route2:        { type: String, trim: true },
    km:            { type: Number, default: 0 },
    ratePerKm:     { type: Number, default: 0 },
    fuel:          { type: Number, default: 0 },
    toll:          { type: Number, default: 0 },
    amount:        { type: Number, default: 0 },
    status:        { type: String, enum: ['PENDING', 'APPROVED', 'PAID'], default: 'PENDING' },
  },
  { timestamps: true, collection: 'pickup_trips' }
);

// Mongoose Pre-save hook: Auto-calculate amount if not explicitly set
pickupTripSchema.pre('save', function (next) {
  if (!this.amount) {
    const rate = this.ratePerKm || 15;
    const kmCost = (this.km || 0) * rate;
    const grossPayable = kmCost + (this.toll || 0);
    this.amount = Math.max(0, Math.round(grossPayable - (this.fuel || 0)));
  }
  if (typeof next === 'function') next();
});

pickupTripSchema.index({ date: -1 });
pickupTripSchema.index({ vehicleNumber: 1, date: -1 });
pickupTripSchema.index({ assignmentRef: 1 });
pickupTripSchema.index({ status: 1 });
pickupTripSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PickupTrip', pickupTripSchema);
