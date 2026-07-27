'use strict';
/**
 * Billing Sync Controller — Operational Execution Bridge
 * Reads completed Logistics assignments, Packing reports, Trip reports, and Advance records
 * (READ-ONLY queries on existing models) and auto-generates corresponding billing documents
 * in a single 1-click operation. Zero legacy code modified.
 */
const asyncHandler = require('../shared/billing.asyncHandler');
const Logistics = require('../../logistics/logistics.model');
const Packing = require('../../execution/packing.model');
const Trip = require('../../execution/trip.model');
const Enquiry = require('../../enquiries/enquiry.model');
const DieselAdvance = require('../../diesel-advance/dieselAdvance.model');
const PetrolAdvance = require('../../petrol-advance/petrolAdvance.model');

// Billing Models
const FarmerBill = require('../farmer-billing/farmerBill.model');
const CompanyBill = require('../company-billing/companyBill.model');
const MunshiLedger = require('../munshi/munshiLedger.model');
const EicherTrip = require('../eicher/eicherTrip.model');
const PickupTrip = require('../pickup/pickupTrip.model');
const BillingEmployee = require('../salary/employee.model');
const { logSystemAction } = require('../../../utils/auditLogger');

const counter = { seq: Date.now() };
const nextInvoiceNo = () => `INV-${++counter.seq}`;

/**
 * GET /api/billing/sync/unbilled-executions
 * Lists all completed logistics assignments that do not yet have generated billing records.
 */
exports.getUnbilledExecutions = asyncHandler(async (req, res) => {
  // Find completed assignments
  const completedAssignments = await Logistics.find({ assignmentStatus: 'COMPLETED' })
    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location purchaseRate')
    .populate('companyId', 'companyName')
    .populate('munshiId', 'firstName lastName mobileNo')
    .populate('vehicleId', 'vehicleNumber vehicleType')
    .sort({ updatedAt: -1 })
    .lean();

  if (completedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  const assignmentIds = completedAssignments.map((a) => a._id);

  // Check which ones already have billing records
  const existingFarmerBills = await FarmerBill.find({
    note: { $regex: /Auto-generated from assignment/, $options: 'i' },
  }).select('note').lean();

  // Extract assignment IDs from notes
  const billedAssignmentIds = new Set(
    existingFarmerBills
      .map((b) => {
        const match = b.note?.match(/assignment ([0-9a-fA-F]{24})/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
  );

  // Filter out already billed assignments
  const unbilled = completedAssignments.filter((a) => !billedAssignmentIds.has(String(a._id)));

  // Attach packing summary for preview
  const packingSummaries = await Packing.find({ assignmentId: { $in: unbilled.map((u) => u._id) } }).lean();
  const packingMap = Object.fromEntries(packingSummaries.map((p) => [String(p.assignmentId), p]));

  const result = unbilled.map((a) => {
    const p = packingMap[String(a._id)];
    const enq = a.enquiryId || {};
    return {
      assignmentId: a._id,
      enquiryId: enq.enquiryId || 'N/A',
      farmerName: `${enq.farmerFirstName || ''} ${enq.farmerLastName || ''}`.trim(),
      farmerMobile: enq.farmerMobile || '',
      location: enq.location || '',
      companyName: a.companyId?.companyName || '',
      vehicleNumber: a.vehicleId?.vehicleNumber || '',
      munshiName: `${a.munshiId?.firstName || ''} ${a.munshiId?.lastName || ''}`.trim(),
      totalBoxes: p?.totalBoxes || 0,
      wastageKg: p?.wastageKg || 0,
      purchaseRate: enq.purchaseRate || a.purchaseRate || 0,
      completedAt: a.updatedAt,
    };
  });

  res.json({ success: true, count: result.length, data: result });
});

/**
 * POST /api/billing/sync/from-execution/:assignmentId
 * Auto-generates FarmerBill, CompanyBill, MunshiLedger, EicherTrip, and PickupTrip
 * from a completed execution assignment in a single 1-click operation.
 */
exports.syncFromExecution = asyncHandler(async (req, res) => {
  const { assignmentId } = req.params;

  // 1. Fetch Logistics assignment
  const assignment = await Logistics.findById(assignmentId)
    .populate('enquiryId')
    .populate('companyId')
    .populate('munshiId')
    .populate('vehicleId')
    .populate('driverId')
    .populate('pickupDriverId');

  if (!assignment) {
    return res.status(404).json({ success: false, message: 'Logistics assignment not found' });
  }

  const enq = assignment.enquiryId || {};
  const company = assignment.companyId || {};
  const vehicle = assignment.vehicleId || {};
  const munshi = assignment.munshiId || {};
  const driver = assignment.driverId || {};
  const pickupDriver = assignment.pickupDriverId || {};

  // 2. Fetch Packing report
  const packing = await Packing.findOne({ assignmentId: assignment._id }).lean();

  // 3. Fetch Trip reports
  const trips = await Trip.find({ assignmentId: assignment._id }).lean();
  const eicherTripDoc = trips.find((t) => t.driverType === 'Eicher');
  const pickupTripDoc = trips.find((t) => t.driverType === 'Pickup');

  // 4. Fetch Issued Advances
  const dieselAdvances = await DieselAdvance.find({
    $or: [{ assignmentId: assignment._id }, { vehicleNumber: vehicle.vehicleNumber }],
  }).lean();
  const totalDieselAdvance = dieselAdvances.reduce((sum, d) => sum + (d.amount || 0), 0);

  const petrolAdvances = await PetrolAdvance.find({
    vehicleNumber: vehicle.vehicleNumber,
  }).lean();
  const totalPetrolAdvance = petrolAdvances.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Derived values
  const farmerName = `${enq.farmerFirstName || ''} ${enq.farmerLastName || ''}`.trim() || 'Farmer';
  const farmerContact = enq.farmerMobile || '';
  const location = enq.location || '';
  const companyName = company.companyName || 'Company';
  const vehicleNumber = vehicle.vehicleNumber || 'Vehicle';
  const munshiName = `${munshi.firstName || ''} ${munshi.lastName || ''}`.trim() || 'Munshi';
  const rate = enq.purchaseRate || assignment.purchaseRate || 0;
  const boxes = packing?.totalBoxes || 0;
  const wastage = packing?.wastageKg || 0;
  const packingType = packing?.box13Kg ? '13 KG' : packing?.box13_5Kg ? '13.5 KG' : packing?.box14Kg ? '14 KG' : packing?.box16Kg ? '16 KG' : 'Other';

  // Estimate total weight (e.g. 13 kg per box average if not explicitly stored)
  const boxWeightMultiplier = packingType === '13 KG' ? 13 : packingType === '13.5 KG' ? 13.5 : packingType === '14 KG' ? 14 : packingType === '16 KG' ? 16 : 13;
  const totalWeight = boxes * boxWeightMultiplier;

  const syncNote = `Auto-generated from assignment ${assignment._id}`;
  const generated = {};

  // A. Generate FarmerBill
  let farmerBill = await FarmerBill.findOne({ note: { $regex: assignment._id, $options: 'i' } });
  if (!farmerBill) {
    farmerBill = await FarmerBill.create({
      date: assignment.updatedAt || new Date(),
      farmerName,
      farmerContact,
      farmerRef: enq.farmerRef || null,
      location,
      companyName,
      companyRef: company._id || null,
      vehicleNumber,
      vehicleRef: vehicle._id || null,
      packingType,
      boxes,
      totalWeight,
      grossWeight: boxWeightMultiplier,
      wastage,
      danda: 0,
      rate,
      transport: eicherTripDoc?.tollExpense || 0,
      status: 'PENDING',
      note: syncNote,
    });
  }
  generated.farmerBill = farmerBill;

  // B. Generate CompanyBill
  let companyBill = await CompanyBill.findOne({ invoiceNo: { $regex: assignment._id, $options: 'i' } });
  if (!companyBill) {
    companyBill = await CompanyBill.create({
      date: assignment.updatedAt || new Date(),
      farmerName,
      farmerContact,
      farmerRef: enq.farmerRef || null,
      location,
      vehicleNumber,
      vehicleRef: vehicle._id || null,
      companyName,
      companyRef: company._id || null,
      rate,
      packingType,
      boxes,
      totalWeight,
      grossWeight: boxWeightMultiplier,
      status: 'PENDING',
      invoiceNo: nextInvoiceNo(),
    });
  }
  generated.companyBill = companyBill;

  // C. Generate MunshiLedger
  let munshiLedger = await MunshiLedger.findOne({
    munshiName,
    farmerName,
    boxes,
    date: {
      $gte: new Date(new Date(assignment.updatedAt).setHours(0, 0, 0, 0)),
      $lte: new Date(new Date(assignment.updatedAt).setHours(23, 59, 59, 999)),
    },
  });
  if (!munshiLedger && munshiName) {
    // Lookup employee profile to check commission rate
    const emp = await BillingEmployee.findOne({ name: { $regex: munshiName, $options: 'i' }, isActive: true }).lean();
    const commRate = emp?.commissionValue || 2; // Default ₹2/box if not set
    const amountPayable = boxes * commRate;

    munshiLedger = await MunshiLedger.create({
      date: assignment.updatedAt || new Date(),
      farmerName,
      farmerRef: enq.farmerRef || null,
      munshiName,
      munshiRef: munshi._id || null,
      companyName,
      companyRef: company._id || null,
      boxes,
      vehicleNumber,
      vehicleRef: vehicle._id || null,
      amountPayable,
    });
  }
  generated.munshiLedger = munshiLedger;

  // D. Generate EicherTrip (if Eicher trip report exists)
  if (eicherTripDoc) {
    let eicherTrip = await EicherTrip.findOne({
      vehicleNumber,
      date: {
        $gte: new Date(new Date(eicherTripDoc.createdAt).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(eicherTripDoc.createdAt).setHours(23, 59, 59, 999)),
      },
    });
    if (!eicherTrip) {
      eicherTrip = await EicherTrip.create({
        date: eicherTripDoc.createdAt || new Date(),
        vehicleNumber,
        vehicleRef: vehicle._id || null,
        route: `${eicherTripDoc.startRoute || ''} to ${eicherTripDoc.destination || ''}`.trim(),
        km: eicherTripDoc.totalKm || 0,
        toll: eicherTripDoc.tollExpense || 0,
        hault: eicherTripDoc.isHault ? 500 : 0,
        dieselAdvance: totalDieselAdvance,
        lineCancel: eicherTripDoc.isLineCancel ? 300 : 0,
        netPayable: Math.max(0, (eicherTripDoc.totalKm || 0) * 40 + (eicherTripDoc.tollExpense || 0) - totalDieselAdvance),
      });
    }
    generated.eicherTrip = eicherTrip;
  }

  // E. Generate PickupTrip (if Pickup trip report exists)
  if (pickupTripDoc) {
    let pickupTrip = await PickupTrip.findOne({
      vehicleNumber,
      date: {
        $gte: new Date(new Date(pickupTripDoc.createdAt).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(pickupTripDoc.createdAt).setHours(23, 59, 59, 999)),
      },
    });
    if (!pickupTrip) {
      const driverName = `${pickupDriver.firstName || ''} ${pickupDriver.lastName || ''}`.trim() || 'Pickup Driver';
      pickupTrip = await PickupTrip.create({
        date: pickupTripDoc.createdAt || new Date(),
        vehicleNumber,
        vehicleRef: vehicle._id || null,
        driver: driverName,
        driverRef: pickupDriver._id || null,
        route1: pickupTripDoc.startRoute || location,
        route2: pickupTripDoc.destination || companyName,
        km: pickupTripDoc.totalKm || 0,
        fuel: totalPetrolAdvance,
        toll: pickupTripDoc.tollExpense || 0,
        amount: Math.max(0, (pickupTripDoc.totalKm || 0) * 20 + (pickupTripDoc.tollExpense || 0)),
      });
    }
    generated.pickupTrip = pickupTrip;
  }

  // Log system action
  await logSystemAction(
    req.user._id,
    'CREATE',
    'Billing',
    assignment._id,
    `Auto-generated billing documents from completed assignment ${assignment._id}`
  );

  res.status(201).json({
    success: true,
    message: 'Billing documents synchronized successfully from execution assignment',
    data: generated,
  });
});
