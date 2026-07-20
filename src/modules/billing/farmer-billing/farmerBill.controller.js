'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FarmerBill = require('./farmerBill.model');
const { generateFarmerReceiptPDF } = require('../shared/billing.pdf');
const { sendBillNotification } = require('../shared/billing.notify');

const buildDateFilter = (date) => {
  if (!date) return null;
  return {
    $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
    $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
  };
};

/** GET /api/billing/farmer/bills */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { farmerName: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
      { vehicleNumber: { $regex: search, $options: 'i' } },
    ];
  }
  const df = buildDateFilter(date);
  if (df) query.date = df;
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    FarmerBill.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    FarmerBill.countDocuments(query),
  ]);
  res.json({
    success: true,
    data,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
  });
});

/** GET /api/billing/farmer/bills/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const overdueCutoff = new Date(now); overdueCutoff.setDate(now.getDate() - 25);
  const todayStart = new Date(now.setHours(0,0,0,0));

  const [farmersToday, overdueDocs, paidThisWeek, totalPayable] = await Promise.all([
    FarmerBill.countDocuments({ date: { $gte: todayStart } }),
    FarmerBill.find({ status: 'SENT', sentDate: { $lte: overdueCutoff } }).select('netPayable').lean(),
    FarmerBill.aggregate([{ $match: { status: 'PAID', updatedAt: { $gte: weekAgo } } }, { $group: { _id: null, total: { $sum: '$netPayable' }, count: { $sum: 1 } } }]),
    FarmerBill.aggregate([{ $match: { status: { $ne: 'PAID' } } }, { $group: { _id: null, total: { $sum: '$netPayable' } } }]),
  ]);

  const overdueAmount = overdueDocs.reduce((sum, d) => sum + (d.netPayable || 0), 0);
  res.json({
    success: true,
    data: {
      farmersToday,
      payableTotal: totalPayable[0]?.total ?? 0,
      overdue25Days: overdueDocs.length,
      overdueAmount,
      paidThisWeek: paidThisWeek[0]?.total ?? 0,
      paidFarmersCount: paidThisWeek[0]?.count ?? 0,
    },
  });
});

/** POST /api/billing/farmer/bills */
exports.create = asyncHandler(async (req, res) => {
  const bill = await FarmerBill.create(req.body);
  res.status(201).json({ success: true, data: bill });
});

/** GET /api/billing/farmer/bills/:id */
exports.getById = asyncHandler(async (req, res) => {
  const bill = await FarmerBill.findById(req.params.id).lean();
  if (!bill) return res.status(404).json({ success: false, message: 'Farmer bill not found' });
  res.json({ success: true, data: bill });
});

/** PATCH /api/billing/farmer/bills/:id */
exports.update = asyncHandler(async (req, res) => {
  const bill = await FarmerBill.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!bill) return res.status(404).json({ success: false, message: 'Farmer bill not found' });
  res.json({ success: true, data: bill });
});

/** GET /api/billing/farmer/bills/:id/pdf — Generate receipt PDF, upload to S3, cache URL */
exports.getPDF = asyncHandler(async (req, res) => {
  const bill = await FarmerBill.findById(req.params.id);
  if (!bill) return res.status(404).json({ success: false, message: 'Farmer bill not found' });
  if (bill.receiptUrl) {
    return res.json({ success: true, data: { pdfUrl: bill.receiptUrl } });
  }
  const pdfUrl = await generateFarmerReceiptPDF(bill);
  bill.receiptUrl = pdfUrl;
  await bill.save();
  res.json({ success: true, data: { pdfUrl } });
});

/** GET /api/billing/farmer/bills/:id/receipt */
exports.getReceipt = asyncHandler(async (req, res) => {
  const bill = await FarmerBill.findById(req.params.id).lean();
  if (!bill) return res.status(404).json({ success: false, message: 'Farmer bill not found' });
  res.json({
    success: true,
    data: {
      billId: bill._id,
      farmerName: bill.farmerName,
      date: bill.date,
      netPayable: bill.netPayable,
      status: bill.status,
      receiptUrl: bill.receiptUrl || null,
    },
  });
});

/** POST /api/billing/farmer/bills/:id/share */
exports.shareBill = asyncHandler(async (req, res) => {
  const { deviceToken, medium = 'firebase' } = req.body;
  const bill = await FarmerBill.findById(req.params.id).lean();
  if (!bill) return res.status(404).json({ success: false, message: 'Farmer bill not found' });
  let result;
  if (medium === 'firebase') {
    result = await sendBillNotification({
      deviceToken,
      title: 'Bill Ready',
      body: `Your bill for ₹${bill.netPayable} is ready.`,
      data: { billId: String(bill._id) },
    });
  } else {
    result = { status: 'pending_integration', medium };
  }
  res.json({ success: true, data: result });
});

/** GET /api/billing/farmer/bills/history */
exports.getHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    FarmerBill.find({ status: 'PAID' }).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    FarmerBill.countDocuments({ status: 'PAID' }),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});
