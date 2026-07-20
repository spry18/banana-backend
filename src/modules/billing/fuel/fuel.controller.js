'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FuelEntry = require('./fuelEntry.model');
const FuelPayment = require('./fuelPayment.model');

const periodFilter = (f) => {
  const map = { Daily: 1, Weekly: 7, '15Days': 15, Monthly: 30 };
  const days = map[f];
  if (!days) return null;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return { $gte: since };
};

/** GET /api/billing/fuel/entries */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, filter, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { vehicleNumber: { $regex: search, $options: 'i' } },
      { pumpName: { $regex: search, $options: 'i' } },
    ];
  }
  if (date) {
    query.date = {
      $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
      $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
    };
  }
  const pf = periodFilter(filter);
  if (pf && !date) query.date = pf;
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    FuelEntry.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    FuelEntry.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/fuel/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const pf = periodFilter(filter);
  const match = pf ? { date: pf } : {};
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [summary, todayAgg, monthAgg, vehicleCount] = await Promise.all([
    FuelEntry.aggregate([
      { $match: match },
      { $group: { _id: '$fuelType', total: { $sum: '$amount' } } },
    ]),
    FuelEntry.aggregate([
      { $match: { date: { $gte: todayStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FuelEntry.aggregate([
      { $match: { date: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FuelEntry.distinct('vehicleNumber', { date: { $gte: todayStart } }),
  ]);
  const petrol = summary.find((s) => s._id === 'Petrol');
  const diesel = summary.find((s) => s._id === 'Diesel');
  res.json({
    success: true,
    data: {
      todayAggregated: todayAgg[0]?.total ?? 0,
      todayPetrol: petrol?.total ?? 0,
      todayDiesel: diesel?.total ?? 0,
      monthSpend: monthAgg[0]?.total ?? 0,
      vehicleCount: vehicleCount.length,
    },
  });
});

/** POST /api/billing/fuel/entries */
exports.create = asyncHandler(async (req, res) => {
  const entry = await FuelEntry.create(req.body);
  res.status(201).json({ success: true, data: entry });
});

/** GET /api/billing/fuel/entries/:id */
exports.getById = asyncHandler(async (req, res) => {
  const entry = await FuelEntry.findById(req.params.id).lean();
  if (!entry) return res.status(404).json({ success: false, message: 'Fuel entry not found' });
  res.json({ success: true, data: entry });
});

/** PATCH /api/billing/fuel/entries/:id */
exports.update = asyncHandler(async (req, res) => {
  const entry = await FuelEntry.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!entry) return res.status(404).json({ success: false, message: 'Fuel entry not found' });
  res.json({ success: true, data: entry });
});

/** GET /api/billing/fuel/pump-summary */
exports.getPumpSummary = asyncHandler(async (req, res) => {
  const cycles = await FuelEntry.aggregate([
    {
      $group: {
        _id: { pump: '$pumpName', cycle: '$paymentCycle' },
        pumpName: { $first: '$pumpName' },
        cycle: { $first: '$paymentCycle' },
        total: { $sum: '$amount' },
        petrol: { $sum: { $cond: [{ $eq: ['$fuelType', 'Petrol'] }, '$amount', 0] } },
        diesel: { $sum: { $cond: [{ $eq: ['$fuelType', 'Diesel'] }, '$amount', 0] } },
      },
    },
    { $sort: { '_id.pump': 1 } },
  ]);
  res.json({ success: true, data: cycles });
});

/** GET /api/billing/fuel/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await FuelPayment.find().sort({ date: -1 }).limit(50).lean();
  res.json({ success: true, data: payments });
});

/** POST /api/billing/fuel/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await FuelPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});
