const mongoose = require('mongoose');
const Enquiry = require('./src/modules/enquiries/enquiry.model');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/banana');
  
  const status = 'RESCHEDULED';
  const query = { status: status };
  
  const plots = await Enquiry.find(query).lean();
  console.log('Plots with status RESCHEDULED:', plots.length);
  console.log('Plots details:', plots.map(p => ({ id: p._id, status: p.status, name: p.farmerFirstName })));
  
  process.exit();
}
run();
