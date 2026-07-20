'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const PickupTrip = require('./pickupTrip.model');
const PickupPayment = require('./pickupPayment.model');

/** GET /api/billing/pickup/trips */
exports.getTrips = asyncHandler(async (req, res) => {
  const { search = '', date, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) query.$or = [{ vehicleNumber: { $regex: search, $options: 'i' } }, { driver: { $regex: search, $options: 'i' } }];
  if (date) { query.date = { $gte: new Date(new Date(date).setHours(0,0,0,0)), $lte: new Date(new Date(date).setHours(23,59,59,999)) }; }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    PickupTrip.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    PickupTrip.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/pickup/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const todayStart = new Date(new Date().setHours(0,0,0,0));
  const [summary, today] = await Promise.all([
    PickupTrip.aggregate([{ $group: { _id: null, totalKm: { $sum: '$km' }, diesel: { $sum: '$fuel' }, payable: { $sum: '$amount' } } }]),
    PickupTrip.countDocuments({ date: { $gte: todayStart } }),
  ]);
  res.json({ success: true, data: { tripsToday: today, totalDistance: summary[0]?.totalKm ?? 0, dieselAdvance: summary[0]?.diesel ?? 0, payable: summary[0]?.payable ?? 0 } });
});

/** POST /api/billing/pickup/trips */
exports.createTrip = asyncHandler(async (req, res) => {
  const t = await PickupTrip.create(req.body);
  res.status(201).json({ success: true, data: t });
});

/** GET/PATCH /api/billing/pickup/trips/:id */
exports.getTripById = asyncHandler(async (req, res) => {
  const t = await PickupTrip.findById(req.params.id).lean();
  if (!t) return res.status(404).json({ success: false, message: 'Trip not found' });
  res.json({ success: true, data: t });
});

exports.updateTrip = asyncHandler(async (req, res) => {
  const t = await PickupTrip.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!t) return res.status(404).json({ success: false, message: 'Trip not found' });
  res.json({ success: true, data: t });
});

/** GET /api/billing/pickup/payment-summary */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  const trips = await PickupTrip.aggregate([
    { $group: { _id: '$vehicleNumber', vehicle: { $first: '$vehicleNumber' }, km: { $sum: '$km' }, diesel: { $sum: '$fuel' }, toll: { $sum: '$toll' }, totalBill: { $sum: '$amount' } } },
  ]);
  const payments = await PickupPayment.aggregate([
    { $group: { _id: '$vehicleNumber', paid: { $sum: '$amountPaid' } } },
  ]);
  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));
  const data = trips.map((t) => ({ ...t, paid: paidMap[t.vehicle] || 0, pending: Math.max(0, t.totalBill - (paidMap[t.vehicle] || 0)) }));
  res.json({ success: true, data });
});

/** GET /api/billing/pickup/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const p = await PickupPayment.find().sort({ date: -1 }).limit(50).lean();
  res.json({ success: true, data: p });
});

/** POST /api/billing/pickup/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const p = await PickupPayment.create(req.body);
  res.status(201).json({ success: true, data: p });
});
