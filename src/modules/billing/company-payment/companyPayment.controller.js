'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const CompanyPayment = require('./companyPayment.model');

/** GET /api/billing/company/payments */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;
  const query = {};
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { transactionId: { $regex: search, $options: 'i' } },
    ];
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    CompanyPayment.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)).lean(),
    CompanyPayment.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** POST /api/billing/company/payments */
exports.create = asyncHandler(async (req, res) => {
  const payment = await CompanyPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});

/** GET /api/billing/company/payments/:id */
exports.getById = asyncHandler(async (req, res) => {
  const payment = await CompanyPayment.findById(req.params.id).lean();
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  res.json({ success: true, data: payment });
});

/** PATCH /api/billing/company/payments/:id */
exports.update = asyncHandler(async (req, res) => {
  const payment = await CompanyPayment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  res.json({ success: true, data: payment });
});
