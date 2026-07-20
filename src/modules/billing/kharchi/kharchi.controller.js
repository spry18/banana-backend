'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const Kharchi = require('./kharchi.model');
const KharchiPayment = require('./kharchiPayment.model');

const periodFilter = (f) => { const m={Daily:1,Weekly:7,Monthly:30}; const d=m[f]; if(!d) return null; const s=new Date(); s.setDate(s.getDate()-d); return {$gte:s}; };

/** GET /api/billing/kharchi/expenses */
exports.getAll = asyncHandler(async (req, res) => {
  const { search='', date, status, type, filter, page=1, limit=20 } = req.query;
  const query = {};
  if (search) query.$or = [{ nature: { $regex: search, $options: 'i' } }, { payTo: { $regex: search, $options: 'i' } }];
  if (date) { query.date = { $gte: new Date(new Date(date).setHours(0,0,0,0)), $lte: new Date(new Date(date).setHours(23,59,59,999)) }; }
  if (status) query.status = status;
  if (type) query.type = type;
  const pf = periodFilter(filter);
  if (pf && !date) query.date = pf;
  const skip = (Number(page)-1)*Number(limit);
  const [data,total] = await Promise.all([Kharchi.find(query).sort({date:-1}).skip(skip).limit(Number(limit)).lean(), Kharchi.countDocuments(query)]);
  res.json({success:true,data,pagination:{total,page:Number(page),limit:Number(limit)}});
});

/** GET /api/billing/kharchi/summary */
exports.getSummary = asyncHandler(async (req, res) => {
  const todayStart = new Date(new Date().setHours(0,0,0,0));
  const agg = await Kharchi.aggregate([
    { $match: { date: { $gte: todayStart } } },
    { $group: { _id: { type: '$type', term: '$term' }, total: { $sum: '$amount' } } },
  ]);
  let todayKharchi=0, smallShort=0, smallLong=0, bigShort=0, bigLong=0;
  agg.forEach(a => {
    todayKharchi += a.total;
    if(a._id.type==='Small' && a._id.term==='Short') smallShort=a.total;
    if(a._id.type==='Small' && a._id.term==='Long') smallLong=a.total;
    if(a._id.type==='Big' && a._id.term==='Short') bigShort=a.total;
    if(a._id.type==='Big' && a._id.term==='Long') bigLong=a.total;
  });
  res.json({ success:true, data:{ todayKharchi, smallKharchi: smallShort+smallLong, bigKharchi: bigShort+bigLong, smallShort, smallLong, bigShort, bigLong } });
});

/** POST /api/billing/kharchi/expenses */
exports.create = asyncHandler(async (req, res) => {
  const expense = await Kharchi.create(req.body);
  res.status(201).json({success:true,data:expense});
});

/** GET /api/billing/kharchi/expenses/:id */
exports.getById = asyncHandler(async (req, res) => {
  const expense = await Kharchi.findById(req.params.id).lean();
  if(!expense) return res.status(404).json({success:false,message:'Expense not found'});
  res.json({success:true,data:expense});
});

/** PATCH /api/billing/kharchi/expenses/:id/approve */
exports.approve = asyncHandler(async (req, res) => {
  const expense = await Kharchi.findByIdAndUpdate(req.params.id, { status:'Approved', approvedBy: req.user._id, approvedAt: new Date() }, { new:true });
  if(!expense) return res.status(404).json({success:false,message:'Expense not found'});
  res.json({success:true,data:expense});
});

/** PATCH /api/billing/kharchi/expenses/:id/reject */
exports.reject = asyncHandler(async (req, res) => {
  const expense = await Kharchi.findByIdAndUpdate(req.params.id, { status:'Rejected' }, { new:true });
  if(!expense) return res.status(404).json({success:false,message:'Expense not found'});
  res.json({success:true,data:expense});
});

/** POST /api/billing/kharchi/payments */
exports.createPayment = asyncHandler(async (req, res) => {
  const payment = await KharchiPayment.create(req.body);
  if(req.body.expenseRef) { await Kharchi.findByIdAndUpdate(req.body.expenseRef, {status:'Paid'}); }
  res.status(201).json({success:true,data:payment});
});
