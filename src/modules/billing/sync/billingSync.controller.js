'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');

// Models from existing legacy modules (READ-ONLY)
const Logistics = require('../../logistics/logistics.model');
const Packing = require('../../execution/packing.model');
const Trip = require('../../execution/trip.model');
const Enquiry = require('../../enquiries/enquiry.model');
const DieselAdvance = require('../../diesel-advance/dieselAdvance.model');
const PetrolAdvance = require('../../petrol-advance/petrolAdvance.model');
const Vehicle = require('../../master-data/vehicle.model');
const Company = require('../../master-data/company.model');
const User = require('../../users/user.model');

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
 * Lists all completed logistics assignments whose Enquiries have ADMIN FINAL APPROVAL (status === 'COMPLETED')
 * that do not yet have generated billing records.
 */
exports.getUnbilledExecutions = asyncHandler(async (req, res) => {
  // Find completed assignments
  const completedAssignments = await Logistics.find({ assignmentStatus: 'COMPLETED' })
    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location purchaseRate status')
    .populate('companyId', 'companyName')
    .populate('munshiId', 'firstName lastName mobileNo')
    .populate('vehicleId', 'vehicleNumber vehicleType')
    .sort({ updatedAt: -1 })
    .lean();

  if (completedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  // Filter ONLY assignments whose associated Enquiry has received ADMIN FINAL APPROVAL (status === 'COMPLETED')
  const adminApprovedAssignments = completedAssignments.filter((a) => a.enquiryId && a.enquiryId.status === 'COMPLETED');

  if (adminApprovedAssignments.length === 0) {
    return res.json({ success: true, count: 0, data: [] });
  }

  const assignmentIds = adminApprovedAssignments.map((a) => a._id);

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
  const unbilled = adminApprovedAssignments.filter((a) => !billedAssignmentIds.has(String(a._id)));

  // Attach packing summary for preview
  const packingSummaries = await Packing.find({ assignmentId: { $in: unbilled.map((u) => u._id) } }).lean();
  const packingMap = Object.fromEntries(packingSummaries.map((p) => [String(p.assignmentId), p]));

  const result = unbilled.map((a) => {
    const p = packingMap[String(a._id)];
    const enq = a.enquiryId || {};
    return {
      assignmentId: a._id,
      enquiryId: enq.enquiryId || 'N/A',
      enquiryStatus: enq.status, // Always 'COMPLETED' (Admin Final Approved)
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
 * Requires Admin Final Approval (enquiry.status === 'COMPLETED').
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

  // Ensure Enquiry has received ADMIN FINAL APPROVAL (status === 'COMPLETED')
  if (assignment.enquiryId && assignment.enquiryId.status !== 'COMPLETED') {
    return res.status(400).json({
      success: false,
      message: `Enquiry '${assignment.enquiryId.enquiryId || ''}' is currently in status '${assignment.enquiryId.status}'. Final Admin Approval is required before generating bills.`,
    });
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

  // 4. Fetch Issued Advances safely
  let totalDieselAdvance = 0;
  try {
    const dieselAdvances = await DieselAdvance.find({
      $or: [{ assignmentId: assignment._id }, { vehicleNumber: vehicle.vehicleNumber }],
    }).lean();
    totalDieselAdvance = dieselAdvances.reduce((sum, d) => sum + (d.amount || 0), 0);
  } catch (err) {
    totalDieselAdvance = 0;
  }

  let totalPetrolAdvance = 0;
  try {
    const petrolAdvances = await PetrolAdvance.find({
      vehicleNumber: vehicle.vehicleNumber,
    }).lean();
    totalPetrolAdvance = petrolAdvances.reduce((sum, p) => sum + (p.amount || 0), 0);
  } catch (err) {
    totalPetrolAdvance = 0;
  }

  // Derived values
  const farmerName = `${enq.farmerFirstName || ''} ${enq.farmerLastName || ''}`.trim() || 'Farmer';
  const farmerContact = enq.farmerMobile || '';
  const location = enq.location || '';
  const companyName = company.companyName || '';
  const vehicleNumber = vehicle.vehicleNumber || '';
  const rate = enq.purchaseRate || assignment.purchaseRate || 0;

  const boxes = packing?.totalBoxes || 0;
  const wastage = packing?.wastageKg || 0;
  const packingType = packing?.box13Kg ? '13 KG' : packing?.box13_5Kg ? '13.5 KG' : packing?.box14Kg ? '14 KG' : packing?.box16Kg ? '16 KG' : '13 KG';
  const boxWeightMultiplier = packingType === '13 KG' ? 13 : packingType === '13.5 KG' ? 13.5 : packingType === '14 KG' ? 14 : packingType === '16 KG' ? 16 : 13;
  const totalWeight = boxes * boxWeightMultiplier;
  const grossWeight = boxWeightMultiplier;
  const transport = eicherTripDoc?.tollExpense || 0;

  // A. Generate Farmer Bill
  const farmerBillData = {
    date: new Date(),
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
    grossWeight,
    wastage,
    rate,
    transport,
    note: `Auto-generated from assignment ${assignment._id}`,
    status: 'PENDING',
  };

  // B. Generate Company Bill
  const companyBillData = {
    date: new Date(),
    farmerName,
    farmerContact,
    farmerRef: enq.farmerRef || null,
    location,
    vehicleNumber,
    vehicleRef: vehicle._id || null,
    companyName,
    companyRef: company._id || null,
    rate,
    packingType: packingType.toLowerCase(),
    boxes,
    totalWeight,
    grossWeight,
    invoiceNo: nextInvoiceNo(),
    status: 'PENDING',
  };

  // C. Generate Munshi Ledger Entry
  const munshiName = `${munshi.firstName || ''} ${munshi.lastName || ''}`.trim() || 'Munshi';
  const munshiRatePerBox = 2;
  const munshiLedgerData = {
    date: new Date(),
    farmerName,
    munshiName,
    company: companyName,
    boxes,
    vehicleNumber,
    amountPayable: boxes * munshiRatePerBox,
  };

  // D. Generate Eicher Trip Entry
  const eicherTripData = {
    date: new Date(),
    vehicleNumber,
    route: `${eicherTripDoc?.startRoute || 'Plot'} -> ${eicherTripDoc?.destination || companyName}`,
    km: eicherTripDoc?.totalKm || 0,
    toll: eicherTripDoc?.tollExpense || 0,
    dieselAdvance: totalDieselAdvance,
    period: 'Daily',
  };

  // E. Generate Pickup Trip Entry
  const pickupTripData = {
    date: new Date(),
    vehicleNumber: pickupTripDoc ? vehicleNumber : 'Pickup-Local',
    driver: `${pickupDriver.firstName || ''} ${pickupDriver.lastName || ''}`.trim(),
    route1: pickupTripDoc?.startRoute || location,
    route2: pickupTripDoc?.destination || 'Nashik Center',
    km: pickupTripDoc?.totalKm || 0,
    fuel: totalPetrolAdvance,
    toll: pickupTripDoc?.tollExpense || 0,
    amount: (pickupTripDoc?.totalKm || 0) * 15,
  };

  // Execute Creation Operations
  const [createdFarmerBill, createdCompanyBill, createdMunshiLedger, createdEicherTrip, createdPickupTrip] = await Promise.all([
    FarmerBill.create(farmerBillData),
    CompanyBill.create(companyBillData),
    MunshiLedger.create(munshiLedgerData),
    EicherTrip.create(eicherTripData),
    PickupTrip.create(pickupTripData),
  ]);

  // Log System Action Audit with action = 'CREATE'
  await logSystemAction(
    req.user?._id,
    'CREATE',
    'BillingSync',
    assignment._id,
    `Created FarmerBill (${createdFarmerBill._id}), CompanyBill (${createdCompanyBill._id}) for assignment ${assignment._id}`
  );

  res.json({
    success: true,
    message: 'Billing documents synchronized successfully from execution assignment',
    data: {
      farmerBill: createdFarmerBill,
      companyBill: createdCompanyBill,
      munshiLedger: createdMunshiLedger,
      eicherTrip: createdEicherTrip,
      pickupTrip: createdPickupTrip,
    },
  });
});
