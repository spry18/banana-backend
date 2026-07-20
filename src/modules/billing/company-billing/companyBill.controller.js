'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const CompanyBill = require('./companyBill.model');
const { generateCompanyInvoicePDF } = require('../shared/billing.pdf');
const { sendBillNotification } = require('../shared/billing.notify');
const ExcelJS = require('exceljs');

const counter = { seq: Date.now() };
const nextInvoiceNo = () => `INV-${++counter.seq}`;

/** GET /api/billing/company/bills */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { farmerName: { $regex: search, $options: 'i' } },
      { vehicleNumber: { $regex: search, $options: 'i' } },
    ];
  }
  if (date) {
    query.date = {
      $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
      $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
    };
  }
  if (status) query.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    CompanyBill.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    CompanyBill.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
});

/** GET /api/billing/company/bills/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const [todayAgg, overallAgg, weekPayments] = await Promise.all([
    CompanyBill.aggregate([{ $match: { date: { $gte: todayStart } } }, { $group: { _id: null, vehicles: { $sum: 1 }, billedValue: { $sum: '$billAmount' } } }]),
    CompanyBill.aggregate([{ $match: { status: { $ne: 'PAID' } } }, { $group: { _id: '$status', total: { $sum: '$billAmount' }, count: { $sum: 1 } } }]),
    CompanyBill.aggregate([{ $match: { status: 'PAID', updatedAt: { $gte: weekAgo } } }, { $group: { _id: null, received: { $sum: '$billAmount' } } }]),
  ]);
  res.json({
    success: true,
    data: {
      todayVehicles: todayAgg[0]?.vehicles ?? 0,
      billedValue: todayAgg[0]?.billedValue ?? 0,
      paymentReceivedThisWeek: weekPayments[0]?.received ?? 0,
      outstanding: overallAgg.reduce((sum, item) => sum + item.total, 0),
    },
  });
});

/** POST /api/billing/company/bills */
exports.create = asyncHandler(async (req, res) => {
  const body = { ...req.body, invoiceNo: req.body.invoiceNo || nextInvoiceNo() };
  const bill = await CompanyBill.create(body);
  res.status(201).json({ success: true, data: bill });
});

/** GET /api/billing/company/bills/:id */
exports.getById = asyncHandler(async (req, res) => {
  const bill = await CompanyBill.findById(req.params.id).lean();
  if (!bill) return res.status(404).json({ success: false, message: 'Company bill not found' });
  res.json({ success: true, data: bill });
});

/** PATCH /api/billing/company/bills/:id */
exports.update = asyncHandler(async (req, res) => {
  const bill = await CompanyBill.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!bill) return res.status(404).json({ success: false, message: 'Company bill not found' });
  res.json({ success: true, data: bill });
});

/** DELETE /api/billing/company/bills/:id (outstanding delete reuses this) */
exports.remove = asyncHandler(async (req, res) => {
  await CompanyBill.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Bill deleted' });
});

/** GET /api/billing/company/bills/:id/pdf */
exports.getPDF = asyncHandler(async (req, res) => {
  const bill = await CompanyBill.findById(req.params.id);
  if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
  if (bill.invoiceUrl) return res.json({ success: true, data: { pdfUrl: bill.invoiceUrl } });
  const pdfUrl = await generateCompanyInvoicePDF(bill);
  bill.invoiceUrl = pdfUrl;
  await bill.save();
  res.json({ success: true, data: { pdfUrl } });
});

/** GET /api/billing/company/bills/:id/invoice */
exports.getInvoice = asyncHandler(async (req, res) => {
  const bill = await CompanyBill.findById(req.params.id).lean();
  if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
  res.json({ success: true, data: bill });
});

/** POST /api/billing/company/bills/:id/share */
exports.shareBill = asyncHandler(async (req, res) => {
  const { deviceToken, medium = 'firebase' } = req.body;
  const bill = await CompanyBill.findById(req.params.id).lean();
  if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
  const result = await sendBillNotification({
    deviceToken,
    title: 'Invoice Ready',
    body: `Invoice ${bill.invoiceNo} for ${bill.companyName} — ₹${bill.billAmount}`,
    data: { billId: String(bill._id), invoiceNo: bill.invoiceNo },
  });
  res.json({ success: true, data: result });
});

/** GET /api/billing/company/bills/club?vehicle1=&vehicle2= */
exports.getClubData = asyncHandler(async (req, res) => {
  const { vehicle1, vehicle2 } = req.query;
  if (!vehicle1 || !vehicle2) return res.status(400).json({ success: false, message: 'vehicle1 and vehicle2 are required' });
  const bills = await CompanyBill.find({ vehicleNumber: { $in: [vehicle1, vehicle2] } }).sort({ date: -1 }).limit(2).lean();
  const totalBoxes = bills.reduce((s, b) => s + (b.boxes || 0), 0);
  const totalWeight = bills.reduce((s, b) => s + (b.totalWeight || 0), 0);
  res.json({ success: true, data: { list: bills, totalBoxes, totalWeight } });
});

/** POST /api/billing/company/bills/club */
exports.createClubBill = asyncHandler(async (req, res) => {
  const { vehicleNos = [], companyId, ...rest } = req.body;
  const clubBill = await CompanyBill.create({
    ...rest,
    isClubBill: true,
    clubVehicles: vehicleNos,
    invoiceNo: nextInvoiceNo(),
  });
  res.status(201).json({ success: true, data: clubBill });
});

/** GET /api/billing/company/outstanding */
exports.getOutstanding = asyncHandler(async (req, res) => {
  const data = await CompanyBill.aggregate([
    { $match: { status: { $ne: 'PAID' } } },
    {
      $group: {
        _id: '$companyName',
        companyName: { $first: '$companyName' },
        totalBill: { $sum: '$billAmount' },
        outstanding: { $sum: '$billAmount' },
      },
    },
    { $sort: { outstanding: -1 } },
  ]);
  res.json({ success: true, data });
});

/** GET /api/billing/company/history */
exports.getHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    CompanyBill.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    CompanyBill.countDocuments(),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/company/history/export */
exports.exportHistory = asyncHandler(async (req, res) => {
  const bills = await CompanyBill.find().sort({ date: -1 }).lean();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Company Bills');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Company', key: 'companyName', width: 20 },
    { header: 'Farmer', key: 'farmerName', width: 20 },
    { header: 'Vehicle No', key: 'vehicleNumber', width: 15 },
    { header: 'Boxes', key: 'boxes', width: 10 },
    { header: 'Weight (kg)', key: 'totalWeight', width: 12 },
    { header: 'Bill Amount', key: 'billAmount', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Invoice No', key: 'invoiceNo', width: 18 },
  ];
  bills.forEach((b) => sheet.addRow({ ...b, date: b.date ? new Date(b.date).toLocaleDateString('en-IN') : '' }));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="company_bills.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
