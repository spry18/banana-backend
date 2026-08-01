'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const CommissionAgent = require('./commissionAgent.model');
const CommissionPayment = require('./commissionPayment.model');

try {
  require('../../master-data/agent.model');
} catch (e) {}

let Enquiry;
try {
  Enquiry = require('../../enquiries/enquiry.model');
} catch (e) {
  Enquiry = null;
}

// Helper to normalize agent document for UI
const normalizeAgent = (agent) => {
  const due = Math.max(0, (agent.totalCommission || 0) - (agent.totalPaid || 0));
  return {
    _id: agent._id,
    id: agent._id,
    agent: agent.agentName || 'Agent',
    agentName: agent.agentName || 'Agent',
    harvest: agent.harvestType || agent.harvest || 'Sahyadri',
    harvestType: agent.harvestType || agent.harvest || 'Sahyadri',
    structure: agent.commissionStructure || 'Per box',
    commissionStructure: agent.commissionStructure || 'Per box',
    commissionValue: agent.commissionValue || 0,
    business: `₹${(agent.totalBusiness || 0).toLocaleString()}`,
    totalBusiness: agent.totalBusiness || 0,
    commission: `₹${due.toLocaleString()}`,
    totalCommission: agent.totalCommission || 0,
    commissionDue: due,
    totalPaid: agent.totalPaid || 0,
    isActive: agent.isActive ?? true,
    enquiryId: agent.enquiryId || null,
    farmerName: agent.farmerFirstName ? `${agent.farmerFirstName} ${agent.farmerLastName || ''}`.trim() : null,
    createdAt: agent.createdAt,
  };
};

/** GET /api/billing/commission-agent/agents */
exports.getAll = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;

  const query = { isActive: true };
  if (search) {
    query.$or = [
      { agentName: { $regex: search, $options: 'i' } },
      { harvestType: { $regex: search, $options: 'i' } },
    ];
  }

  const fetches = [
    CommissionAgent.find(query).sort({ createdAt: -1 }).lean(),
  ];

  if (Enquiry) {
    fetches.push(
      Enquiry.find({ agentAttached: true })
        .populate('agentId')
        .sort({ createdAt: -1 })
        .lean()
    );
  }

  const results = await Promise.all(fetches);
  const localAgents = results[0] || [];
  const enquiryAgents = Enquiry ? results[1] || [] : [];

  // Map approved enquiries with attached agents
  const enquiryMapped = enquiryAgents.map((enq) => {
    const agName = enq.agentId
      ? `${enq.agentId.firstName || enq.agentId.name || enq.agentId.agentName || ''} ${enq.agentId.lastName || ''}`.trim()
      : 'Attached Agent';

    return {
      _id: enq._id,
      agentName: agName || 'Attached Agent',
      harvestType: enq.packingType || 'Sahyadri',
      commissionStructure: 'Per box',
      commissionValue: 10,
      totalBusiness: Number((enq.estimatedBoxes || 100) * (enq.purchaseRate || 500)),
      totalCommission: Number((enq.estimatedBoxes || 100) * 10),
      totalPaid: 0,
      isActive: true,
      enquiryId: enq.enquiryId,
      farmerFirstName: enq.farmerFirstName,
      farmerLastName: enq.farmerLastName,
      createdAt: enq.createdAt,
    };
  });

  let combined = [
    ...localAgents.map((a) => normalizeAgent(a)),
    ...enquiryMapped.map((a) => normalizeAgent(a)),
  ];

  if (search) {
    const s = search.toLowerCase();
    combined = combined.filter(
      (a) => a.agent.toLowerCase().includes(s) || a.harvest.toLowerCase().includes(s)
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

/** GET /api/billing/commission-agent/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const fetches = [
    CommissionAgent.find({ isActive: true }).lean(),
  ];
  if (Enquiry) {
    fetches.push(Enquiry.find({ agentAttached: true }).lean());
  }

  const results = await Promise.all(fetches);
  const localAgents = results[0] || [];
  const enquiryAgents = Enquiry ? results[1] || [] : [];

  const payments = await CommissionPayment.aggregate([
    { $match: { createdAt: { $gte: monthStart } } },
    {
      $group: {
        _id: null,
        paidThisMonth: { $sum: '$amount' },
        agentsPaidSet: { $addToSet: '$agentName' },
      },
    },
  ]);

  let activeAgents = localAgents.length + enquiryAgents.length;
  let totalBusiness = 0;
  let totalComm = 0;
  let totalPaid = 0;

  localAgents.forEach((a) => {
    totalBusiness += a.totalBusiness || 0;
    totalComm += a.totalCommission || 0;
    totalPaid += a.totalPaid || 0;
  });

  enquiryAgents.forEach((enq) => {
    const biz = Number((enq.estimatedBoxes || 100) * (enq.purchaseRate || 500));
    const comm = Number((enq.estimatedBoxes || 100) * 10);
    totalBusiness += biz;
    totalComm += comm;
  });

  const commissionDue = Math.max(0, totalComm - totalPaid);
  const paidThisMonth = payments[0]?.paidThisMonth ?? 0;
  const agentsPaid = payments[0]?.agentsPaidSet?.length ?? 0;

  res.json({
    success: true,
    data: {
      activeAgents: activeAgents || 1,
      businessViaAgents: totalBusiness,
      commissionDue,
      paidThisMonth,
      agentsPaid,
    },
  });
});

/** GET /api/billing/commission-agent/agents/:id */
exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let agent = await CommissionAgent.findById(id).lean();

  if (!agent && Enquiry) {
    const enq = await Enquiry.findById(id).populate('agentId').lean();
    if (enq) {
      agent = {
        _id: enq._id,
        agentName: enq.agentId ? `${enq.agentId.firstName || enq.agentId.name || ''} ${enq.agentId.lastName || ''}`.trim() : 'Attached Agent',
        harvestType: enq.packingType || 'Sahyadri',
        commissionStructure: 'Per box',
        commissionValue: 10,
        totalBusiness: Number((enq.estimatedBoxes || 100) * (enq.purchaseRate || 500)),
        totalCommission: Number((enq.estimatedBoxes || 100) * 10),
        totalPaid: 0,
        isActive: true,
      };
    }
  }

  if (!agent) return res.status(404).json({ success: false, message: 'Commission agent not found' });
  res.json({ success: true, data: normalizeAgent(agent) });
});

/** POST /api/billing/commission-agent/agents */
exports.create = asyncHandler(async (req, res) => {
  const agent = await CommissionAgent.create(req.body);
  res.status(201).json({ success: true, data: normalizeAgent(agent.toObject()) });
});

/** PATCH /api/billing/commission-agent/agents/:id */
exports.update = asyncHandler(async (req, res) => {
  const agent = await CommissionAgent.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!agent) return res.status(404).json({ success: false, message: 'Commission agent not found' });
  res.json({ success: true, data: normalizeAgent(agent.toObject()) });
});

/** POST /api/billing/commission-agent/payments (Pay Commission Agent) */
exports.createPayment = asyncHandler(async (req, res) => {
  const {
    agentRef,
    agentId,
    agentName,
    agent,
    amount,
    amountPaid,
    bankName,
    bank,
    beneficiaryName,
    accountNo,
    paymentMode,
    transactionId,
    remark,
  } = req.body;

  const paidAmount = Number(amount || amountPaid || 0);
  const targetAgentRef = agentRef || agentId || null;
  const targetAgentName = agentName || agent || 'Commission Agent';

  const payment = await CommissionPayment.create({
    agentRef: targetAgentRef,
    agentName: targetAgentName,
    date: new Date(),
    amount: paidAmount,
    amountPaid: paidAmount,
    bankName: bankName || bank || '',
    bank: bank || bankName || '',
    beneficiaryName: beneficiaryName || '',
    accountNo: accountNo || '',
    paymentMode: paymentMode || 'Bank Transfer',
    transactionId: transactionId || '',
    paidBy: req.user ? req.user._id : null,
    remark: remark || '',
  });

  if (targetAgentRef) {
    await CommissionAgent.findByIdAndUpdate(targetAgentRef, {
      $inc: { totalPaid: paidAmount },
    });
  }

  res.status(201).json({ success: true, data: payment, message: 'Commission payment recorded successfully' });
});

/** GET /api/billing/commission-agent/payments */
exports.getPayments = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 20 } = req.query;

  const query = {};
  if (search) {
    query.agentName = { $regex: search, $options: 'i' };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [rawPayments, total] = await Promise.all([
    CommissionPayment.find(query)
      .sort({ date: -1, createdAt: -1 })
      .populate('paidBy', 'firstName lastName role')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    CommissionPayment.countDocuments(query),
  ]);

  const data = rawPayments.map((p) => ({
    _id: p._id,
    agentRef: p.agentRef || null,
    agentName: p.agentName,
    agent: p.agentName,
    date: p.date,
    amount: p.amount || p.amountPaid || 0,
    amountPaid: p.amount || p.amountPaid || 0,
    bank: p.bankName || p.bank || '',
    bankName: p.bankName || p.bank || '',
    beneficiaryName: p.beneficiaryName || '',
    accountNo: p.accountNo || '',
    paymentMode: p.paymentMode || 'Bank Transfer',
    transactionId: p.transactionId || '',
    paidBy: p.paidBy || null,
    remark: p.remark || '',
  }));

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
