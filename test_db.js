const mongoose = require('mongoose');
const Enquiry = require('./src/modules/enquiries/enquiry.model');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/banana');
  const now = new Date();
  
  const pendingFuture = await Enquiry.countDocuments({ status: 'PENDING', scheduledDate: { $gt: now } });
  const rescheduledActual = await Enquiry.countDocuments({ status: 'RESCHEDULED' });
  const allEnquiries = await Enquiry.countDocuments({});
  
  console.log('Total Enquiries:', allEnquiries);
  console.log('PENDING + Future Date:', pendingFuture);
  console.log('status=RESCHEDULED:', rescheduledActual);
  
  process.exit();
}
run();
