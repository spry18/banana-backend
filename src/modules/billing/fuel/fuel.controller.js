'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FuelEntry = require('./fuelEntry.model');
const FuelPayment = require('./fuelPayment.model');

let PetrolAdvance, DieselAdvance;
try {
  PetrolAdvance = require('../../petrol-advance/petrolAdvance.model');
} catch (e) {
  PetrolAdvance = null;
}
try {
  DieselAdvance = require('../../diesel-advance/dieselAdvance.model');
} catch (e) {
  DieselAdvance = null;
}

const periodFilter = (f) => {
  if (!f || f === 'All') return null;
  const map = { Daily: 1, Weekly: 7, '15Days': 15, Monthly: 30 };
  const days = map[f];
  if (!days) return null;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return { $gte: since };
};

// Normalize fuel record into standard UI shape
const normalizeFuelEntry = (item, source = 'FuelEntry') => {
  const dateVal = item.createdAt || item.date || item.transferDate;
  const vehicleVal = item.vehicleNumber || item.vehicleNo || 'N/A';
  const pumpVal = item.pumpName || 'Sonai Petrol Pump';
  const fuelTypeVal = item.fuelType || (source === 'Petrol' ? 'Petrol' : 'Diesel');
  const rateVal = item.rate ? `₹${item.rate}` : '₹90';
  const amountVal = Number(item.amount || 0);
  const remarkVal = item.remark || (source === 'Petrol' ? 'Petrol advance' : 'Diesel advance');
  const cycleVal = item.paymentCycle || item.cycle || 'Current Cycle';

  return {
    _id: item._id,
    id: item._id,
    date: dateVal,
    vehicle: vehicleVal,
    vehicleNumber: vehicleVal,
    pump: pumpVal,
    pumpName: pumpVal,
    fuel: fuelTypeVal,
    fuelType: fuelTypeVal,
    rate: rateVal,
    amount: `₹${amountVal.toLocaleString()}`,
    rawAmount: amountVal,
    remark: remarkVal,
    paymentCycle: cycleVal,
    cycle: cycleVal,
    receiptPhotoUrl: item.receiptPhotoUrl || item.receiptUrl || null,
    om: item.omId || item.omRef || null,
    driver: item.driverId || item.driverRef || item.fieldSelectorId || null,
    source,
    createdAt: item.createdAt || dateVal,
  };
};

/** GET /api/billing/fuel/entries */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, filter, page = 1, limit = 20 } = req.query;

  const query = {};
  if (date) {
    const start = new Date(new Date(date).setHours(0, 0, 0, 0));
    const end = new Date(new Date(date).setHours(23, 59, 59, 999));
    query.createdAt = { $gte: start, $lte: end };
  } else {
    const pf = periodFilter(filter);
    if (pf) query.createdAt = pf;
  }

  let fuelEntries = [],
    petrolAdv = [],
    dieselAdv = [];

  const fetches = [
    FuelEntry.find(query)
      .sort({ createdAt: -1 })
      .populate('omRef', 'firstName lastName mobileNo role')
      .populate('driverRef', 'firstName lastName mobileNo role')
      .lean(),
  ];

  if (PetrolAdvance) {
    fetches.push(
      PetrolAdvance.find(query)
        .sort({ createdAt: -1 })
        .populate('omId', 'firstName lastName mobileNo role')
        .populate('fieldSelectorId', 'firstName lastName mobileNo role')
        .lean()
    );
  }
  if (DieselAdvance) {
    fetches.push(
      DieselAdvance.find(query)
        .sort({ createdAt: -1 })
        .populate('omId', 'firstName lastName mobileNo role')
        .populate('driverId', 'firstName lastName mobileNo role')
        .lean()
    );
  }

  const results = await Promise.all(fetches);
  fuelEntries = results[0] || [];
  petrolAdv = PetrolAdvance ? results[1] || [] : [];
  dieselAdv = DieselAdvance ? (PetrolAdvance ? results[2] : results[1]) || [] : [];

  let combined = [
    ...fuelEntries.map((item) => normalizeFuelEntry(item, 'FuelEntry')),
    ...petrolAdv.map((item) => normalizeFuelEntry(item, 'Petrol')),
    ...dieselAdv.map((item) => normalizeFuelEntry(item, 'Diesel')),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) {
    const s = search.toLowerCase();
    combined = combined.filter(
      (item) =>
        item.vehicle.toLowerCase().includes(s) ||
        item.pump.toLowerCase().includes(s) ||
        item.remark.toLowerCase().includes(s)
    );
  }

  const total = combined.length;
  const skip = (Number(page) - 1) * Number(limit);
  const paginatedData = combined.slice(skip, skip + Number(limit));

  res.json({
    success: true,
    data: paginatedData,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)) || 1,
    },
  });
});

/** GET /api/billing/fuel/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const fetches = [
    FuelEntry.find({ createdAt: { $gte: monthStart } }).lean(),
  ];
  if (PetrolAdvance) fetches.push(PetrolAdvance.find({ createdAt: { $gte: monthStart } }).lean());
  if (DieselAdvance) fetches.push(DieselAdvance.find({ createdAt: { $gte: monthStart } }).lean());

  const results = await Promise.all(fetches);
  const fuelList = results[0] || [];
  const petrolList = PetrolAdvance ? results[1] || [] : [];
  const dieselList = DieselAdvance ? (PetrolAdvance ? results[2] : results[1]) || [] : [];

  const allMonth = [
    ...fuelList.map((i) => normalizeFuelEntry(i, 'FuelEntry')),
    ...petrolList.map((i) => normalizeFuelEntry(i, 'Petrol')),
    ...dieselList.map((i) => normalizeFuelEntry(i, 'Diesel')),
  ];

  let todayAggregated = 0,
    todayPetrol = 0,
    todayDiesel = 0,
    monthSpend = 0;

  const todayVehicles = new Set();

  allMonth.forEach((item) => {
    const amt = item.rawAmount || 0;
    monthSpend += amt;

    if (new Date(item.date) >= todayStart) {
      todayAggregated += amt;
      if (item.fuelType === 'Petrol') todayPetrol += amt;
      else todayDiesel += amt;

      if (item.vehicle && item.vehicle !== 'N/A') {
        todayVehicles.add(item.vehicle);
      }
    }
  });

  res.json({
    success: true,
    data: {
      todayAggregated,
      todayPetrol,
      todayDiesel,
      monthSpend,
      vehicleCount: todayVehicles.size || allMonth.length,
    },
  });
});

/** GET /api/billing/fuel/entries/:id */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let entry = await FuelEntry.findById(id)
    .populate('omRef', 'firstName lastName mobileNo role')
    .populate('driverRef', 'firstName lastName mobileNo role')
    .lean();

  if (!entry && PetrolAdvance) {
    entry = await PetrolAdvance.findById(id)
      .populate('omId', 'firstName lastName mobileNo role')
      .populate('fieldSelectorId', 'firstName lastName mobileNo role')
      .lean();
  }

  if (!entry && DieselAdvance) {
    entry = await DieselAdvance.findById(id)
      .populate('omId', 'firstName lastName mobileNo role')
      .populate('driverId', 'firstName lastName mobileNo role')
      .lean();
  }

  if (!entry) return res.status(404).json({ success: false, message: 'Fuel entry not found' });
  res.json({ success: true, data: normalizeFuelEntry(entry) });
});

/** GET /api/billing/fuel/pump-summary */
exports.getPumpSummary = asyncHandler(async (req, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const fetches = [
    FuelEntry.find({ createdAt: { $gte: monthStart } }).lean(),
  ];
  if (PetrolAdvance) fetches.push(PetrolAdvance.find({ createdAt: { $gte: monthStart } }).lean());
  if (DieselAdvance) fetches.push(DieselAdvance.find({ createdAt: { $gte: monthStart } }).lean());

  const results = await Promise.all(fetches);
  const allEntries = [
    ...(results[0] || []).map((i) => normalizeFuelEntry(i, 'FuelEntry')),
    ...(PetrolAdvance ? (results[1] || []).map((i) => normalizeFuelEntry(i, 'Petrol')) : []),
    ...(DieselAdvance ? ((PetrolAdvance ? results[2] : results[1]) || []).map((i) => normalizeFuelEntry(i, 'Diesel')) : []),
  ];

  const map = {};
  allEntries.forEach((item) => {
    const key = `${item.pump}_${item.cycle}`;
    if (!map[key]) {
      map[key] = {
        pumpName: item.pump,
        cycle: item.cycle,
        paymentCycle: item.cycle,
        total: 0,
        totalAmount: 0,
        petrol: 0,
        diesel: 0,
      };
    }
    const amt = item.rawAmount || 0;
    map[key].total += amt;
    map[key].totalAmount += amt;
    if (item.fuelType === 'Petrol') map[key].petrol += amt;
    else map[key].diesel += amt;
  });

  const payments = await FuelPayment.aggregate([
    {
      $group: {
        _id: '$pumpName',
        paid: { $sum: '$totalAmount' },
      },
    },
  ]);

  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));

  const data = Object.values(map).map((item) => ({
    ...item,
    paid: paidMap[item.pumpName] || 0,
    pending: Math.max(0, item.total - (paidMap[item.pumpName] || 0)),
  }));

  res.json({ success: true, data });
});

/** POST /api/billing/fuel/payments (Pay Fuel Pump Bill / Settle Fuel Advance) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    fuelAdvanceId,
    fuelEntryId,
    pumpName,
    paymentCycle,
    cycle,
    totalAmount,
    amountPaid,
    amount,
    bankName,
    bank,
    beneficiaryName,
    accountNo,
    paymentMode,
    transactionId,
    remark,
  } = req.body;

  const targetAdvanceId = fuelAdvanceId || fuelEntryId || null;
  const paymentData = {
    fuelAdvanceId: targetAdvanceId,
    date: new Date(),
    pumpName: pumpName || 'Sonai Petrol Pump',
    paymentCycle: paymentCycle || cycle || 'Current Cycle',
    cycle: cycle || paymentCycle || 'Current Cycle',
    totalAmount: Number(totalAmount || amountPaid || amount || 0),
    amount: Number(totalAmount || amountPaid || amount || 0),
    bankName: bankName || bank || '',
    bank: bank || bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  };

  // If specific advance ID is passed, link reference & update status
  if (targetAdvanceId) {
    const fExp = await FuelEntry.findByIdAndUpdate(targetAdvanceId, { status: 'Paid' }, { new: true });
    if (fExp) paymentData.fuelEntryRef = fExp._id;

    if (!fExp && PetrolAdvance) {
      const pExp = await PetrolAdvance.findByIdAndUpdate(targetAdvanceId, { status: 'Paid' }, { new: true });
      if (pExp) paymentData.petrolAdvanceRef = pExp._id;
    }

    if (!fExp && DieselAdvance) {
      const dExp = await DieselAdvance.findByIdAndUpdate(targetAdvanceId, { status: 'Paid' }, { new: true });
      if (dExp) paymentData.dieselAdvanceRef = dExp._id;
    }
  }

  const payment = await FuelPayment.create(paymentData);
  res.status(201).json({ success: true, data: payment, message: 'Fuel payment recorded successfully' });
});

/** GET /api/billing/fuel/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [rawPayments, total] = await Promise.all([
    FuelPayment.find()
      .sort({ date: -1 })
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    FuelPayment.countDocuments(),
  ]);

  const data = rawPayments.map((p) => ({
    _id: p._id,
    fuelAdvanceId: p.fuelAdvanceId || null,
    date: p.date,
    pumpName: p.pumpName,
    cycle: p.paymentCycle || p.cycle || 'N/A',
    paymentCycle: p.paymentCycle || p.cycle || 'N/A',
    amount: p.totalAmount || p.amount || 0,
    totalAmount: p.totalAmount || p.amount || 0,
    bank: p.bankName || p.bank || '',
    bankName: p.bankName || p.bank || '',
    beneficiaryName: p.beneficiaryName || '',
    accountNo: p.accountNo || '',
    paymentMode: p.paymentMode || 'Bank Transfer',
    transactionId: p.transactionId || '',
    paidBy: p.paidBy || null,
    remark: p.remark || '',
  }));

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)) || 1,
    },
  });
});
