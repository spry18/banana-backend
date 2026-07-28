'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const FarmerPayment = require('./farmerPayment.model');
const FarmerBill = require('../farmer-billing/farmerBill.model');
const { logSystemAction } = require('../../../utils/auditLogger');

/** GET /api/billing/farmer/payments */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { farmerName: { $regex: search, $options: 'i' } },
      { beneficiaryName: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    FarmerPayment.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    FarmerPayment.countDocuments(query),
  ]);
  // Mask account numbers
  const masked = data.map((p) => ({
    ...p,
    accountNo: p.accountNo ? `****${p.accountNo.slice(-4)}` : null,
  }));
  res.json({ success: true, data: masked, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/farmer/payments/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const [agg, weekAgg] = await Promise.all([
    FarmerPayment.aggregate([{ $group: { _id: '$isCompleted', total: { $sum: '$amountPaid' }, count: { $sum: 1 } } }]),
    FarmerPayment.aggregate([{ $match: { createdAt: { $gte: weekAgo } } }, { $group: { _id: null, total: { $sum: '$amountPaid' }, count: { $sum: 1 } } }]),
  ]);
  const paid = agg.find((a) => a._id === true);
  const pending = agg.find((a) => a._id === false);
  res.json({
    success: true,
    data: {
      totalPaid: paid?.total ?? 0,
      totalPending: pending?.total ?? 0,
      paidThisWeek: weekAgg[0]?.total ?? 0,
      paymentsProcessedThisWeek: weekAgg[0]?.count ?? 0,
    },
  });
});

/** GET /api/billing/farmer/payments/unpaid-bills — Fetch all farmer bills waiting for payment */
exports.getUnpaidBills = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const query = { status: { $ne: 'PAID' } };
  if (search) {
    query.$or = [
      { farmerName: { $regex: search, $options: 'i' } },
      { companyName: { $regex: search, $options: 'i' } },
      { vehicleNumber: { $regex: search, $options: 'i' } },
    ];
  }
  const unpaidBills = await FarmerBill.find(query)
    .populate('farmerRef', 'name mobile location')
    .sort({ date: -1 })
    .lean();

  res.json({ success: true, count: unpaidBills.length, data: unpaidBills });
});

/** POST /api/billing/farmer/payments */
exports.create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // Auto-resolve farmer details if farmerBillRef is passed
  if (body.farmerBillRef) {
    const bill = await FarmerBill.findById(body.farmerBillRef).lean();
    if (bill) {
      if (!body.farmerName) body.farmerName = bill.farmerName;
      if (!body.farmerRef) body.farmerRef = bill.farmerRef;
      if (!body.beneficiaryName) body.beneficiaryName = bill.farmerName;
    }
  }

  const payment = await FarmerPayment.create(body);

  // Auto-Reconcile FarmerBill Status if linked to a bill
  if (payment.farmerBillRef) {
    const allPayments = await FarmerPayment.find({ farmerBillRef: payment.farmerBillRef }).lean();
    const totalPaid = allPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    const bill = await FarmerBill.findById(payment.farmerBillRef);
    if (bill) {
      if (totalPaid >= bill.netPayable) {
        bill.status = 'PAID';
      }
      await bill.save();
    }
  }

  // Log system audit action
  await logSystemAction(
    req.user._id,
    'CREATE',
    'Billing',
    payment._id,
    `Recorded farmer payment of ₹${payment.amountPaid} for ${payment.farmerName}`
  );

  res.status(201).json({ success: true, data: payment });
});

/** GET /api/billing/farmer/payments/:id */
exports.getById = asyncHandler(async (req, res) => {
  const payment = await FarmerPayment.findById(req.params.id).lean();
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  payment.accountNo = payment.accountNo ? `****${payment.accountNo.slice(-4)}` : null;
  res.json({ success: true, data: payment });
});

/** PATCH /api/billing/farmer/payments/:id */
exports.update = asyncHandler(async (req, res) => {
  const payment = await FarmerPayment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!payment) return res.status(404).json({ success: false, message: 'Payment record not found' });
  res.json({ success: true, data: payment });
});
