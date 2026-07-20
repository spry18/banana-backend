'use strict';
const mongoose = require('mongoose');

const kharchiSchema = new mongoose.Schema(
  {
    date:       { type: Date, required: true, default: Date.now },
    type:       { type: String, enum: ['Small', 'Big'], required: true },
    nature:     { type: String, required: true, trim: true },
    payTo:      { type: String, trim: true },
    purchased:  { type: String, trim: true },
    term:       { type: String, enum: ['Short', 'Long'], default: 'Short' },
    amount:     { type: Number, required: true, min: 0 },
    status:     { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Paid'], default: 'Pending' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    remark:     { type: String, trim: true },
  },
  { timestamps: true, collection: 'kharchi_expenses' }
);

kharchiSchema.index({ date: -1 });
kharchiSchema.index({ status: 1, type: 1 });
kharchiSchema.index({ term: 1 });
kharchiSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Kharchi', kharchiSchema);
