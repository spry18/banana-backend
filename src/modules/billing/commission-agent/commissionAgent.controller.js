'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const CommissionAgent = require('./commissionAgent.model');
const CommissionPayment = require('./commissionPayment.model');

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
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    CommissionAgent.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    CommissionAgent.countDocuments(query),
  ]);
  res.json({ success: true, data, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/billing/commission-agent/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [activeCount, paidAgg, statsAgg] = await Promise.all([
    CommissionAgent.countDocuments({ isActive: true }),
    CommissionPayment.aggregate([
      { $match: { createdAt: { $gte: monthAgo } } },
      { $group: { _id: null, paid: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    CommissionAgent.aggregate([
      { $group: { _id: null, totalBusiness: { $sum: '$totalBusiness' }, commissionDue: { $sum: '$totalCommission' } } },
    ]),
  ]);
  res.json({
    success: true,
    data: {
      activeAgents: activeCount,
      businessViaAgents: statsAgg[0]?.totalBusiness ?? 0,
      commissionDue: statsAgg[0]?.commissionDue ?? 0,
      paidThisMonth: paidAgg[0]?.paid ?? 0,
      agentsPaid: paidAgg[0]?.count ?? 0,
    },
  });
});

/** POST /api/billing/commission-agent/agents */
exports.create = asyncHandler(async (req, res) => {
  const agent = await CommissionAgent.create(req.body);
  res.status(201).json({ success: true, data: agent });
});

/** GET /api/billing/commission-agent/agents/:id */
exports.getById = asyncHandler(async (req, res) => {
  const agent = await CommissionAgent.findById(req.params.id).lean();
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
  res.json({ success: true, data: agent });
});

/** PATCH /api/billing/commission-agent/agents/:id */
exports.update = asyncHandler(async (req, res) => {
  const agent = await CommissionAgent.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
  res.json({ success: true, data: agent });
});

/** POST /api/billing/commission-agent/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await CommissionPayment.create(req.body);
  res.status(201).json({ success: true, data: payment });
});
