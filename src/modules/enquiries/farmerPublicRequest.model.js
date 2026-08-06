'use strict';
const mongoose = require('mongoose');

const farmerPublicRequestSchema = new mongoose.Schema(
  {
    requestNo: {
      type: String,
      required: true,
      unique: true,
    },
    farmerName: {
      type: String,
      required: [true, 'Farmer name is required'],
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number'],
      trim: true,
    },
    village: {
      type: String,
      required: [true, 'Village / Location is required'],
      trim: true,
    },
    totalPlants: {
      type: Number,
      required: [true, 'Total plants count is required'],
      min: [1, 'Plant count must be at least 1'],
    },
    variation: {
      type: String,
      enum: ['Mother', 'F1', 'Other'],
      default: 'Mother',
    },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'PENDING_REVIEW',
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    convertedEnquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enquiry',
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

farmerPublicRequestSchema.index({ status: 1 });
farmerPublicRequestSchema.index({ mobileNumber: 1 });
farmerPublicRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FarmerPublicRequest', farmerPublicRequestSchema);
