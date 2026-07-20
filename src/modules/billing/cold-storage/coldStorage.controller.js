'use strict';
const asyncHandler = require('../shared/billing.asyncHandler');
const ColdStorageEntry = require('./coldStorageEntry.model');
const ColdStoragePayment = require('./coldStoragePayment.model');

exports.getAll = asyncHandler(async (req, res) => {
  const { search='', date, month, page=1, limit=20 } = req.query;
  const query={};
  if(search) query.$or=[{coldStorageName:{$regex:search,$options:'i'}},{companyName:{$regex:search,$options:'i'}}];
  if(date){query.date={$gte:new Date(new Date(date).setHours(0,0,0,0)),$lte:new Date(new Date(date).setHours(23,59,59,999))};}
  if(month&&!date){
    const [y,m]=month.split('-').map(Number);
    const start=new Date(y,m-1,1); const end=new Date(y,m,0,23,59,59,999);
    query.date={$gte:start,$lte:end};
  }
  const skip=(Number(page)-1)*Number(limit);
  const [data,total]=await Promise.all([ColdStorageEntry.find(query).sort({date:-1}).skip(skip).limit(Number(limit)).lean(),ColdStorageEntry.countDocuments(query)]);
  res.json({success:true,data,pagination:{total,page:Number(page),limit:Number(limit)}});
});

exports.getSummary = asyncHandler(async (req, res) => {
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const todayStart=new Date(now.setHours(0,0,0,0));
  const [month,today]=await Promise.all([
    ColdStorageEntry.aggregate([{$match:{date:{$gte:monthStart}}},{$group:{_id:null,total:{$sum:'$amount'},containers:{$sum:1}}}]),
    ColdStorageEntry.countDocuments({date:{$gte:todayStart}})
  ]);
  res.json({success:true,data:{totalContainerShiftsToday:today,totalAmount:month[0]?.total??0,totalContainers:month[0]?.containers??0}});
});

exports.create = asyncHandler(async (req,res)=>{ const e=await ColdStorageEntry.create(req.body); res.status(201).json({success:true,data:e}); });
exports.getById = asyncHandler(async (req,res)=>{ const e=await ColdStorageEntry.findById(req.params.id).lean(); if(!e) return res.status(404).json({success:false,message:'Entry not found'}); res.json({success:true,data:e}); });
exports.update = asyncHandler(async (req,res)=>{ const e=await ColdStorageEntry.findByIdAndUpdate(req.params.id,req.body,{new:true}); if(!e) return res.status(404).json({success:false,message:'Entry not found'}); res.json({success:true,data:e}); });

exports.getPaymentCycles = asyncHandler(async (req, res) => {
  const data=await ColdStorageEntry.aggregate([
    {$group:{_id:{storage:'$coldStorageName',company:'$companyName'},storage:{$first:'$coldStorageName'},company:{$first:'$companyName'},total:{$sum:'$amount'},containers:{$sum:1},lastDate:{$max:'$date'}}},
    {$sort:{lastDate:-1}}
  ]);
  res.json({success:true,data});
});

exports.createPayment = asyncHandler(async (req,res)=>{ const p=await ColdStoragePayment.create(req.body); res.status(201).json({success:true,data:p}); });
