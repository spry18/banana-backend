'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const PackingProcurement = require('./packingProcurement.model');
const PackingPayment = require('./packingPayment.model');

try {
  require('../../master-data/company.model');
  require('../../master-data/vehicle.model');
} catch (e) {}

// Normalize procurement record into standard UI shape
const normalizeProcurement = (item) => {
  const companyObj = item.companyRef;
  const companyStr = companyObj?.companyName || item.companyName || item.company || 'ABC Farm';

  const vehicleObj = item.vehicleRef;
  const vehicleStr = vehicleObj?.vehicleNumber || item.vehicleNumber || item.vehicleNo || 'N/A';

  const amt = Number(item.amount || (item.qty * item.rate) || 0);

  return {
    _id: item._id,
    id: item._id,
    date: item.createdAt || item.date,
    companyName: companyStr,
    company: companyStr,
    supplier: item.supplier || item.vendorName || 'PackWell Ind.',
    vendorName: item.supplier || item.vendorName || 'PackWell Ind.',
    material: item.material || '2kg punnet box',
    qty: Number(item.qty || 0),
    rate: Number(item.rate || 0),
    amount: `₹${amt.toLocaleString()}`,
    rawAmount: amt,
    vehicleNo: vehicleStr,
    vehicleNumber: vehicleStr,
    billNo: item.billNo || 'N/A',
    billPhotoUrl: item.billPhotoUrl || null,
    status: item.status || 'COMPLETED',
  };
};

/** GET /api/billing/packing-material/procurements */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, page = 1, limit = 20 } = req.query;

  const query = {};
  if (date) {
    const start = new Date(new Date(date).setHours(0, 0, 0, 0));
    const end = new Date(new Date(date).setHours(23, 59, 59, 999));
    query.createdAt = { $gte: start, $lte: end };
  }

  const [rawProcurements, total] = await Promise.all([
    PackingProcurement.find(query)
      .sort({ createdAt: -1 })
      .populate('companyRef', 'companyName')
      .populate('vehicleRef', 'vehicleNumber')
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean(),
    PackingProcurement.countDocuments(query),
  ]);

  let normalized = rawProcurements.map((p) => normalizeProcurement(p));

  if (search) {
    const s = search.toLowerCase();
    normalized = normalized.filter(
      (p) =>
        p.supplier.toLowerCase().includes(s) ||
        p.companyName.toLowerCase().includes(s) ||
        p.material.toLowerCase().includes(s) ||
        p.vehicleNo.toLowerCase().includes(s)
    );
  }

  res.json({
    success: true,
    data: normalized,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)) || 1,
    },
  });
});

/** GET /api/billing/packing-material/summary (KPI Cards) */
exports.getSummary = asyncHandler(async (req, res) => {
  const agg = await PackingProcurement.aggregate([
    { $group: { _id: null, totalPurchase: { $sum: '$amount' } } },
  ]);

  res.json({
    success: true,
    data: {
      totalPurchase: agg[0]?.totalPurchase ?? 0,
    },
  });
});

/** GET /api/billing/packing-material/procurements/:id */
exports.getById = asyncHandler(async (req, res) => {
  const procurement = await PackingProcurement.findById(req.params.id)
    .populate('companyRef', 'companyName')
    .populate('vehicleRef', 'vehicleNumber')
    .lean();

  if (!procurement) return res.status(404).json({ success: false, message: 'Procurement record not found' });
  res.json({ success: true, data: normalizeProcurement(procurement) });
});

/** POST /api/billing/packing-material/procurements */
exports.create = asyncHandler(async (req, res) => {
  const qty = Number(req.body.qty || 0);
  const rate = Number(req.body.rate || 0);
  const amount = Number(req.body.amount || (qty * rate) || 0);

  const procurement = await PackingProcurement.create({
    ...req.body,
    supplier: req.body.supplier || req.body.vendorName || 'PackWell Ind.',
    vendorName: req.body.vendorName || req.body.supplier || 'PackWell Ind.',
    amount,
    status: 'COMPLETED',
  });

  res.status(201).json({ success: true, data: normalizeProcurement(procurement.toObject()) });
});

/** PATCH /api/billing/packing-material/procurements/:id */
exports.update = asyncHandler(async (req, res) => {
  const procurement = await PackingProcurement.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!procurement) return res.status(404).json({ success: false, message: 'Procurement record not found' });
  res.json({ success: true, data: normalizeProcurement(procurement.toObject()) });
});

/** POST /api/billing/packing-material/procurements/upload-bill */
exports.uploadBillPhoto = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const fileUrl = req.file.location || req.file.path;
  res.json({ success: true, data: { fileUrl } });
});

/** GET /api/billing/packing-material/vendor-summary (Payments Tab Breakdown) */
exports.getVendorSummary = asyncHandler(async (req, res) => {
  const procurements = await PackingProcurement.aggregate([
    {
      $group: {
        _id: '$supplier',
        vendorName: { $first: '$supplier' },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  const payments = await PackingPayment.aggregate([
    {
      $group: {
        _id: '$vendorName',
        paid: { $sum: '$amount' },
      },
    },
  ]);

  const paidMap = Object.fromEntries(payments.map((p) => [p._id, p.paid]));

  const data = procurements.map((v) => {
    const totalAmount = v.totalAmount || 0;
    const paidAmount = paidMap[v.vendorName] || 0;
    const pendingAmount = Math.max(0, totalAmount - paidAmount);

    return {
      vendorName: v.vendorName,
      supplier: v.vendorName,
      totalAmount: `₹${totalAmount.toLocaleString()}`,
      rawTotalAmount: totalAmount,
      paidAmount: `₹${paidAmount.toLocaleString()}`,
      rawPaidAmount: paidAmount,
      pendingAmount: `₹${pendingAmount.toLocaleString()}`,
      rawPendingAmount: pendingAmount,
    };
  });

  res.json({ success: true, data });
});

/** POST /api/billing/packing-material/payments (Record Vendor Payment) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    vendorName,
    supplier,
    amount,
    amountPaid,
    totalAmount,
    bankName,
    bank,
    beneficiaryName,
    accountNo,
    paymentMode,
    transactionId,
    remark,
  } = req.body;

  const payAmount = Number(amount || amountPaid || totalAmount || 0);

  const payment = await PackingPayment.create({
    vendorName: vendorName || supplier || 'PackWell Ind.',
    supplier: supplier || vendorName || 'PackWell Ind.',
    date: new Date(),
    amount: payAmount,
    amountPaid: payAmount,
    bankName: bankName || bank || '',
    bank: bank || bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  });

  res.status(201).json({ success: true, data: payment, message: 'Packing material payment recorded successfully' });
});

/** GET /api/billing/packing-material/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [rawPayments, total] = await Promise.all([
    PackingPayment.find()
      .sort({ date: -1 })
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PackingPayment.countDocuments(),
  ]);

  const data = rawPayments.map((p) => ({
    _id: p._id,
    date: p.date,
    vendorName: p.vendorName || p.supplier || '',
    supplier: p.supplier || p.vendorName || '',
    amount: `₹${Number(p.amount || p.amountPaid || 0).toLocaleString()}`,
    rawAmount: Number(p.amount || p.amountPaid || 0),
    amountPaid: Number(p.amount || p.amountPaid || 0),
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
