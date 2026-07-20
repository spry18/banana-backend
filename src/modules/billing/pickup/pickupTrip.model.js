'use strict';
const mongoose = require('mongoose');

const pickupTripSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    vehicleNumber: { type: String, required: true, trim: true },
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    driver:        { type: String, trim: true },
    driverRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    route1:        { type: String, trim: true },
    route2:        { type: String, trim: true },
    km:            { type: Number, default: 0 },
    fuel:          { type: Number, default: 0 },
    toll:          { type: Number, default: 0 },
    amount:        { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'pickup_trips' }
);

pickupTripSchema.index({ date: -1 });
pickupTripSchema.index({ vehicleNumber: 1, date: -1 });
pickupTripSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PickupTrip', pickupTripSchema);
