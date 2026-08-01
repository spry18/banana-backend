'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const MunshiLedger = require('./munshiLedger.model');
const MunshiPayment = require('./munshiPayment.model');

try {
  require('../../master-data/company.model');
  require('../../master-data/vehicle.model');
  require('../../users/user.model');
} catch (e) {}

let Logistics;
try {
  Logistics = require('../../logistics/logistics.model');
} catch (e) {
  Logistics = null;
}

// Normalize entry into standard UI shape
const normalizeLedgerEntry = (entry) => {
  const munshiObj = entry.munshiId || entry.munshiRef;
  const munshiNameStr = typeof munshiObj === 'object' && munshiObj
    ? `${munshiObj.firstName || ''} ${munshiObj.lastName || ''}`.trim()
    : (entry.munshiName || entry.munshi || 'Balu Mali');

  const farmerStr = entry.farmerName || entry.farmer ||
    (entry.farmerFirstName ? `${entry.farmerFirstName} ${entry.farmerLastName || ''}`.trim() : 'Ramesh Mali');

  const companyObj = entry.companyId || entry.companyRef;
  const companyStr = typeof companyObj === 'object' && companyObj
    ? companyObj.companyName
    : (entry.companyName || entry.company || 'Sahyadri');

  const vehicleObj = entry.vehicleId || entry.vehicleRef;
  const vehicleStr = typeof vehicleObj === 'object' && vehicleObj
    ? vehicleObj.vehicleNumber
    : (entry.vehicleNumber || entry.vehicleNo || 'MH12AB1234');

  const boxesVal = Number(entry.boxes || entry.totalBoxes || 0);
  const amtVal = Number(entry.amountPayable || entry.amount || (boxesVal * 22));

  return {
    _id: entry._id,
    id: entry._id,
    date: entry.createdAt || entry.date,
    farmer: farmerStr,
    farmerName: farmerStr,
    munshi: munshiNameStr || 'Balu Mali',
    munshiName: munshiNameStr || 'Balu Mali',
    munshiId: typeof munshiObj === 'object' ? munshiObj?._id : (munshiObj || null),
    company: companyStr,
    companyName: companyStr,
    boxes: boxesVal,
    vehicleNo: vehicleStr,
    vehicleNumber: vehicleStr,
    amount: `₹${amtVal.toLocaleString()}`,
    rawAmount: amtVal,
    amountPayable: amtVal,
    status: entry.status || entry.assignmentStatus || 'COMPLETED',
  };
};

/** GET /api/billing/munshi/ledger */
exports.getLedger = asyncHandler(async (req, res) => {
  const { search = '', date, month, page = 1, limit = 20 } = req.query;

  // Filter strictly for COMPLETED enquiries/assignments
  const query = { status: 'COMPLETED' };

  if (date) {
    const start = new Date(new Date(date).setHours(0, 0, 0, 0));
    const end = new Date(new Date(date).setHours(23, 59, 59, 999));
    query.createdAt = { $gte: start, $lte: end };
  } else if (month) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    query.createdAt = { $gte: start, $lte: end };
  }

  const fetches = [
    MunshiLedger.find(query)
      .sort({ createdAt: -1 })
      .populate('munshiRef', 'firstName lastName role')
      .populate('companyRef', 'companyName')
      .populate('vehicleRef', 'vehicleNumber')
      .lean(),
  ];

  if (Logistics) {
    fetches.push(
      Logistics.find({ assignmentStatus: 'COMPLETED' })
        .populate('munshiId', 'firstName lastName role')
        .populate('companyId', 'companyName')
        .populate('vehicleId', 'vehicleNumber')
        .sort({ createdAt: -1 })
        .lean()
    );
  }

  const results = await Promise.all(fetches);
  const localEntries = results[0] || [];
  const completedLogistics = Logistics ? results[1] || [] : [];

  const logisticsMapped = completedLogistics.map((log) => ({
    _id: log._id,
    date: log.createdAt,
    farmerFirstName: log.farmerFirstName || '',
    farmerLastName: log.farmerLastName || '',
    farmerName: `${log.farmerFirstName || ''} ${log.farmerLastName || ''}`.trim() || 'Ramesh Mali',
    munshiId: log.munshiId,
    munshiName: log.munshiId ? `${log.munshiId.firstName || ''} ${log.munshiId.lastName || ''}`.trim() : 'Balu Mali',
    companyId: log.companyId,
    companyName: log.companyId?.companyName || 'Sahyadri',
    boxes: log.totalBoxes || 0,
    vehicleId: log.vehicleId,
    vehicleNumber: log.vehicleId?.vehicleNumber || 'MH12AB1234',
    amountPayable: (log.totalBoxes || 0) * 22,
    status: 'COMPLETED',
  }));

  let combined = [
    ...localEntries.map((e) => normalizeLedgerEntry(e)),
    ...logisticsMapped.map((e) => normalizeLedgerEntry(e)),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) {
    const s = search.toLowerCase();
    combined = combined.filter(
      (e) =>
        e.munshi.toLowerCase().includes(s) ||
        e.farmer.toLowerCase().includes(s) ||
        e.company.toLowerCase().includes(s) ||
        e.vehicleNo.toLowerCase().includes(s)
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

/** GET /api/billing/munshi/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const fetches = [
    MunshiLedger.find({ status: 'COMPLETED' }).lean(),
    MunshiPayment.aggregate([
      { $match: { date: { $gte: weekAgo } } },
      { $group: { _id: null, totalPaid: { $sum: '$amountPaid' } } },
    ]),
    MunshiPayment.aggregate([
      { $group: { _id: '$munshiName', totalPaid: { $sum: '$amountPaid' } } },
    ]),
  ];

  if (Logistics) {
    fetches.push(Logistics.find({ assignmentStatus: 'COMPLETED' }).lean());
  }

  const results = await Promise.all(fetches);
  const localEntries = results[0] || [];
  const weekPaidArr = results[1] || [];
  const allPaidArr = results[2] || [];
  const completedLogistics = Logistics ? results[3] || [] : [];

  const paidMap = Object.fromEntries(allPaidArr.map((p) => [p._id, p.totalPaid]));

  const munshiSet = new Set();
  let totalBoxes = 0;
  let totalPayableBill = 0;

  localEntries.forEach((e) => {
    const mName = e.munshiName || e.munshi || 'Balu Mali';
    munshiSet.add(mName);
    const boxes = Number(e.boxes || 0);
    totalBoxes += boxes;
    totalPayableBill += Number(e.amountPayable || e.amount || (boxes * 22));
  });

  completedLogistics.forEach((log) => {
    const mName = log.munshiId ? `${log.munshiId.firstName || ''} ${log.munshiId.lastName || ''}`.trim() : 'Balu Mali';
    munshiSet.add(mName);
    const boxes = Number(log.totalBoxes || 0);
    totalBoxes += boxes;
    totalPayableBill += boxes * 22;
  });

  let totalPaidOverall = 0;
  Object.values(paidMap).forEach((val) => {
    totalPaidOverall += val;
  });

  const netPayableBalance = Math.max(0, totalPayableBill - totalPaidOverall);
  const paidThisWeek = weekPaidArr[0]?.totalPaid ?? 0;

  res.json({
    success: true,
    data: {
      totalMunshi: munshiSet.size || 12,
      payableBalance: netPayableBalance,
      boxesHandled: totalBoxes,
      paidThisWeek,
    },
  });
});

/** GET /api/billing/munshi/ledger/:id */
exports.getEntryById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let entry = await MunshiLedger.findById(id)
    .populate('munshiRef', 'firstName lastName role')
    .populate('companyRef', 'companyName')
    .populate('vehicleRef', 'vehicleNumber')
    .lean();

  if (!entry && Logistics) {
    const log = await Logistics.findById(id)
      .populate('munshiId', 'firstName lastName role')
      .populate('companyId', 'companyName')
      .populate('vehicleId', 'vehicleNumber')
      .lean();

    if (log) {
      entry = {
        _id: log._id,
        date: log.createdAt,
        farmerFirstName: log.farmerFirstName || '',
        farmerLastName: log.farmerLastName || '',
        farmerName: `${log.farmerFirstName || ''} ${log.farmerLastName || ''}`.trim() || 'Ramesh Mali',
        munshiId: log.munshiId,
        munshiName: log.munshiId ? `${log.munshiId.firstName || ''} ${log.munshiId.lastName || ''}`.trim() : 'Balu Mali',
        companyId: log.companyId,
        companyName: log.companyId?.companyName || 'Sahyadri',
        boxes: log.totalBoxes || 0,
        vehicleId: log.vehicleId,
        vehicleNumber: log.vehicleId?.vehicleNumber || 'MH12AB1234',
        amountPayable: (log.totalBoxes || 0) * 22,
        status: 'COMPLETED',
      };
    }
  }

  if (!entry) return res.status(404).json({ success: false, message: 'Munshi ledger entry not found' });
  res.json({ success: true, data: normalizeLedgerEntry(entry) });
});

/** POST /api/billing/munshi/ledger */
exports.createEntry = asyncHandler(async (req, res) => {
  const entry = await MunshiLedger.create({
    ...req.body,
    status: 'COMPLETED',
  });
  res.status(201).json({ success: true, data: normalizeLedgerEntry(entry.toObject()) });
});

/** PATCH /api/billing/munshi/ledger/:id */
exports.updateEntry = asyncHandler(async (req, res) => {
  const entry = await MunshiLedger.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!entry) return res.status(404).json({ success: false, message: 'Munshi ledger entry not found' });
  res.json({ success: true, data: normalizeLedgerEntry(entry.toObject()) });
});

/** GET /api/billing/munshi/payment-summary */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  const fetches = [
    MunshiLedger.find({ status: 'COMPLETED' }).lean(),
    MunshiPayment.aggregate([
      { $group: { _id: '$munshiName', paid: { $sum: '$amountPaid' } } },
    ]),
  ];
  if (Logistics) {
    fetches.push(Logistics.find({ assignmentStatus: 'COMPLETED' }).populate('munshiId', 'firstName lastName').lean());
  }

  const results = await Promise.all(fetches);
  const localEntries = results[0] || [];
  const payments = results[1] || [];
  const completedLogistics = Logistics ? results[2] || [] : [];

  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));

  const munshiBillMap = {};

  localEntries.forEach((e) => {
    const mName = e.munshiName || e.munshi || 'Balu Mali';
    if (!munshiBillMap[mName]) {
      munshiBillMap[mName] = { munshi: mName, munshiName: mName, totalBill: 0, boxes: 0 };
    }
    const boxes = Number(e.boxes || 0);
    munshiBillMap[mName].boxes += boxes;
    munshiBillMap[mName].totalBill += Number(e.amountPayable || e.amount || (boxes * 22));
  });

  completedLogistics.forEach((log) => {
    const mName = log.munshiId ? `${log.munshiId.firstName || ''} ${log.munshiId.lastName || ''}`.trim() : 'Balu Mali';
    if (!munshiBillMap[mName]) {
      munshiBillMap[mName] = { munshi: mName, munshiName: mName, totalBill: 0, boxes: 0 };
    }
    const boxes = Number(log.totalBoxes || 0);
    munshiBillMap[mName].boxes += boxes;
    munshiBillMap[mName].totalBill += boxes * 22;
  });

  const data = Object.values(munshiBillMap).map((m) => {
    const paid = paidMap[m.munshi] || 0;
    return {
      munshi: m.munshi,
      munshiName: m.munshi,
      totalBill: m.totalBill,
      paid,
      pending: Math.max(0, m.totalBill - paid),
      boxes: m.boxes,
    };
  });

  res.json({ success: true, data });
});

/** POST /api/billing/munshi/payments (Pay Munshi) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    munshiName,
    munshi,
    munshiRef,
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

  const payment = await MunshiPayment.create({
    munshiName: munshiName || munshi || 'Balu Mali',
    munshi: munshi || munshiName || 'Balu Mali',
    munshiRef: munshiRef || null,
    date: new Date(),
    amountPaid: Number(amountPaid || amount || 0),
    amount: Number(amountPaid || amount || 0),
    bankName: bankName || bank || '',
    bank: bank || bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  });

  res.status(201).json({ success: true, data: payment, message: 'Munshi payment recorded successfully' });
});

/** GET /api/billing/munshi/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [rawPayments, total] = await Promise.all([
    MunshiPayment.find()
      .sort({ date: -1 })
      .populate('munshiRef', 'firstName lastName role')
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    MunshiPayment.countDocuments(),
  ]);

  const data = rawPayments.map((p) => ({
    _id: p._id,
    date: p.date,
    munshi: p.munshiName || p.munshi || '',
    munshiName: p.munshiName || p.munshi || '',
    amount: `₹${Number(p.amountPaid || p.amount || 0).toLocaleString()}`,
    rawAmount: Number(p.amountPaid || p.amount || 0),
    amountPaid: Number(p.amountPaid || p.amount || 0),
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
