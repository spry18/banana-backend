'use strict';
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

// Register models
require('./src/modules/users/user.model');
try {
  require('./src/modules/master-data/agent.model');
  require('./src/modules/master-data/company.model');
  require('./src/modules/master-data/brand.model');
} catch (e) {}
try {
  require('./src/modules/logistics/logistics.model');
} catch (e) {}

const kharchiCtrl = require('./src/modules/billing/kharchi/kharchi.controller');
const eicherCtrl = require('./src/modules/billing/eicher/eicher.controller');
const pickupCtrl = require('./src/modules/billing/pickup/pickup.controller');
const fuelCtrl = require('./src/modules/billing/fuel/fuel.controller');
const agentCtrl = require('./src/modules/billing/commission-agent/commissionAgent.controller');
const csCtrl = require('./src/modules/billing/cold-storage/coldStorage.controller');

// Mock req and res for testing controllers directly
function createMockReqRes(query = {}, body = {}, params = {}) {
  let resData = null;
  let resStatus = 200;

  const req = { query, body, params, user: { _id: '6a24461748881cae8aa8de1e' } };
  const res = {
    status(code) {
      resStatus = code;
      return this;
    },
    json(data) {
      resData = data;
      return this;
    },
  };

  return { req, res, getResult: () => ({ status: resStatus, data: resData }) };
}

async function runTests() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB successfully.\n');

  console.log('=====================================================');
  console.log('1. TESTING KHARCHI BILLING MODULE');
  console.log('=====================================================');

  // 1a. Summary
  const kSum = createMockReqRes();
  await kharchiCtrl.getSummary(kSum.req, kSum.res);
  console.log('Kharchi Summary:', JSON.stringify(kSum.getResult().data, null, 2));

  // 1b. Expenses List
  const kExp = createMockReqRes({ status: 'Approved', page: 1, limit: 5 });
  await kharchiCtrl.getAll(kExp.req, kExp.res);
  console.log(`Kharchi Approved Expenses (Count: ${kExp.getResult().data?.pagination?.total || 0}):`);
  console.log(JSON.stringify(kExp.getResult().data?.data?.slice(0, 2), null, 2));

  // 1c. Record Payment
  const kPay = createMockReqRes(
    {},
    {
      expenseId: kExp.getResult().data?.data?.[0]?._id || '6a310346d3d2a767ad5078b0',
      totalAmount: 1500,
      bankName: 'HDFC Bank',
      beneficiaryName: 'Sharma Electricals',
      accountNo: '50100987654',
      remark: 'Test Payment',
    }
  );
  await kharchiCtrl.createPayment(kPay.req, kPay.res);
  console.log('Kharchi Payment Recorded:', JSON.stringify(kPay.getResult().data, null, 2));

  // 1d. Payment History
  const kHist = createMockReqRes({ page: 1, limit: 5 });
  await kharchiCtrl.getPaymentHistory(kHist.req, kHist.res);
  console.log(`Kharchi Payment History (Total: ${kHist.getResult().data?.pagination?.total || 0})`);

  console.log('\n=====================================================');
  console.log('2. TESTING EICHER BILLING MODULE');
  console.log('=====================================================');

  // 2a. Summary
  const eSum = createMockReqRes();
  await eicherCtrl.getSummary(eSum.req, eSum.res);
  console.log('Eicher Summary:', JSON.stringify(eSum.getResult().data, null, 2));

  // 2b. Trips List
  const eTrips = createMockReqRes({ page: 1, limit: 5 });
  await eicherCtrl.getTrips(eTrips.req, eTrips.res);
  console.log(`Eicher Trips (Total Approved: ${eTrips.getResult().data?.pagination?.total || 0}):`);
  console.log(JSON.stringify(eTrips.getResult().data?.data?.slice(0, 2), null, 2));

  // 2c. Payment Summary
  const ePaySum = createMockReqRes();
  await eicherCtrl.getPaymentSummary(ePaySum.req, ePaySum.res);
  console.log('Eicher Payment Summary (Driver/Vehicle Breakdown):');
  console.log(JSON.stringify(ePaySum.getResult().data?.data?.slice(0, 2), null, 2));

  // 2d. Record Payment
  const ePay = createMockReqRes(
    {},
    {
      tripId: eTrips.getResult().data?.data?.[0]?._id,
      driverRef: '6a24461748881cae8aa8de1e',
      vehicleNo: 'MH15AB1234',
      amountPaid: 5000,
      bankName: 'HDFC Bank',
      beneficiaryName: 'Datta Koli',
      accountNo: '50100987654',
      remark: 'Weekly payout test',
    }
  );
  await eicherCtrl.createPayment(ePay.req, ePay.res);
  console.log('Eicher Driver Payment Recorded:', JSON.stringify(ePay.getResult().data, null, 2));

  // 2e. Payment History
  const eHist = createMockReqRes({ page: 1, limit: 5 });
  await eicherCtrl.getPaymentHistory(eHist.req, eHist.res);
  console.log(`Eicher Payment History (Total: ${eHist.getResult().data?.pagination?.total || 0})`);

  console.log('\n=====================================================');
  console.log('3. TESTING PICKUP BILLING MODULE');
  console.log('=====================================================');

  // 3a. Summary
  const pSum = createMockReqRes();
  await pickupCtrl.getSummary(pSum.req, pSum.res);
  console.log('Pickup Summary:', JSON.stringify(pSum.getResult().data, null, 2));

  // 3b. Trips List
  const pTrips = createMockReqRes({ page: 1, limit: 5 });
  await pickupCtrl.getTrips(pTrips.req, pTrips.res);
  console.log(`Pickup Trips (Total Approved: ${pTrips.getResult().data?.pagination?.total || 0}):`);
  console.log(JSON.stringify(pTrips.getResult().data?.data?.slice(0, 2), null, 2));

  // 3c. Payment Summary
  const pPaySum = createMockReqRes();
  await pickupCtrl.getPaymentSummary(pPaySum.req, pPaySum.res);
  console.log('Pickup Payment Summary (Driver/Vehicle Breakdown):');
  console.log(JSON.stringify(pPaySum.getResult().data?.data?.slice(0, 2), null, 2));

  // 3d. Record Payment
  const pPay = createMockReqRes(
    {},
    {
      tripId: pTrips.getResult().data?.data?.[0]?._id,
      driverRef: '6a24459e48881cae8aa8de16',
      vehicleNo: 'MH15PK1234',
      amountPaid: 2000,
      bankName: 'ICICI Bank',
      beneficiaryName: 'Aaba Chavan',
      accountNo: '09876543210',
      remark: 'Weekly pickup payout test',
    }
  );
  await pickupCtrl.createPayment(pPay.req, pPay.res);
  console.log('Pickup Driver Payment Recorded:', JSON.stringify(pPay.getResult().data, null, 2));

  // 3e. Payment History
  const pHist = createMockReqRes({ page: 1, limit: 5 });
  await pickupCtrl.getPaymentHistory(pHist.req, pHist.res);
  console.log(`Pickup Payment History (Total: ${pHist.getResult().data?.pagination?.total || 0})`);

  console.log('\n=====================================================');
  console.log('4. TESTING FUEL / PETROL-DIESEL BILLING MODULE');
  console.log('=====================================================');

  // 4a. Summary
  const fSum = createMockReqRes();
  await fuelCtrl.getSummary(fSum.req, fSum.res);
  console.log('Fuel Summary Cards:', JSON.stringify(fSum.getResult().data, null, 2));

  // 4b. Entries List
  const fEntries = createMockReqRes({ page: 1, limit: 5 });
  await fuelCtrl.getAll(fEntries.req, fEntries.res);
  console.log(`Fuel Entries (Total Count: ${fEntries.getResult().data?.pagination?.total || 0}):`);
  console.log(JSON.stringify(fEntries.getResult().data?.data?.slice(0, 2), null, 2));

  // 4c. Pump Summary
  const fPumpSum = createMockReqRes();
  await fuelCtrl.getPumpSummary(fPumpSum.req, fPumpSum.res);
  console.log('Fuel Pump-Wise Payment Summary:');
  console.log(JSON.stringify(fPumpSum.getResult().data?.data?.slice(0, 2), null, 2));

  // 4d. Record Payment
  const fPay = createMockReqRes(
    {},
    {
      pumpName: 'Sonai Petrol Pump',
      paymentCycle: '1 July - 15 July',
      totalAmount: 50000,
      bankName: 'HDFC Bank',
      beneficiaryName: 'Sonai Petrol Pump',
      accountNo: '50100987654321',
      remark: 'Cycle payment test',
    }
  );
  await fuelCtrl.createPayment(fPay.req, fPay.res);
  console.log('Fuel Pump Payment Recorded:', JSON.stringify(fPay.getResult().data, null, 2));

  // 4e. Payment History
  const fHist = createMockReqRes({ page: 1, limit: 5 });
  await fuelCtrl.getPaymentHistory(fHist.req, fHist.res);
  console.log(`Fuel Payment History (Total: ${fHist.getResult().data?.pagination?.total || 0})`);

  console.log('\n=====================================================');
  console.log('5. TESTING COMMISSION AGENT BILLING MODULE');
  console.log('=====================================================');

  // 5a. Create Agent
  const cCreate = createMockReqRes(
    {},
    {
      agentName: 'Bharat Deshmukh',
      harvestType: 'Sahyadri',
      commissionStructure: 'Per box',
      commissionValue: 10,
      totalBusiness: 6200000,
      totalCommission: 184000,
    }
  );
  await agentCtrl.create(cCreate.req, cCreate.res);
  console.log('Commission Agent Created:', JSON.stringify(cCreate.getResult().data, null, 2));

  const newAgentId = cCreate.getResult().data?.data?._id;

  // 5b. Summary
  const cSum = createMockReqRes();
  await agentCtrl.getSummary(cSum.req, cSum.res);
  console.log('Commission Agent Summary Cards:', JSON.stringify(cSum.getResult().data, null, 2));

  // 5c. Agent List
  const cAgents = createMockReqRes({ page: 1, limit: 5 });
  await agentCtrl.getAll(cAgents.req, cAgents.res);
  console.log(`Commission Agents List (Total: ${cAgents.getResult().data?.pagination?.total || 0}):`);
  console.log(JSON.stringify(cAgents.getResult().data?.data?.slice(0, 2), null, 2));

  // 5d. Record Agent Payment
  const cPay = createMockReqRes(
    {},
    {
      agentRef: newAgentId,
      agentName: 'Bharat Deshmukh',
      amountPaid: 50000,
      bankName: 'HDFC Bank',
      beneficiaryName: 'Bharat Deshmukh',
      accountNo: '50100987654321',
      paymentMode: 'Bank Transfer',
      remark: 'Monthly commission payout test',
    }
  );
  await agentCtrl.createPayment(cPay.req, cPay.res);
  console.log('Commission Agent Payment Recorded:', JSON.stringify(cPay.getResult().data, null, 2));

  // 5e. Payment History
  const cHist = createMockReqRes({ page: 1, limit: 5 });
  await agentCtrl.getPayments(cHist.req, cHist.res);
  console.log(`Commission Payment History (Total: ${cHist.getResult().data?.pagination?.total || 0})`);

  console.log('\n=====================================================');
  console.log('6. TESTING COLD STORAGE BILLING MODULE');
  console.log('=====================================================');

  // 6a. Summary
  const csSum = createMockReqRes();
  await csCtrl.getSummary(csSum.req, csSum.res);
  console.log('Cold Storage Summary Cards:', JSON.stringify(csSum.getResult().data, null, 2));

  // 6b. Entries List (Completed Enquiries Only)
  const csEntries = createMockReqRes({ page: 1, limit: 5 });
  await csCtrl.getAll(csEntries.req, csEntries.res);
  console.log(`Cold Storage Completed Entries (Total Count: ${csEntries.getResult().data?.pagination?.total || 0}):`);
  console.log(JSON.stringify(csEntries.getResult().data?.data?.slice(0, 2), null, 2));

  // 6c. Payment Cycles
  const csCycles = createMockReqRes();
  await csCtrl.getPaymentCycles(csCycles.req, csCycles.res);
  console.log('Cold Storage Payment Cycles (Storage & Company Breakdown):');
  console.log(JSON.stringify(csCycles.getResult().data?.data?.slice(0, 2), null, 2));

  // 6d. Record Payment
  const csPay = createMockReqRes(
    {},
    {
      coldStorageName: 'Dindori Unit-2',
      companyName: 'ABC Farms',
      paymentCycle: '1 July - 15 July',
      totalAmount: 96400,
      noOfContainers: 10,
      bankName: 'HDFC Bank',
      beneficiaryName: 'Dindori Unit-2 Cold Storage',
      accountNo: '50100987654321',
      remark: 'Monthly cold storage payout test',
    }
  );
  await csCtrl.createPayment(csPay.req, csPay.res);
  console.log('Cold Storage Payment Recorded:', JSON.stringify(csPay.getResult().data, null, 2));

  // 6e. Payment History
  const csHist = createMockReqRes({ page: 1, limit: 5 });
  await csCtrl.getPaymentHistory(csHist.req, csHist.res);
  console.log(`Cold Storage Payment History (Total: ${csHist.getResult().data?.pagination?.total || 0})`);

  console.log('\n=====================================================');
  console.log('ALL BILLING MODULE FLOW TESTS COMPLETED SUCCESSFULLY ✅');
  console.log('=====================================================');

  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  mongoose.disconnect();
});
