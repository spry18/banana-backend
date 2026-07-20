'use strict';
const mongoose = require('mongoose');

const eicherTripSchema = new mongoose.Schema(
  {
    date:          { type: Date, required: true, default: Date.now },
    vehicleNumber: { type: String, required: true, trim: true },
    vehicleRef:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    route:         { type: String, trim: true },
    km:            { type: Number, default: 0 },
    toll:          { type: Number, default: 0 },
    hault:         { type: Number, default: 0 },
    dieselAdvance: { type: Number, default: 0 },
    lineCancel:    { type: Number, default: 0 },
    netPayable:    { type: Number, default: 0 },
    period:        { type: String, enum: ['Daily', 'Weekly', 'Monthly'], default: 'Daily' },
  },
  { timestamps: true, collection: 'eicher_trips' }
);

eicherTripSchema.index({ date: -1 });
eicherTripSchema.index({ vehicleNumber: 1, date: -1 });
eicherTripSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EicherTrip', eicherTripSchema);
