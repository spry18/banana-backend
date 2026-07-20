'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FarmerBill = require('../farmer-billing/farmerBill.model');
const CompanyBill = require('../company-billing/companyBill.model');
const FarmerPayment = require('../farmer-payment/farmerPayment.model');
const CompanyPayment = require('../company-payment/companyPayment.model');

/** GET /api/billing/dashboard/summary?date=YYYY-MM-DD */
exports.getSummary = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const matchDate = date ? {
    $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
    $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
  } : undefined;

  const [farmerAgg, companyAgg, paymentAgg] = await Promise.all([
    FarmerBill.aggregate([
      ...(matchDate ? [{ $match: { date: matchDate } }] : []),
      {
        $group: {
          _id: null,
          totalBoxes: { $sum: '$boxes' },
          farmerPayable: { $sum: '$netPayable' },
        },
      },
    ]),
    CompanyBill.aggregate([
      {
        $group: {
          _id: null,
          totalSalesValue: { $sum: '$billAmount' },
          companyOutstanding: {
            $sum: { $cond: [{ $ne: ['$status', 'PAID'] }, '$billAmount', 0] },
          },
        },
      },
    ]),
    FarmerPayment.aggregate([
      { $group: { _id: null, totalPaid: { $sum: '$amountPaid' } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      totalBoxesToday: farmerAgg[0]?.totalBoxes ?? 0,
      totalSalesValue: companyAgg[0]?.totalSalesValue ?? 0,
      companyOutstanding: companyAgg[0]?.companyOutstanding ?? 0,
      farmerPayable: farmerAgg[0]?.farmerPayable ?? 0,
      totalFarmerPaid: paymentAgg[0]?.totalPaid ?? 0,
    },
  });
});

/** GET /api/billing/dashboard/sales-by-company?date=YYYY-MM-DD */
exports.getSalesByCompany = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const matchDate = date
    ? {
        $gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
        $lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
      }
    : {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      };

  const data = await CompanyBill.aggregate([
    { $match: { date: matchDate } },
    {
      $group: {
        _id: '$companyName',
        companyName: { $first: '$companyName' },
        boxes: { $sum: '$boxes' },
        totalWeight: { $sum: '$totalWeight' },
        amount: { $sum: '$billAmount' },
        status: { $first: '$status' },
      },
    },
    { $sort: { amount: -1 } },
  ]);

  res.json({ success: true, data });
});

/** GET /api/billing/dashboard/overdue-farmers?minDays=25 */
exports.getOverdueFarmers = asyncHandler(async (req, res) => {
  const minDays = parseInt(req.query.minDays) || 25;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - minDays);

  const farmers = await FarmerBill.find({
    status: 'SENT',
    sentDate: { $lte: cutoffDate },
  })
    .sort({ sentDate: 1 })
    .select('farmerName sentDate netPayable')
    .lean();

  const data = farmers.map((f) => {
    const daysOverdue = Math.ceil(
      (Date.now() - new Date(f.sentDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      farmerName: f.farmerName,
      daysOverdue,
      outstandingAmount: f.netPayable,
      initial: f.farmerName?.charAt(0).toUpperCase() || '?',
    };
  });

  res.json({ success: true, count: data.length, data });
});

/** GET /api/billing/dashboard/harvest-chart?range=7 */
exports.getHarvestChart = asyncHandler(async (req, res) => {
  const range = parseInt(req.query.range) || 7;
  const since = new Date();
  since.setDate(since.getDate() - range);

  const data = await FarmerBill.aggregate([
    { $match: { date: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        boxes: { $sum: '$boxes' },
        day: { $first: { $dayOfWeek: '$date' } },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { date: '$_id', boxes: 1, _id: 0 } },
  ]);

  res.json({ success: true, data });
});

/** GET /api/billing/dashboard/outstanding-chart */
exports.getOutstandingChart = asyncHandler(async (req, res) => {
  const data = await CompanyBill.aggregate([
    { $match: { status: { $ne: 'PAID' } } },
    {
      $group: {
        _id: '$companyName',
        companyName: { $first: '$companyName' },
        outstandingAmount: { $sum: '$billAmount' },
      },
    },
    { $sort: { outstandingAmount: -1 } },
    { $limit: 10 },
  ]);

  res.json({ success: true, data });
});
