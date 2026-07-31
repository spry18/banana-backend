'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const CompanyBill = require('./companyBill.model');
const Company = require('../../master-data/company.model');
const Farmer = require('../../farmers/farmer.model');
const Vehicle = require('../../master-data/vehicle.model');
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
    CompanyBill.find(query)
      .populate('companyRef', 'companyName')
      .populate('farmerRef', 'name mobile location')
      .populate('vehicleRef', 'vehicleNumber vehicleType')
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CompanyBill.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) } });
});

/** GET /api/billing/company/bills/approved-dispatches — Fetch all Admin-Approved dispatches ready for Company Billing */
exports.getApprovedDispatches = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;

  const Logistics = require('../../logistics/logistics.model');
  const Packing = require('../../execution/packing.model');

  const completedAssignments = await Logistics.find({ assignmentStatus: { $in: ['COMPLETED', 'APPROVED'] } })
    .populate({
      path: 'enquiryId',
      populate: [
        { path: 'fieldOwnerId', select: 'firstName lastName mobile' },
        { path: 'assignedSelectorId', select: 'firstName lastName mobile' },
        { path: 'generation', select: 'name' }
      ]
    })
    .populate('companyId', 'companyName code')
    .populate('munshiId', 'firstName lastName mobileNo')
    .populate('driverId', 'firstName lastName mobileNo')
    .populate('pickupDriverId', 'firstName lastName mobileNo')
    .populate('vehicleId', 'vehicleNumber vehicleType')
    .sort({ updatedAt: -1 })
    .lean();

  if (completedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  const adminApprovedAssignments = completedAssignments.filter(
    (a) => a.enquiryId && a.enquiryId.status === 'COMPLETED'
  );

  if (adminApprovedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  const assignmentIds = adminApprovedAssignments.map((a) => a._id);
  const enquiryDbIds = adminApprovedAssignments.map((a) => a.enquiryId?._id).filter(Boolean);
  const enquiryStringIds = adminApprovedAssignments.map((a) => a.enquiryId?.enquiryId).filter(Boolean);
  const companyNames = adminApprovedAssignments.map((a) => a.companyId?.companyName).filter(Boolean);

  const norm = (str) => (str || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

  const [packingList, existingBills] = await Promise.all([
    Packing.find({ assignmentId: { $in: assignmentIds } }).lean(),
    CompanyBill.find({
      $or: [
        { assignmentRef: { $in: assignmentIds } },
        { enquiryRef: { $in: enquiryDbIds } },
        { enquiryId: { $in: enquiryStringIds } },
        { companyName: { $in: companyNames.map(n => new RegExp(`^${n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i')) } }
      ]
    }).lean()
  ]);

  const packingMap = Object.fromEntries(packingList.map((p) => [String(p.assignmentId), p]));
  const billMap = {};
  existingBills.forEach((b) => {
    if (b.assignmentRef) billMap[String(b.assignmentRef)] = b;
    if (b.enquiryRef) billMap[String(b.enquiryRef)] = b;
    if (b.enquiryId) billMap[String(b.enquiryId)] = b;
    if (b.companyName && b.vehicleNumber) billMap[`${norm(b.companyName)}_${norm(b.vehicleNumber)}`] = b;
  });

  const result = adminApprovedAssignments
    .map((a) => {
      const enq = a.enquiryId || {};
      const p = packingMap[String(a._id)];
      const companyName = a.companyId?.companyName || '';
      const vehicleNumber = a.vehicleId?.vehicleNumber || '';
      const farmerName = `${enq.farmerFirstName || ''} ${enq.farmerLastName || ''}`.trim() || 'Farmer';
      const farmerContact = enq.farmerMobile || '';
      const location = enq.location || '';
      const rate = enq.purchaseRate || a.purchaseRate || 0;
      const boxes = p?.totalBoxes || enq.estimatedBoxes || 0;

      let packingType = enq.packingType || 'Other';
      if (p) {
        if (p.box13_5Kg > 0) packingType = '13.5 KG';
        else if (p.box13Kg > 0) packingType = '13 KG';
        else if (p.box14Kg > 0) packingType = '14 KG';
        else if (p.box16Kg > 0) packingType = '16 KG';
        else if (p.box7Kg > 0) packingType = '7 KG';
        else if (p.box5Kg > 0) packingType = '5 KG';
        else if (enq.packingType) packingType = enq.packingType;
      }

      const existingBill = billMap[String(a._id)] || billMap[String(enq._id)] || billMap[String(enq.enquiryId)] || billMap[`${norm(companyName)}_${norm(vehicleNumber)}`] || null;

      const boxWeightMultiplier = packingType === '13.5 KG' ? 13.5 : packingType === '13 KG' ? 13 : packingType === '14 KG' ? 14 : packingType === '16 KG' ? 16 : packingType === '7 KG' ? 7 : packingType === '5 KG' ? 5 : 13;

      return {
        assignmentId: a._id,
        enquiryId: enq.enquiryId || '',
        enquiryDbId: enq._id || null,
        isBilled: Boolean(existingBill),
        billId: existingBill ? existingBill._id : null,
        billStatus: existingBill ? existingBill.status : null,
        invoiceNo: existingBill ? existingBill.invoiceNo : null,
        companyName,
        companyRef: a.companyId?._id || null,
        companyId: a.companyId?._id || null,
        farmerName,
        farmerContact,
        farmerRef: enq.farmerRef || null,
        farmerId: enq.farmerRef || null,
        location,
        vehicleNumber,
        vehicleRef: a.vehicleId?._id || null,
        vehicleId: a.vehicleId?._id || null,
        packingType: existingBill?.packingType || packingType,
        boxes: existingBill?.boxes ?? boxes,
        totalWeight: existingBill?.totalWeight ?? 0,
        grossWeight: boxWeightMultiplier,
        rate: existingBill?.rate ?? rate,
        billAmount: existingBill?.billAmount ?? 0,
        completedAt: a.updatedAt
      };
    })
    .filter((item) => {
      if (req.query.unbilledOnly === 'true' && item.isBilled) return false;
      if (!search) return true;
      const term = search.trim().toLowerCase();
      return (
        item.companyName.toLowerCase().includes(term) ||
        item.farmerName.toLowerCase().includes(term) ||
        item.vehicleNumber.toLowerCase().includes(term) ||
        item.enquiryId.toLowerCase().includes(term)
      );
    });

  res.json({ success: true, count: result.length, data: result });
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

  if (body.companyId && !body.companyRef) body.companyRef = body.companyId;
  if (body.farmerId && !body.farmerRef) body.farmerRef = body.farmerId;
  if (body.vehicleId && !body.vehicleRef) body.vehicleRef = body.vehicleId;

  // Auto-resolve companyName if companyRef is passed
  if (body.companyRef && !body.companyName) {
    const company = await Company.findById(body.companyRef).lean();
    if (company) body.companyName = company.companyName;
  }

  // Auto-resolve farmerName if farmerRef is passed
  if (body.farmerRef) {
    const farmer = await Farmer.findById(body.farmerRef).lean();
    if (farmer) {
      if (!body.farmerName) body.farmerName = farmer.name;
      if (!body.farmerContact) body.farmerContact = farmer.mobile;
      if (!body.location) body.location = farmer.location;
    }
  }

  // Auto-resolve vehicleNumber if vehicleRef is passed
  if (body.vehicleRef && !body.vehicleNumber) {
    const vehicle = await Vehicle.findById(body.vehicleRef).lean();
    if (vehicle) body.vehicleNumber = vehicle.vehicleNumber;
  }

  // Auto-resolve assignmentRef & enquiryRef if passed
  if (body.assignmentId && !body.assignmentRef) {
    body.assignmentRef = body.assignmentId;
  }
  if (body.assignmentRef && !body.enquiryRef) {
    const Logistics = require('../../logistics/logistics.model');
    const Enquiry = require('../../enquiries/enquiry.model');
    const logistics = await Logistics.findById(body.assignmentRef).select('enquiryId').lean();
    if (logistics && logistics.enquiryId) {
      body.enquiryRef = logistics.enquiryId;
      const enq = await Enquiry.findById(logistics.enquiryId).select('enquiryId').lean();
      if (enq && !body.enquiryId) body.enquiryId = enq.enquiryId;
    }
  }

  const bill = await CompanyBill.create(body);
  res.status(201).json({ success: true, data: bill });
});

/** GET /api/billing/company/bills/:id */
exports.getById = asyncHandler(async (req, res) => {
  const bill = await CompanyBill.findById(req.params.id)
    .populate('companyRef', 'companyName')
    .populate('farmerRef', 'name mobile location')
    .populate('vehicleRef', 'vehicleNumber vehicleType')
    .lean();
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
  const bill = await CompanyBill.findById(req.params.id)
    .populate('companyRef', 'companyName')
    .populate('farmerRef', 'name mobile location')
    .populate('vehicleRef', 'vehicleNumber vehicleType')
    .lean();
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
    CompanyBill.find()
      .populate('companyRef', 'companyName')
      .populate('farmerRef', 'name mobile location')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
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
