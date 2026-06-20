const mongoose = require('mongoose');
const { getFOPlots } = require('./src/modules/field-owner/field-owner.controller');
require('./src/modules/enquiries/generation.model');
require('./src/modules/users/user.model');
require('./src/modules/companies/company.model');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/banana');
  
  const req = { query: { status: 'RESCHEDULED', page: 1, limit: 50 } };
  const res = {
    json: (data) => console.log('Response JSON:', JSON.stringify(data, null, 2)),
    status: (code) => ({ json: (err) => console.log('Error', code, err) })
  };
  
  await getFOPlots(req, res);
  process.exit();
}
run();
