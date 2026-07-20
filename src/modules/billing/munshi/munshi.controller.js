'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const MunshiLedger = require('./munshiLedger.model');
const MunshiPayment = require('./munshiPayment.model');

/** GET /api/billing/munshi/ledger */
exports.getLedger = asyncHandler(async (req, res) => {
  const { search = '', date, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) query.$or = [{ munshiName: { $regex: search, $options: 'i' } }, { farmerName: { $regex: search, $options: 'i' } }];
  if (date) { query.date = { $gte: new Date(new Date(date).setHours(0,0,0,0)), $lte: new Date(new Date(date).setHours(23,59,59,999)) }; }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    MunshiLedger.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    MunshiLedger.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/munshi/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const [munshis, boxes, weekPaid] = await Promise.all([
    MunshiLedger.distinct('munshiName'),
    MunshiLedger.aggregate([{ $group: { _id: null, totalBoxes: { $sum: '$boxes' }, totalPayable: { $sum: '$amountPayable' } } }]),
    MunshiPayment.aggregate([{ $match: { createdAt: { $gte: weekAgo } } }, { $group: { _id: null, total: { $sum: '$amountPaid' } } }]),
  ]);
  res.json({ success: true, data: { totalMunshi: munshis.length, payableBalance: boxes[0]?.totalPayable ?? 0, boxesHandled: boxes[0]?.totalBoxes ?? 0, paidThisWeek: weekPaid[0]?.total ?? 0 } });
});

/** POST /api/billing/munshi/ledger */
exports.createEntry = asyncHandler(async (req, res) => {
  const entry = await MunshiLedger.create(req.body);
  res.status(201).json({ success: true, data: entry });
});

/** GET /api/billing/munshi/ledger/:id */
exports.getEntryById = asyncHandler(async (req, res) => {
  const entry = await MunshiLedger.findById(req.params.id).lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
  res.json({ success: true, data: entry });
});

/** PATCH /api/billing/munshi/ledger/:id */
exports.updateEntry = asyncHandler(async (req, res) => {
  const entry = await MunshiLedger.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' });
  res.json({ success: true, data: entry });
});

/** GET /api/billing/munshi/payment-summary */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  const ledger = await MunshiLedger.aggregate([{ $group: { _id: '$munshiName', munshi: { $first: '$munshiName' }, totalBill: { $sum: '$amountPayable' } } }]);
  const payments = await MunshiPayment.aggregate([{ $group: { _id: '$munshiName', paid: { $sum: '$amountPaid' } } }]);
  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));
  const data = ledger.map((l) => ({ munshi: l.munshi, totalBill: l.totalBill, paid: paidMap[l.munshi] || 0, pending: Math.max(0, l.totalBill - (paidMap[l.munshi] || 0)) }));
  res.json({ success: true, data });
});

/** GET /api/billing/munshi/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await MunshiPayment.find().sort({ date: -1 }).limit(50).lean();
  res.json({ success: true, data: payments });
});

/** POST /api/billing/munshi/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await MunshiPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});
