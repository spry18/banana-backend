'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const EicherTrip = require('./eicherTrip.model');
const EicherPayment = require('./eicherPayment.model');

const periodFilter = (filter) => {
  if (!filter) return null;
  const now = new Date();
  const map = { Daily: 1, Weekly: 7, Monthly: 30 };
  const days = map[filter];
  if (!days) return null;
  const since = new Date(now); since.setDate(now.getDate() - days);
  return { $gte: since };
};

/** GET /api/billing/eicher/trips */
exports.getTrips = asyncHandler(async (req, res) => {
  const { search = '', date, filter, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) query.$or = [{ vehicleNumber: { $regex: search, $options: 'i' } }, { route: { $regex: search, $options: 'i' } }];
  if (date) { query.date = { $gte: new Date(new Date(date).setHours(0,0,0,0)), $lte: new Date(new Date(date).setHours(23,59,59,999)) }; }
  const pf = periodFilter(filter);
  if (pf && !date) query.date = pf;
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    EicherTrip.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    EicherTrip.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/eicher/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const dateFilter = periodFilter(filter);
  const match = dateFilter ? { date: dateFilter } : {};
  const todayStart = new Date(new Date().setHours(0,0,0,0));
  const [summary, today] = await Promise.all([
    EicherTrip.aggregate([{ $match: match }, { $group: { _id: null, totalKm: { $sum: '$km' }, dieselAdvance: { $sum: '$dieselAdvance' }, payable: { $sum: '$netPayable' } } }]),
    EicherTrip.countDocuments({ date: { $gte: todayStart } }),
  ]);
  res.json({ success: true, data: { tripsToday: today, totalDistance: summary[0]?.totalKm ?? 0, dieselAdvance: summary[0]?.dieselAdvance ?? 0, payable: summary[0]?.payable ?? 0 } });
});

/** POST /api/billing/eicher/trips */
exports.createTrip = asyncHandler(async (req, res) => {
  const trip = await EicherTrip.create(req.body);
  res.status(201).json({ success: true, data: trip });
});

/** GET /api/billing/eicher/trips/:id */
exports.getTripById = asyncHandler(async (req, res) => {
  const trip = await EicherTrip.findById(req.params.id).lean();
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  res.json({ success: true, data: trip });
});

/** PATCH /api/billing/eicher/trips/:id */
exports.updateTrip = asyncHandler(async (req, res) => {
  const trip = await EicherTrip.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  res.json({ success: true, data: trip });
});

/** GET /api/billing/eicher/payment-summary */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  const trips = await EicherTrip.aggregate([
    { $group: { _id: '$vehicleNumber', vehicle: { $first: '$vehicleNumber' }, trips: { $sum: 1 }, km: { $sum: '$km' }, diesel: { $sum: '$dieselAdvance' }, toll: { $sum: '$toll' }, lineCancel: { $sum: '$lineCancel' }, hault: { $sum: '$hault' }, totalBill: { $sum: '$netPayable' } } },
  ]);
  const payments = await EicherPayment.aggregate([
    { $group: { _id: '$vehicleNumber', paid: { $sum: '$amountPaid' } } },
  ]);
  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));
  const data = trips.map((t) => ({ ...t, paid: paidMap[t.vehicle] || 0, pending: Math.max(0, t.totalBill - (paidMap[t.vehicle] || 0)) }));
  res.json({ success: true, data });
});

/** GET /api/billing/eicher/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await EicherPayment.find().sort({ date: -1 }).limit(50).lean();
  res.json({ success: true, data: payments });
});

/** POST /api/billing/eicher/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await EicherPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});
