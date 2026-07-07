require('dotenv').config();
const mongoose = require('mongoose');
const Enquiry = require('./src/modules/enquiries/enquiry.model');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/banana').then(async () => {
  const agg = await Enquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('Enquiry Status Counts:', agg);

  const Logistics = require('./src/modules/logistics/logistics.model');
  const logAgg = await Logistics.aggregate([{ $group: { _id: '$assignmentStatus', count: { $sum: 1 } } }]);
  console.log('Logistics Status Counts:', logAgg);

  process.exit(0);
});
