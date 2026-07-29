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

const Company = require('../../master-data/company.model');
const CompanyBill = require('../company-billing/companyBill.model');
const { logSystemAction } = require('../../../utils/auditLogger');

/** POST /api/billing/company/payments */
exports.create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // Auto-resolve companyName if companyRef is passed
  if (body.companyRef && !body.companyName) {
    const company = await Company.findById(body.companyRef).lean();
    if (company) body.companyName = company.companyName;
  }

  const payment = await CompanyPayment.create(body);

  // Auto-reconcile linked CompanyBill status if linked
  if (payment.companyBillRef) {
    const allPayments = await CompanyPayment.find({ companyBillRef: payment.companyBillRef }).lean();
    const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const bill = await CompanyBill.findById(payment.companyBillRef);
    if (bill) {
      if (totalPaid >= bill.billAmount) {
        bill.status = 'PAID';
      } else {
        bill.status = 'SUBMITTED';
      }
      await bill.save();
    }
  }

  // Audit log
  if (req.user?._id) {
    await logSystemAction(
      req.user._id,
      'CREATE',
      'Billing',
      payment._id,
      `Recorded company payment of ₹${payment.amount} from ${payment.companyName}`
    );
  }

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
