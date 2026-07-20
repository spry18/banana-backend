'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const PackingProcurement = require('./packingProcurement.model');
const PackingPayment = require('./packingPayment.model');

/** GET /api/billing/packing-material/procurements */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { supplier: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
    ];
  }
  if (date) {
    query.date = {
      $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
      $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
    };
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    PackingProcurement.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    PackingProcurement.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/packing-material/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const agg = await PackingProcurement.aggregate([
    { $group: { _id: null, totalPurchase: { $sum: '$amount' } } },
  ]);
  res.json({ success: true, data: { totalPurchase: agg[0]?.totalPurchase ?? 0 } });
});

/** POST /api/billing/packing-material/procurements */
exports.create = asyncHandler(async (req, res) => {
  const procurement = await PackingProcurement.create(req.body);
  res.status(201).json({ success: true, data: procurement });
});

/** GET /api/billing/packing-material/procurements/:id */
exports.getById = asyncHandler(async (req, res) => {
  const procurement = await PackingProcurement.findById(req.params.id).lean();
  if (!procurement) return res.status(404).json({ success: false, message: 'Procurement record not found' });
  res.json({ success: true, data: procurement });
});

/** PATCH /api/billing/packing-material/procurements/:id */
exports.update = asyncHandler(async (req, res) => {
  const procurement = await PackingProcurement.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!procurement) return res.status(404).json({ success: false, message: 'Procurement record not found' });
  res.json({ success: true, data: procurement });
});

/** POST /api/billing/packing-material/procurements/upload-bill */
exports.uploadBillPhoto = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const fileUrl = req.file.location || req.file.path;
  res.json({ success: true, data: { fileUrl } });
});

/** GET /api/billing/packing-material/vendor-summary */
exports.getVendorSummary = asyncHandler(async (req, res) => {
  const procurements = await PackingProcurement.aggregate([
    { $group: { _id: '$supplier', vendorName: { $first: '$supplier' }, totalAmount: { $sum: '$amount' } } },
  ]);
  const payments = await PackingPayment.aggregate([
    { $group: { _id: '$vendorName', paid: { $sum: '$amount' } } },
  ]);
  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));
  const data = procurements.map((v) => ({
    vendorName: v.vendorName,
    totalAmount: v.totalAmount,
    paidAmount: paidMap[v.vendorName] || 0,
    pendingAmount: Math.max(0, v.totalAmount - (paidMap[v.vendorName] || 0)),
  }));
  res.json({ success: true, data });
});

/** POST /api/billing/packing-material/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await PackingPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});
