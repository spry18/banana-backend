'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const CompanyPayment = require('./companyPayment.model');
const Company = require('../../master-data/company.model');
const CompanyBill = require('../company-billing/companyBill.model');
const { logSystemAction } = require('../../../utils/auditLogger');

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
    CompanyPayment.find(query)
      .populate('companyBillRef', 'companyRef companyName')
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CompanyPayment.countDocuments(query),
  ]);
  const mappedData = data.map((p) => {
    const companyRefId = p.companyRef || (p.companyBillRef && p.companyBillRef.companyRef) || null;
    const companyBillId = p.companyBillRef?._id || p.companyBillRef || null;
    return {
      ...p,
      companyRef: companyRefId,
      companyId: companyRefId,
      companyBillRef: companyBillId,
    };
  });
  res.json({ success: true, data: mappedData, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/company/payments/unpaid-bills — Fetch all company bills waiting for payment */
exports.getUnpaidBills = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const query = { status: { $ne: 'PAID' } };
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { farmerName: { $regex: search, $options: 'i' } },
      { vehicleNumber: { $regex: search, $options: 'i' } },
      { invoiceNo: { $regex: search, $options: 'i' } },
    ];
  }
  const unpaidBills = await CompanyBill.find(query).sort({ date: -1 }).lean();
  res.json({ success: true, count: unpaidBills.length, data: unpaidBills });
});

/** POST /api/billing/company/payments */
exports.create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  if (body.companyId && !body.companyRef) body.companyRef = body.companyId;
  if (body.amountPaid && !body.amount) body.amount = body.amountPaid;
  if (body.paidFromBank && !body.receivedBankName) body.receivedBankName = body.paidFromBank;
  if (body.paidFromCompany && !body.receivedCompanyName) body.receivedCompanyName = body.paidFromCompany;

  // Auto-resolve companyRef and companyName from linked CompanyBill if missing
  if (body.companyBillRef && !body.companyRef) {
    const bill = await CompanyBill.findById(body.companyBillRef).select('companyRef companyName').lean();
    if (bill) {
      if (bill.companyRef) body.companyRef = bill.companyRef;
      if (!body.companyName) body.companyName = bill.companyName;
    }
  }

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
