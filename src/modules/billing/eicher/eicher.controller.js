'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const EicherPayment = require('./eicherPayment.model');

try {
  require('../../master-data/vehicle.model');
  require('../../logistics/logistics.model');
} catch (e) {}

let Trip, EicherTrip;
try {
  Trip = require('../../execution/trip.model');
} catch (e) {
  Trip = null;
}
try {
  EicherTrip = require('./eicherTrip.model');
} catch (e) {
  EicherTrip = null;
}

const periodFilter = (filter) => {
  if (!filter || filter === 'All') return null;
  const map = { Daily: 1, Weekly: 7, Monthly: 30 };
  const days = map[filter];
  if (!days) return null;
  const since = new Date();
  since.setDate(since.getDate() - days);
  return { $gte: since };
};

// Normalize trip document into standard UI shape
const normalizeEicherTrip = (trip) => {
  const driverObj = trip.driverId || trip.driverRef;
  const driverName = driverObj
    ? `${driverObj.firstName || ''} ${driverObj.lastName || ''}`.trim() || 'Eicher Driver'
    : trip.driverName || 'Eicher Driver';

  const assignmentObj = trip.assignmentId || trip.assignmentRef;
  const vehicleObj = assignmentObj?.vehicleId || trip.vehicleId;
  const vehicleNo =
    (typeof vehicleObj === 'object' ? vehicleObj?.vehicleNumber : null) ||
    assignmentObj?.vehicleNumber ||
    assignmentObj?.assignedVehicleNumber ||
    trip.vehicleNumber ||
    trip.vehicleNo ||
    trip.vehicle ||
    'N/A';

  const cleanVehicleNo = typeof vehicleNo === 'string' ? vehicleNo.trim() : vehicleNo;
  const vehicleRefId = typeof vehicleObj === 'object' ? vehicleObj?._id : (vehicleObj || null);

  const routeStr = trip.startRoute && trip.destination
    ? `${trip.startRoute} → ${trip.destination}`
    : trip.route || 'Route N/A';

  const kmVal = Number(trip.totalKm || trip.km || 0);
  const tollVal = Number(trip.tollExpense || trip.toll || 0);
  const haultVal = trip.isHault ? 150 : (Number(trip.hault) || 0);
  const lineCancelVal = trip.isLineCancel ? 200 : (Number(trip.lineCancel) || 0);
  const dieselVal = Number(trip.dieselAdvance || trip.diesel || 0);

  const netPayable = Number(trip.netPayable || trip.net || (kmVal * 150 + tollVal + haultVal - dieselVal));

  return {
    _id: trip._id,
    id: trip._id,
    date: trip.createdAt || trip.date,
    vehicle: cleanVehicleNo,
    vehicleNumber: cleanVehicleNo,
    vehicleId: vehicleRefId || null,
    vehicleRef: vehicleRefId || null,
    driver: driverName,
    driverId: driverObj || null,
    route: routeStr,
    km: kmVal,
    toll: tollVal,
    hault: haultVal,
    lineCancel: lineCancelVal,
    diesel: dieselVal,
    dieselAdvance: dieselVal,
    net: netPayable,
    netPayable: netPayable,
    status: trip.reviewStatus || trip.status || 'APPROVED',
    enquiry: assignmentObj ? {
      _id: assignmentObj._id,
      enquiryId: assignmentObj.enquiryId || '',
      farmerName: `${assignmentObj.farmerFirstName || ''} ${assignmentObj.farmerLastName || ''}`.trim(),
      status: assignmentObj.status || '',
    } : null,
    weightSlipUrl: trip.weightSlipUrl || null,
    dieselSlipUrl: trip.dieselSlipUrl || null,
    unloadSlipUrl: trip.unloadSlipUrl || null,
  };
};

/** GET /api/billing/eicher/trips */
exports.getTrips = asyncHandler(async (req, res) => {
  const { search = '', date, status, filter, page = 1, limit = 20 } = req.query;

  const query = { driverType: 'Eicher' };
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
        .populate({
          path: 'assignmentId',
          populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' },
        })
        .populate('reviewedBy', 'firstName lastName role')
        .lean(),
      Trip.countDocuments(query),
    ]);
  }

  let localData = [];
  if (EicherTrip && tripData.length === 0) {
    const localQuery = {};
    if (status) localQuery.status = status;
    if (date) localQuery.date = { $gte: new Date(new Date(date).setHours(0, 0, 0, 0)), $lte: new Date(new Date(date).setHours(23, 59, 59, 999)) };
    [localData, totalCount] = await Promise.all([
      EicherTrip.find(localQuery)
        .sort({ date: -1 })
        .populate('driverRef', 'firstName lastName mobileNo role')
        .populate('assignmentRef')
        .lean(),
      EicherTrip.countDocuments(localQuery),
    ]);
  }

  let combined = [
    ...tripData.map((t) => normalizeEicherTrip(t)),
    ...localData.map((t) => normalizeEicherTrip(t)),
  ];

  if (search) {
    const s = search.toLowerCase();
    combined = combined.filter(
      (item) =>
        item.vehicle.toLowerCase().includes(s) ||
        item.driver.toLowerCase().includes(s) ||
        item.route.toLowerCase().includes(s)
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

/** GET /api/billing/eicher/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const dateFilter = periodFilter(filter);
  const matchQuery = { driverType: 'Eicher', reviewStatus: 'APPROVED' };
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
      Trip.countDocuments({ driverType: 'Eicher', createdAt: { $gte: todayStart } }),
    ]);

    tripsToday = todayCount;
    totalDistance = summary[0]?.totalKm ?? 0;
    dieselAdvance = summary[0]?.diesel ?? 0;
    payable = totalDistance * 150;
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

/** GET /api/billing/eicher/trips/:id */
exports.getTripById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let trip = null;

  if (Trip) {
    trip = await Trip.findById(id)
      .populate('driverId', 'firstName lastName mobileNo role')
      .populate({
        path: 'assignmentId',
        populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' },
      })
      .populate('reviewedBy', 'firstName lastName role')
      .lean();
  }

  if (!trip && EicherTrip) {
    trip = await EicherTrip.findById(id)
      .populate('driverRef', 'firstName lastName mobileNo role')
      .populate('assignmentRef')
      .lean();
  }

  if (!trip) return res.status(404).json({ success: false, message: 'Eicher trip not found' });
  res.json({ success: true, data: normalizeEicherTrip(trip) });
});

/** GET /api/billing/eicher/payment-summary */
exports.getPaymentSummary = asyncHandler(async (req, res) => {
  let trips = [];

  if (Trip) {
    const agg = await Trip.aggregate([
      { $match: { driverType: 'Eicher', reviewStatus: 'APPROVED' } },
      {
        $group: {
          _id: '$driverId',
          trips: { $sum: 1 },
          km: { $sum: '$totalKm' },
          diesel: { $sum: '$tollExpense' },
          toll: { $sum: '$tollExpense' },
          lineCancel: { $sum: { $cond: ['$isLineCancel', 1, 0] } },
          hault: { $sum: { $cond: ['$isHault', 1, 0] } },
          totalBill: { $sum: { $multiply: ['$totalKm', 150] } },
        },
      },
    ]);
    trips = agg;
  }

  const payments = await EicherPayment.aggregate([
    { $group: { _id: '$driverRef', paid: { $sum: '$amountPaid' } } },
  ]);

  const paidMap = Object.fromEntries(payments.map((p) => [String(p._id), p.paid]));

  const data = trips.map((t) => {
    const paid = paidMap[String(t._id)] || 0;
    const totalBill = t.totalBill || 0;
    return {
      vehicle: t._id || 'MH15AB1234',
      trips: t.trips,
      km: t.km,
      diesel: t.diesel,
      toll: t.toll,
      lineCancel: t.lineCancel,
      hault: t.hault,
      totalBill,
      paid,
      pending: Math.max(0, totalBill - paid),
    };
  });

  res.json({ success: true, data });
});

/** POST /api/billing/eicher/payments (Pay Eicher Driver / Vehicle Bill) */
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

  const payment = await EicherPayment.create({
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

  res.status(201).json({ success: true, data: payment, message: 'Eicher driver payment recorded successfully' });
});

/** GET /api/billing/eicher/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [data, total] = await Promise.all([
    EicherPayment.find()
      .sort({ date: -1 })
      .populate('driverRef', 'firstName lastName mobileNo role')
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    EicherPayment.countDocuments(),
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
