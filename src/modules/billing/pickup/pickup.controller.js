'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const PickupPayment = require('./pickupPayment.model');
let Trip, PickupTrip;
try {
  Trip = require('../../execution/trip.model');
} catch (e) {
  Trip = null;
}
try {
  PickupTrip = require('./pickupTrip.model');
} catch (e) {
  PickupTrip = null;
}

const periodFilter = (filter) => {
  if (!filter) return null;
  const now = new Date();
  const map = { Daily: 1, Weekly: 7, Monthly: 30 };
  const days = map[filter];
  if (!days) return null;
  const since = new Date(now);
  since.setDate(now.getDate() - days);
  return { $gte: since };
};

// Normalize pickup trip document into standard UI shape
const normalizePickupTrip = (trip) => {
  const driverObj = trip.driverId || trip.driverRef;
  const driverName = driverObj
    ? `${driverObj.firstName || ''} ${driverObj.lastName || ''}`.trim() || 'Pickup Driver'
    : trip.driver || 'Pickup Driver';

  const assignmentObj = trip.assignmentId || trip.assignmentRef;
  const vehicleNo = assignmentObj?.assignedVehicleNumber || trip.vehicleNumber || trip.vehicle || 'N/A';

  let route1 = trip.startRoute || 'Start';
  let route2 = trip.destination || 'Unit';
  if (trip.routes && trip.routes.length > 0) {
    route1 = trip.routes[0]?.startPoint || route1;
    route2 = trip.routes[trip.routes.length - 1]?.destination || route2;
  }

  const kmVal = Number(trip.totalKm || trip.km || 0);
  const fuelVal = Number(trip.fuel || trip.diesel || 0);
  const tollVal = Number(trip.tollExpense || trip.toll || 0);
  const amountVal = Number(trip.amount || trip.netPayable || (kmVal * 100 + fuelVal + tollVal));

  return {
    _id: trip._id,
    id: trip._id,
    date: trip.createdAt || trip.date,
    vehicle: vehicleNo,
    vehicleNumber: vehicleNo,
    driver: driverName,
    driverId: driverObj || null,
    route1,
    route2,
    routes: trip.routes || [],
    km: kmVal,
    fuel: fuelVal,
    diesel: fuelVal,
    toll: tollVal,
    amount: amountVal,
    netPayable: amountVal,
    status: trip.reviewStatus || trip.status || 'APPROVED',
    enquiry: assignmentObj ? {
      _id: assignmentObj._id,
      enquiryId: assignmentObj.enquiryId || '',
      farmerName: `${assignmentObj.farmerFirstName || ''} ${assignmentObj.farmerLastName || ''}`.trim(),
      status: assignmentObj.status || '',
    } : null,
    uploadSlipUrl: trip.uploadSlipUrl || null,
    meterPhotoUrl: trip.meterPhotoUrl || null,
    tollSlipUrl: trip.tollSlipUrl || null,
    endKmPhotoUrl: trip.endKmPhotoUrl || null,
  };
};

/** GET /api/billing/pickup/trips */
exports.getTrips = asyncHandler(async (req, res) => {
  const { search = '', date, status, filter, page = 1, limit = 20 } = req.query;

  const query = { driverType: 'Pickup' };
  const targetStatus = status || 'APPROVED';
  if (targetStatus && targetStatus !== 'All') {
    query.reviewStatus = targetStatus;
  }

  if (date) {
    const start = new Date(new Date(date).setHours(0, 0, 0, 0));
    const end = new Date(new Date(date).setHours(23, 59, 59, 999));
    query.createdAt = { $gte: start, $lte: end };
  } else {
    const pf = periodFilter(filter);
    if (pf) query.createdAt = pf;
  }

  let tripData = [];
  let totalCount = 0;

  if (Trip) {
    [tripData, totalCount] = await Promise.all([
      Trip.find(query)
        .sort({ createdAt: -1 })
        .populate('driverId', 'firstName lastName mobileNo role')
        .populate('assignmentId', 'enquiryId farmerFirstName farmerLastName status assignedVehicleNumber')
        .populate('reviewedBy', 'firstName lastName role')
        .lean(),
      Trip.countDocuments(query),
    ]);
  }

  let localData = [];
  if (PickupTrip && tripData.length === 0) {
    const localQuery = {};
    if (status) localQuery.status = status;
    if (date) localQuery.date = { $gte: new Date(new Date(date).setHours(0, 0, 0, 0)), $lte: new Date(new Date(date).setHours(23, 59, 59, 999)) };
    [localData, totalCount] = await Promise.all([
      PickupTrip.find(localQuery)
        .sort({ date: -1 })
        .populate('driverRef', 'firstName lastName mobileNo role')
        .populate('assignmentRef')
        .lean(),
      PickupTrip.countDocuments(localQuery),
    ]);
  }

  const combined = [
    ...tripData.map((t) => normalizePickupTrip(t)),
    ...localData.map((t) => normalizePickupTrip(t)),
  ];

  if (search) {
    const s = search.toLowerCase();
    combined.filter(
      (item) =>
        item.vehicle.toLowerCase().includes(s) ||
        item.driver.toLowerCase().includes(s) ||
        item.route1.toLowerCase().includes(s) ||
        item.route2.toLowerCase().includes(s)
    );
  }

  const skip = (Number(page) - 1) * Number(limit);
  const paginatedData = combined.slice(skip, skip + Number(limit));

  res.json({
    success: true,
    data: paginatedData,
    pagination: {
      total: totalCount || combined.length,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil((totalCount || combined.length) / Number(limit)) || 1,
    },
  });
});

/** GET /api/billing/pickup/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const dateFilter = periodFilter(filter);
  const matchQuery = { driverType: 'Pickup', reviewStatus: 'APPROVED' };
  if (dateFilter) matchQuery.createdAt = dateFilter;

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

  let tripsToday = 0,
    totalDistance = 0,
    dieselAdvance = 0,
    payable = 0;

  if (Trip) {
    const [summary, todayCount] = await Promise.all([
      Trip.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalKm: { $sum: '$totalKm' },
            diesel: { $sum: '$tollExpense' },
            payable: { $sum: '$totalKm' },
          },
        },
      ]),
      Trip.countDocuments({ driverType: 'Pickup', createdAt: { $gte: todayStart } }),
    ]);

    tripsToday = todayCount;
    totalDistance = summary[0]?.totalKm ?? 0;
    dieselAdvance = summary[0]?.diesel ?? 0;
    payable = totalDistance * 100;
  }

  res.json({
    success: true,
    data: {
      tripsToday,
      totalDistance,
      dieselAdvance,
      payable,
    },
  });
});

/** GET /api/billing/pickup/trips/:id */
exports.getTripById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let trip = null;

  if (Trip) {
    trip = await Trip.findById(id)
      .populate('driverId', 'firstName lastName mobileNo role')
      .populate('assignmentId')
      .populate('reviewedBy', 'firstName lastName role')
      .lean();
  }

  if (!trip && PickupTrip) {
    trip = await PickupTrip.findById(id)
      .populate('driverRef', 'firstName lastName mobileNo role')
      .populate('assignmentRef')
      .lean();
  }

  if (!trip) return res.status(404).json({ success: false, message: 'Pickup trip not found' });
  res.json({ success: true, data: normalizePickupTrip(trip) });
});

/** GET /api/billing/pickup/payment-summary */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  let trips = [];

  if (Trip) {
    const agg = await Trip.aggregate([
      { $match: { driverType: 'Pickup', reviewStatus: 'APPROVED' } },
      {
        $group: {
          _id: '$driverId',
          km: { $sum: '$totalKm' },
          diesel: { $sum: '$tollExpense' },
          toll: { $sum: '$tollExpense' },
          totalBill: { $sum: { $multiply: ['$totalKm', 100] } },
        },
      },
    ]);
    trips = agg;
  }

  const payments = await PickupPayment.aggregate([
    { $group: { _id: '$driverRef', paid: { $sum: '$amountPaid' } } },
  ]);

  const paidMap = Object.fromEntries(payments.map((p) => [String(p._id), p.paid]));

  const data = trips.map((t) => {
    const paid = paidMap[String(t._id)] || 0;
    const totalBill = t.totalBill || 0;
    return {
      vehicle: t._id || 'MH15PK1234',
      km: t.km,
      diesel: t.diesel,
      toll: t.toll,
      totalBill,
      paid,
      pending: Math.max(0, totalBill - paid),
    };
  });

  res.json({ success: true, data });
});

/** POST /api/billing/pickup/payments (Pay Pickup Driver / Vehicle Bill) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    tripId,
    tripRef,
    driverRef,
    vehicleNo,
    vehicleNumber,
    amountPaid,
    amount,
    bankName,
    beneficiaryName,
    accountNo,
    paymentMode,
    transactionId,
    remark,
  } = req.body;

  const payment = await PickupPayment.create({
    tripRef: tripId || tripRef || null,
    driverRef: driverRef || null,
    vehicleNo: vehicleNo || vehicleNumber || '',
    vehicleNumber: vehicleNumber || vehicleNo || '',
    date: new Date(),
    amountPaid: Number(amountPaid || amount || 0),
    bankName: bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  });

  res.status(201).json({ success: true, data: payment, message: 'Pickup driver payment recorded successfully' });
});

/** GET /api/billing/pickup/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [data, total] = await Promise.all([
    PickupPayment.find()
      .sort({ date: -1 })
      .populate('driverRef', 'firstName lastName mobileNo role')
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PickupPayment.countDocuments(),
  ]);

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
