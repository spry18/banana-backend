'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const Kharchi = require('./kharchi.model');
const KharchiPayment = require('./kharchiPayment.model');
let OMKharchi;
try {
  OMKharchi = require('../../operational-manager/omKharchi.model');
} catch (e) {
  OMKharchi = null;
}

const periodFilter = (f) => {
  const m = { Daily: 1, Weekly: 7, Monthly: 30 };
  const d = m[f];
  if (!d) return null;
  const s = new Date();
  s.setDate(s.getDate() - d);
  return { $gte: s };
};

// Helper to normalize expense objects into a consistent shape for UI
const normalizeExpense = (item, source = 'OM') => {
  const dateVal = item.transferDate || item.date || item.createdAt;
  const typeVal = item.category || item.type || 'Small';
  const termVal = item.term || (typeVal === 'Big' ? 'Long' : 'Short');
  const payToVal = item.recipientName || item.payTo || '';
  const natureVal = item.nature || item.item || '';
  const purchasedVal = item.natureInDetail || item.purchased || natureVal;

  return {
    _id: item._id,
    id: item._id,
    date: dateVal,
    type: typeVal,
    category: typeVal,
    nature: natureVal,
    item: natureVal,
    payTo: payToVal,
    recipientName: payToVal,
    purchased: purchasedVal,
    term: termVal,
    amount: item.amount,
    status: item.status,
    approvalType: item.approvalType || 'Manual',
    issuedBy: item.issuedBy || null,
    approvedBy: item.approvedBy || null,
    approvedAt: item.approvedAt || null,
    billReceiptUrl: item.billReceiptUrl || null,
    paymentReceiptUrl: item.paymentReceiptUrl || null,
    bankDetailsUrl: item.bankDetailsUrl || null,
    remark: item.remark || '',
    source,
    createdAt: item.createdAt,
  };
};

/** GET /api/billing/kharchi/expenses (Get Approved Kharchi for Billing) */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', date, status, type, category, term, filter, page = 1, limit = 20 } = req.query;

  const targetStatus = status || 'Approved';
  const targetType = category || type;

  // Build query for OMKharchi
  const omQuery = {};
  if (targetStatus && targetStatus !== 'All') {
    if (targetStatus === 'Approved') {
      omQuery.status = { $in: ['Approved', 'Paid'] };
    } else {
      omQuery.status = targetStatus;
    }
  }
  if (targetType && targetType !== 'All') {
    omQuery.$or = [
      { category: targetType },
      { type: targetType },
      { category: { $regex: targetType, $options: 'i' } },
    ];
  }
  if (term && term !== 'All') {
    omQuery.type = { $regex: term, $options: 'i' };
  }
  if (search) {
    const sClause = [
      { nature: { $regex: search, $options: 'i' } },
      { recipientName: { $regex: search, $options: 'i' } },
      { natureInDetail: { $regex: search, $options: 'i' } },
      { type: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
    if (omQuery.$or) {
      omQuery.$and = [{ $or: omQuery.$or }, { $or: sClause }];
      delete omQuery.$or;
    } else {
      omQuery.$or = sClause;
    }
  }
  if (date) {
    const start = new Date(new Date(date).setHours(0, 0, 0, 0));
    const end = new Date(new Date(date).setHours(23, 59, 59, 999));
    omQuery.createdAt = { $gte: start, $lte: end };
  } else {
    const pf = periodFilter(filter);
    if (pf) omQuery.createdAt = pf;
  }

  // Build query for Kharchi
  const billingQuery = {};
  if (targetStatus && targetStatus !== 'All') {
    if (targetStatus === 'Approved') {
      billingQuery.status = { $in: ['Approved', 'Paid'] };
    } else {
      billingQuery.status = targetStatus;
    }
  }
  if (targetType && targetType !== 'All') billingQuery.type = targetType;
  if (term && term !== 'All') billingQuery.term = term;
  if (search) {
    billingQuery.$or = [
      { nature: { $regex: search, $options: 'i' } },
      { payTo: { $regex: search, $options: 'i' } },
    ];
  }
  if (date) {
    const start = new Date(new Date(date).setHours(0, 0, 0, 0));
    const end = new Date(new Date(date).setHours(23, 59, 59, 999));
    billingQuery.date = { $gte: start, $lte: end };
  } else {
    const pf = periodFilter(filter);
    if (pf) billingQuery.date = pf;
  }

  let omData = [];
  let omCount = 0;
  if (OMKharchi) {
    [omData, omCount] = await Promise.all([
      OMKharchi.find(omQuery)
        .sort({ createdAt: -1 })
        .populate('issuedBy', 'firstName lastName mobileNo role email')
        .populate('approvedBy', 'firstName lastName role')
        .lean(),
      OMKharchi.countDocuments(omQuery),
    ]);
  }

  const [billingData, billingCount] = await Promise.all([
    Kharchi.find(billingQuery)
      .sort({ date: -1 })
      .populate('issuedBy', 'firstName lastName mobileNo role email')
      .populate('approvedBy', 'firstName lastName role')
      .lean(),
    Kharchi.countDocuments(billingQuery),
  ]);

  const combined = [
    ...omData.map((item) => normalizeExpense(item, 'OM')),
    ...billingData.map((item) => normalizeExpense(item, 'Billing')),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

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

/** GET /api/billing/kharchi/summary (Summary KPI Cards) */
exports.getSummary = asyncHandler(async (req, res) => {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

  let omList = [];
  if (OMKharchi) {
    omList = await OMKharchi.find({ createdAt: { $gte: todayStart }, status: { $ne: 'Rejected' } }).lean();
  }
  const billingList = await Kharchi.find({ createdAt: { $gte: todayStart }, status: { $ne: 'Rejected' } }).lean();

  const allToday = [
    ...omList.map((item) => normalizeExpense(item, 'OM')),
    ...billingList.map((item) => normalizeExpense(item, 'Billing')),
  ];

  let todayKharchi = 0,
    smallShort = 0,
    smallLong = 0,
    bigShort = 0,
    bigLong = 0;

  allToday.forEach((item) => {
    const amt = item.amount || 0;
    todayKharchi += amt;
    if (item.type === 'Small' && item.term === 'Short') smallShort += amt;
    if (item.type === 'Small' && item.term === 'Long') smallLong += amt;
    if (item.type === 'Big' && item.term === 'Short') bigShort += amt;
    if (item.type === 'Big' && item.term === 'Long') bigLong += amt;
  });

  res.json({
    success: true,
    data: {
      todayKharchi,
      smallKharchi: smallShort + smallLong,
      bigKharchi: bigShort + bigLong,
      smallShort,
      smallLong,
      bigShort,
      bigLong,
    },
  });
});

/** GET /api/billing/kharchi/expenses/:id */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let expense = null;
  let source = 'OM';

  if (OMKharchi) {
    expense = await OMKharchi.findById(id)
      .populate('issuedBy', 'firstName lastName mobileNo role email')
      .populate('approvedBy', 'firstName lastName role')
      .lean();
  }

  if (!expense) {
    source = 'Billing';
    expense = await Kharchi.findById(id)
      .populate('issuedBy', 'firstName lastName mobileNo role email')
      .populate('approvedBy', 'firstName lastName role')
      .lean();
  }

  if (!expense) return res.status(404).json({ success: false, message: 'Expense record not found' });
  res.json({ success: true, data: normalizeExpense(expense, source) });
});

/** POST /api/billing/kharchi/payments (Pay Kharchi Bill) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    expenseId,
    expenseRef,
    omExpenseRef,
    date,
    term,
    nature,
    totalAmount,
    amount,
    bankName,
    beneficiaryName,
    accountNo,
    paymentMode,
    transactionId,
    remark,
  } = req.body;

  const targetId = expenseId || omExpenseRef || expenseRef;
  const payAmount = Number(totalAmount || amount || 0);

  const paymentData = {
    date: date ? new Date(date) : new Date(),
    term: term || 'Short',
    nature: nature || '',
    totalAmount: payAmount,
    bankName: bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  };

  // Find target expense and update status to 'Paid'
  let found = false;
  if (targetId && OMKharchi) {
    const omExp = await OMKharchi.findByIdAndUpdate(targetId, { status: 'Paid' }, { new: true });
    if (omExp) {
      paymentData.omExpenseRef = omExp._id;
      if (!paymentData.nature) paymentData.nature = omExp.nature;
      if (!paymentData.term) paymentData.term = omExp.term || (omExp.category === 'Big' ? 'Long' : 'Short');
      found = true;
    }
  }

  if (targetId && !found) {
    const kExp = await Kharchi.findByIdAndUpdate(targetId, { status: 'Paid' }, { new: true });
    if (kExp) {
      paymentData.expenseRef = kExp._id;
      if (!paymentData.nature) paymentData.nature = kExp.nature;
      if (!paymentData.term) paymentData.term = kExp.term;
      found = true;
    }
  }

  const payment = await KharchiPayment.create(paymentData);
  res.status(201).json({ success: true, data: payment, message: 'Kharchi bill payment recorded successfully' });
});

/** GET /api/billing/kharchi/payments/history */
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (search) {
    query.$or = [
      { bankName: { $regex: search, $options: 'i' } },
      { beneficiaryName: { $regex: search, $options: 'i' } },
      { accountNo: { $regex: search, $options: 'i' } },
      { nature: { $regex: search, $options: 'i' } },
    ];
  }

  const [data, total] = await Promise.all([
    KharchiPayment.find(query)
      .sort({ date: -1 })
      .populate({
        path: 'omExpenseRef',
        populate: { path: 'issuedBy', select: 'firstName lastName mobileNo role' },
      })
      .populate({
        path: 'expenseRef',
        populate: { path: 'issuedBy', select: 'firstName lastName mobileNo role' },
      })
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    KharchiPayment.countDocuments(query),
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
