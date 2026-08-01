'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const ColdStorageEntry = require('./coldStorageEntry.model');
const ColdStoragePayment = require('./coldStoragePayment.model');

try {
  require('../../master-data/company.model');
  require('../../master-data/brand.model');
  require('../../master-data/vehicle.model');
} catch (e) {}

let Logistics;
try {
  Logistics = require('../../logistics/logistics.model');
} catch (e) {
  Logistics = null;
}

// Normalize entry into standard UI shape
const normalizeEntry = (entry) => {
  const amt = Number(entry.amount || 0);
  const boxes = Number(entry.kgBoxes || entry.totalBoxes || 0);

  const storageStr = entry.coldStorageName || entry.storage || 'Dindori Cold Storage';
  const companyObj = entry.companyRef || entry.companyId;
  const companyStr = companyObj?.companyName || entry.companyName || entry.company || 'Sahyadri Farms';

  return {
    _id: entry._id,
    id: entry._id,
    date: entry.createdAt || entry.date,
    storage: storageStr,
    coldStorageName: storageStr,
    company: companyStr,
    companyName: companyStr,
    amount: `₹${amt.toLocaleString()}`,
    rawAmount: amt,
    kgBoxes: `${boxes}`,
    rawKgBoxes: boxes,
    vehicle: entry.vehicleNumber || entry.vehicleNo || companyObj?.vehicleNo || 'N/A',
    vehicleNumber: entry.vehicleNumber || entry.vehicleNo || 'N/A',
    receiptNo: entry.receiptNo || 'N/A',
    containerNo: entry.containerNo || 'N/A',
    brandName: entry.brandName || 'N/A',
    total4h5h6h: entry.total4h5h6h || 0,
    total7h8h: entry.total7h8h || 0,
    time: entry.time || '10:00 AM',
    status: entry.status || entry.assignmentStatus || 'COMPLETED',
  };
};

/** GET /api/billing/cold-storage/entries */
exports.getAll = asyncHandler(async (req, res) => {
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
    ColdStorageEntry.find(query)
      .sort({ createdAt: -1 })
      .populate('companyRef', 'companyName')
      .populate('vehicleRef', 'vehicleNumber')
      .populate('brandRef', 'name')
      .lean(),
  ];

  if (Logistics) {
    fetches.push(
      Logistics.find({ assignmentStatus: 'COMPLETED' })
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
    coldStorageName: log.fieldOwner || 'Dindori Unit-2',
    vehicleNumber: log.vehicleId?.vehicleNumber || 'N/A',
    receiptNo: `REC-${String(log._id).slice(-4).toUpperCase()}`,
    containerNo: `CONT-${String(log.enquiryId || log._id).slice(-4).toUpperCase()}`,
    companyName: log.companyId?.companyName || 'ABC Farms',
    brandName: 'Fresh Gold',
    kgBoxes: log.totalBoxes || 0,
    total4h5h6h: Math.floor((log.totalBoxes || 0) * 0.4),
    total7h8h: Math.floor((log.totalBoxes || 0) * 0.6),
    time: log.lightInTime || '10:00 AM',
    amount: (log.totalBoxes || 0) * 20,
    status: 'COMPLETED',
  }));

  let combined = [
    ...localEntries.map((e) => normalizeEntry(e)),
    ...logisticsMapped.map((e) => normalizeEntry(e)),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (search) {
    const s = search.toLowerCase();
    combined = combined.filter(
      (e) =>
        e.storage.toLowerCase().includes(s) ||
        e.company.toLowerCase().includes(s) ||
        e.vehicle.toLowerCase().includes(s)
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

/** GET /api/billing/cold-storage/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

  const fetches = [
    ColdStorageEntry.find({ status: 'COMPLETED', createdAt: { $gte: monthStart } }).lean(),
  ];
  if (Logistics) {
    fetches.push(Logistics.find({ assignmentStatus: 'COMPLETED', createdAt: { $gte: monthStart } }).lean());
  }

  const results = await Promise.all(fetches);
  const localEntries = results[0] || [];
  const completedLogistics = Logistics ? results[1] || [] : [];

  let totalContainerShiftsToday = 0;
  let totalAmount = 0;
  let totalContainers = 0;

  localEntries.forEach((e) => {
    const amt = Number(e.amount || 0);
    totalAmount += amt;
    totalContainers += 1;

    if (new Date(e.createdAt || e.date) >= todayStart) {
      totalContainerShiftsToday += 1;
    }
  });

  completedLogistics.forEach((log) => {
    const amt = (log.totalBoxes || 0) * 20;
    totalAmount += amt;
    totalContainers += 1;

    if (new Date(log.createdAt) >= todayStart) {
      totalContainerShiftsToday += 1;
    }
  });

  res.json({
    success: true,
    data: {
      totalContainerShiftsToday: totalContainerShiftsToday || localEntries.length,
      totalAmount,
      totalContainers: totalContainers || localEntries.length,
    },
  });
});

/** GET /api/billing/cold-storage/entries/:id */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let entry = await ColdStorageEntry.findById(id)
    .populate('companyRef', 'companyName')
    .populate('vehicleRef', 'vehicleNumber')
    .populate('brandRef', 'name')
    .lean();

  if (!entry && Logistics) {
    const log = await Logistics.findById(id)
      .populate('companyId', 'companyName')
      .populate('vehicleId', 'vehicleNumber')
      .lean();

    if (log) {
      entry = {
        _id: log._id,
        date: log.createdAt,
        coldStorageName: log.fieldOwner || 'Dindori Unit-2',
        vehicleNumber: log.vehicleId?.vehicleNumber || 'N/A',
        receiptNo: `REC-${String(log._id).slice(-4).toUpperCase()}`,
        containerNo: `CONT-${String(log.enquiryId || log._id).slice(-4).toUpperCase()}`,
        companyName: log.companyId?.companyName || 'ABC Farms',
        brandName: 'Fresh Gold',
        kgBoxes: log.totalBoxes || 0,
        total4h5h6h: Math.floor((log.totalBoxes || 0) * 0.4),
        total7h8h: Math.floor((log.totalBoxes || 0) * 0.6),
        time: log.lightInTime || '10:00 AM',
        amount: (log.totalBoxes || 0) * 20,
        status: 'COMPLETED',
      };
    }
  }

  if (!entry) return res.status(404).json({ success: false, message: 'Cold storage entry not found' });
  res.json({ success: true, data: normalizeEntry(entry) });
});

/** POST /api/billing/cold-storage/entries */
exports.create = asyncHandler(async (req, res) => {
  const entry = await ColdStorageEntry.create({
    ...req.body,
    status: 'COMPLETED',
  });
  res.status(201).json({ success: true, data: normalizeEntry(entry.toObject()) });
});

/** PATCH /api/billing/cold-storage/entries/:id */
exports.update = asyncHandler(async (req, res) => {
  const entry = await ColdStorageEntry.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!entry) return res.status(404).json({ success: false, message: 'Cold storage entry not found' });
  res.json({ success: true, data: normalizeEntry(entry.toObject()) });
});

/** GET /api/billing/cold-storage/payment-cycles */
exports.getPaymentCycles = asyncHandler(async (req, res) => {
  const fetches = [
    ColdStorageEntry.find({ status: 'COMPLETED' }).lean(),
  ];
  if (Logistics) {
    fetches.push(Logistics.find({ assignmentStatus: 'COMPLETED' }).lean());
  }

  const results = await Promise.all(fetches);
  const localEntries = results[0] || [];
  const completedLogistics = Logistics ? results[1] || [] : [];

  const allCombined = [
    ...localEntries.map((e) => normalizeEntry(e)),
    ...completedLogistics.map((log) =>
      normalizeEntry({
        _id: log._id,
        createdAt: log.createdAt,
        coldStorageName: log.fieldOwner || 'Dindori Unit-2',
        companyName: log.companyId?.companyName || 'ABC Farms',
        amount: (log.totalBoxes || 0) * 20,
      })
    ),
  ];

  const map = {};
  allCombined.forEach((item) => {
    const key = `${item.storage}_${item.company}`;
    if (!map[key]) {
      map[key] = {
        storage: item.storage,
        coldStorageName: item.storage,
        company: item.company,
        companyName: item.company,
        cycle: 'Current Cycle',
        paymentCycle: 'Current Cycle',
        amount: 0,
        rawAmount: 0,
        containers: 0,
        noOfContainers: 0,
        payDate: item.date,
        lastDate: item.date,
      };
    }
    const amt = item.rawAmount || 0;
    map[key].rawAmount += amt;
    map[key].amount = `₹${map[key].rawAmount.toLocaleString()}`;
    map[key].containers += 1;
    map[key].noOfContainers += 1;
  });

  const data = Object.values(map);
  res.json({ success: true, data });
});

/** POST /api/billing/cold-storage/payments (Record Cold Storage Payment) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    coldStorageName,
    storage,
    companyName,
    company,
    paymentCycle,
    cycle,
    totalAmount,
    amountPaid,
    amount,
    noOfContainers,
    containers,
    bankName,
    bank,
    beneficiaryName,
    accountNo,
    paymentMode,
    transactionId,
    remark,
  } = req.body;

  const payment = await ColdStoragePayment.create({
    date: new Date(),
    coldStorageName: coldStorageName || storage || 'Dindori Cold Storage',
    storage: storage || coldStorageName || 'Dindori Cold Storage',
    companyName: companyName || company || 'Sahyadri Farms',
    company: company || companyName || 'Sahyadri Farms',
    paymentCycle: paymentCycle || cycle || 'Current Cycle',
    cycle: cycle || paymentCycle || 'Current Cycle',
    totalAmount: Number(totalAmount || amountPaid || amount || 0),
    amount: Number(totalAmount || amountPaid || amount || 0),
    noOfContainers: Number(noOfContainers || containers || 0),
    containers: Number(noOfContainers || containers || 0),
    bankName: bankName || bank || '',
    bank: bank || bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  });

  res.status(201).json({ success: true, data: payment, message: 'Cold storage payment recorded successfully' });
});

/** GET /api/billing/cold-storage/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [rawPayments, total] = await Promise.all([
    ColdStoragePayment.find()
      .sort({ date: -1 })
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ColdStoragePayment.countDocuments(),
  ]);

  const data = rawPayments.map((p) => ({
    _id: p._id,
    date: p.date,
    storage: p.coldStorageName || p.storage || '',
    coldStorageName: p.coldStorageName || p.storage || '',
    company: p.companyName || p.company || '',
    companyName: p.companyName || p.company || '',
    cycle: p.paymentCycle || p.cycle || 'N/A',
    paymentCycle: p.paymentCycle || p.cycle || 'N/A',
    amount: `₹${Number(p.totalAmount || p.amount || 0).toLocaleString()}`,
    rawAmount: Number(p.totalAmount || p.amount || 0),
    totalAmount: Number(p.totalAmount || p.amount || 0),
    containers: p.noOfContainers || p.containers || 0,
    noOfContainers: p.noOfContainers || p.containers || 0,
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
