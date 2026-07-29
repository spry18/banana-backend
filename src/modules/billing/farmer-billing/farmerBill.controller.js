'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FarmerBill = require('./farmerBill.model');
const Farmer = require('../../farmers/farmer.model');
const Company = require('../../master-data/company.model');
const Vehicle = require('../../master-data/vehicle.model');
const Enquiry = require('../../enquiries/enquiry.model');
const Logistics = require('../../logistics/logistics.model');
const Packing = require('../../execution/packing.model');
const { generateFarmerReceiptPDF } = require('../shared/billing.pdf');
const { sendBillNotification } = require('../shared/billing.notify');

const buildDateFilter = (date) => {
  if (!date) return null;
  return {
    $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
    $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
  };
};

/** GET /api/billing/farmer/bills/approved-enquiries — Fetch all Admin-Approved/Completed Enquiries ready for Farmer Billing */
exports.getApprovedEnquiries = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;

  // 1. Fetch completed or approved logistics assignments populated with full enquiry and staff details
  const completedAssignments = await Logistics.find({ assignmentStatus: { $in: ['COMPLETED', 'APPROVED'] } })
    .populate({
      path: 'enquiryId',
      populate: [
        { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
        { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' },
        { path: 'generation', select: 'name' },
      ],
    })
    .populate('companyId', 'companyName')
    .populate('vehicleId', 'vehicleNumber vehicleType')
    .populate('munshiId', 'firstName lastName mobileNo')
    .populate('driverId', 'firstName lastName mobileNo')
    .populate('pickupDriverId', 'firstName lastName mobileNo')
    .sort({ updatedAt: -1 })
    .lean();

  if (completedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  // Filter ONLY assignments whose associated Enquiry has ADMIN FINAL APPROVAL (status === 'COMPLETED')
  const adminApprovedAssignments = completedAssignments.filter((a) => a.enquiryId && a.enquiryId.status === 'COMPLETED');

  if (adminApprovedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  // 2. Fetch packing reports & existing farmer bills
  const assignmentIds = adminApprovedAssignments.map((a) => a._id);
  const enquiryDbIds = adminApprovedAssignments.map((a) => a.enquiryId?._id).filter(Boolean);
  const enquiryStringIds = adminApprovedAssignments.map((a) => a.enquiryId?.enquiryId).filter(Boolean);

  const farmerNames = adminApprovedAssignments
    .map((a) => `${a.enquiryId?.farmerFirstName || ''} ${a.enquiryId?.farmerLastName || ''}`.trim())
    .filter(Boolean);

  const [packingList, existingBills] = await Promise.all([
    Packing.find({ assignmentId: { $in: assignmentIds } }).lean(),
    FarmerBill.find({
      $or: [
        { assignmentRef: { $in: assignmentIds } },
        { enquiryRef: { $in: enquiryDbIds } },
        { enquiryId: { $in: enquiryStringIds } },
        { farmerName: { $in: farmerNames } },
        { note: { $regex: assignmentIds.map(id => String(id)).join('|'), $options: 'i' } }
      ]
    }).lean()
  ]);

  const packingMap = Object.fromEntries(packingList.map((p) => [String(p.assignmentId), p]));
  const billMap = {};
  existingBills.forEach((b) => {
    if (b.assignmentRef) billMap[String(b.assignmentRef)] = b;
    if (b.enquiryRef) billMap[String(b.enquiryRef)] = b;
    if (b.enquiryId) billMap[String(b.enquiryId)] = b;
    if (b.farmerName && b.vehicleNumber) billMap[`${b.farmerName.trim()}_${b.vehicleNumber.trim()}`] = b;
    if (b.farmerName) billMap[b.farmerName.trim()] = b;
  });

  // 3. Transform into clean Farmer Billing UI objects with full details & billing status
  const result = adminApprovedAssignments
    .map((a) => {
      const enq = a.enquiryId || {};
      const p = packingMap[String(a._id)];
      const farmerName = `${enq.farmerFirstName || ''} ${enq.farmerLastName || ''}`.trim() || 'Farmer';
      const vehicleNumber = a.vehicleId?.vehicleNumber || '';
      const existingBill = billMap[String(a._id)] || billMap[String(enq._id)] || billMap[String(enq.enquiryId)] || billMap[`${farmerName}_${vehicleNumber.trim()}`] || billMap[farmerName] || null;
      const farmerContact = enq.farmerMobile || '';
      const location = enq.location || '';
      const subLocation = enq.subLocation || '';
      const companyName = a.companyId?.companyName || '';
      const rate = enq.purchaseRate || a.purchaseRate || 0;
      const boxes = p?.totalBoxes || enq.estimatedBoxes || 0;
      const wastage = p?.wastageKg || 0;

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

      // Normalize string representation
      const ptNorm = String(packingType).trim().toUpperCase();
      if (ptNorm === '13.5KG' || ptNorm === '13.5 KG') packingType = '13.5 KG';
      else if (ptNorm === '13KG' || ptNorm === '13 KG') packingType = '13 KG';
      else if (ptNorm === '14KG' || ptNorm === '14 KG') packingType = '14 KG';
      else if (ptNorm === '16KG' || ptNorm === '16 KG') packingType = '16 KG';
      else if (ptNorm === '7KG' || ptNorm === '7 KG') packingType = '7 KG';
      else if (ptNorm === '5KG' || ptNorm === '5 KG') packingType = '5 KG';

      const boxWeightMultiplier = packingType === '13.5 KG' ? 13.5 : packingType === '13 KG' ? 13 : packingType === '14 KG' ? 14 : packingType === '16 KG' ? 16 : packingType === '7 KG' ? 7 : packingType === '5 KG' ? 5 : 13;
      const vehicleWeight = enq.actualWeight ? enq.actualWeight : (boxes > 0 ? boxes * boxWeightMultiplier : 0);
      const remainingWeight = Math.max(0, vehicleWeight - boxes);
      const netWeight = remainingWeight + wastage;
      const danda = 0;
      const finalTotalWeight = netWeight + danda;
      const initialAmount = Math.round(finalTotalWeight * rate * 100) / 100;

      return {
        assignmentId: a._id,
        enquiryId: enq.enquiryId || '',
        enquiryDbId: enq._id || null,
        enquiryStatus: enq.status, // Always 'COMPLETED' (Admin Final Approved)
        isBilled: Boolean(existingBill),
        billId: existingBill ? existingBill._id : null,
        billStatus: existingBill ? existingBill.status : null,
        farmerName,
        farmerContact,
        farmerRef: enq.farmerRef || null,
        location,
        subLocation,
        companyName,
        companyRef: a.companyId?._id || null,
        vehicleNumber,
        vehicleRef: a.vehicleId?._id || null,
        packingType,
        boxes,
        vehicleWeight,
        remainingWeight,
        wastage,
        netWeight,
        danda,
        finalTotalWeight,
        totalWeight: finalTotalWeight,
        grossWeight: boxWeightMultiplier,
        rate,
        transport: 0,
        initialAmount,
        totalAmount: initialAmount,
        netPayable: initialAmount,
        completedAt: a.updatedAt,

        // --- Detailed Nested Objects ---
        enquiryDetails: {
          _id: enq._id,
          enquiryId: enq.enquiryId,
          farmerFirstName: enq.farmerFirstName,
          farmerLastName: enq.farmerLastName,
          farmerMobile: enq.farmerMobile,
          location: enq.location,
          subLocation: enq.subLocation,
          plantCount: enq.plantCount,
          purchaseRate: enq.purchaseRate,
          actualWeight: enq.actualWeight || null,
          estimatedBoxes: enq.estimatedBoxes,
          remarks: enq.remarks,
          fieldOwner: enq.fieldOwnerId || null,
          assignedSelector: enq.assignedSelectorId || null,
          generation: enq.generation || null,
          status: enq.status,
          createdAt: enq.createdAt,
          updatedAt: enq.updatedAt,
        },
        logisticsDetails: {
          assignmentId: a._id,
          assignmentStatus: a.assignmentStatus,
          munshi: a.munshiId || null,
          driver: a.driverId || null,
          pickupDriver: a.pickupDriverId || null,
          company: a.companyId || null,
          vehicle: a.vehicleId || null,
          scheduledDate: a.scheduledDate || null,
          lightInTime: a.lightInTime || null,
          lightOutTime: a.lightOutTime || null,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        },
        packingDetails: p ? {
          packingId: p._id,
          totalBoxes: p.totalBoxes,
          box4H: p.box4H,
          box5H: p.box5H,
          box6H: p.box6H,
          box8H: p.box8H,
          boxCL: p.boxCL,
          box7Kg: p.box7Kg,
          box13Kg: p.box13Kg,
          box13_5Kg: p.box13_5Kg,
          box14Kg: p.box14Kg,
          box16Kg: p.box16Kg,
          boxOther: p.boxOther,
          wastageKg: p.wastageKg,
          wastageReason: p.wastageReason,
          remarks: p.remarks,
          photos: p.photos || [],
          status: p.status,
        } : null,
      };
    })
    .filter((item) => {
      if (req.query.unbilledOnly === 'true' && item.isBilled) {
        return false;
      }
      if (!search) return true;
      const term = search.trim().toLowerCase();
      return (
        item.farmerName.toLowerCase().includes(term) ||
        item.companyName.toLowerCase().includes(term) ||
        item.location.toLowerCase().includes(term) ||
        item.enquiryId.toLowerCase().includes(term)
      );
    });

  res.json({ success: true, count: result.length, data: result });
});

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
    FarmerBill.find(query)
      .populate('farmerRef', 'name mobile location')
      .populate('companyRef', 'companyName')
      .populate('vehicleRef', 'vehicleNumber vehicleType')
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
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
  const body = { ...req.body };

  // Auto-resolve farmer details if farmerRef is passed
  if (body.farmerRef) {
    const farmer = await Farmer.findById(body.farmerRef).lean();
    if (farmer) {
      if (!body.farmerName) body.farmerName = farmer.name;
      if (!body.farmerContact) body.farmerContact = farmer.mobile;
      if (!body.location) body.location = farmer.location;
    }
  }

  // Auto-resolve companyName if companyRef is passed
  if (body.companyRef && !body.companyName) {
    const company = await Company.findById(body.companyRef).lean();
    if (company) body.companyName = company.companyName;
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
    const logistics = await Logistics.findById(body.assignmentRef).select('enquiryId').lean();
    if (logistics && logistics.enquiryId) {
      body.enquiryRef = logistics.enquiryId;
      const enq = await Enquiry.findById(logistics.enquiryId).select('enquiryId').lean();
      if (enq && !body.enquiryId) body.enquiryId = enq.enquiryId;
    }
  }

  const bill = await FarmerBill.create(body);
  res.status(201).json({ success: true, data: bill });
});

/** GET /api/billing/farmer/bills/:id */
exports.getById = asyncHandler(async (req, res) => {
  const bill = await FarmerBill.findById(req.params.id)
    .populate('farmerRef', 'name mobile location')
    .populate('companyRef', 'companyName')
    .populate('vehicleRef', 'vehicleNumber vehicleType')
    .lean();
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
    FarmerBill.find({ status: 'PAID' })
      .populate('farmerRef', 'name mobile location')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    FarmerBill.countDocuments({ status: 'PAID' }),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});
