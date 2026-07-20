'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FarmerPayment = require('./farmerPayment.model');

/** GET /api/billing/farmer/payments */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { farmerName: { $regex: search, $options: 'i' } },
      { beneficiaryName: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    FarmerPayment.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    FarmerPayment.countDocuments(query),
  ]);
  // Mask account numbers
  const masked = data.map((p) => ({
    ...p,
    accountNo: p.accountNo ? `****${p.accountNo.slice(-4)}` : null,
  }));
  res.json({ success: true, data: masked, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/farmer/payments/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const [agg, weekAgg] = await Promise.all([
    FarmerPayment.aggregate([{ $group: { _id: '$isCompleted', total: { $sum: '$amountPaid' }, count: { $sum: 1 } } }]),
    FarmerPayment.aggregate([{ $match: { createdAt: { $gte: weekAgo } } }, { $group: { _id: null, total: { $sum: '$amountPaid' }, count: { $sum: 1 } } }]),
  ]);
  const paid = agg.find((a) => a._id === true);
  const pending = agg.find((a) => a._id === false);
  res.json({
    success: true,
    data: {
      totalPaid: paid?.total ?? 0,
      totalPending: pending?.total ?? 0,
      paidThisWeek: weekAgg[0]?.total ?? 0,
      paymentsProcessedThisWeek: weekAgg[0]?.count ?? 0,
    },
  });
});

/** POST /api/billing/farmer/payments */
exports.create = asyncHandler(async (req, res) => {
  const payment = await FarmerPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});

/** GET /api/billing/farmer/payments/:id */
exports.getById = asyncHandler(async (req, res) => {
  const payment = await FarmerPayment.findById(req.params.id).lean();
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  payment.accountNo = payment.accountNo ? `****${payment.accountNo.slice(-4)}` : null;
  res.json({ success: true, data: payment });
});
