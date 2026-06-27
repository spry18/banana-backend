const http = require('http');
const url = require('url');
const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    grey:   '\x1b[90m',
    blue:   '\x1b[34m',
};

let passed = 0;
let failed = 0;
const failures = [];

// HTTP Request Helper
function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(`${BASE_URL}${path}`);
        const payload = body ? JSON.stringify(body) : null;
        
        const opts = {
            hostname: parsed.hostname,
            port:     parsed.port || 80,
            path:     parsed.path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(token  ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', (err) => {
            reject(new Error(`Connection to ${BASE_URL} failed. Is the server running? Details: ${err.message}`));
        });
        
        if (payload) req.write(payload);
        req.end();
    });
}

function assert(condition, label, detail = '') {
    if (condition) {
        console.log(`  ${C.green}✓${C.reset} ${label}`);
        passed++;
    } else {
        console.log(`  ${C.red}✗${C.reset} ${C.bold}${label}${C.reset} ${C.red}← FAILED${C.reset} ${detail ? C.grey + detail + C.reset : ''}`);
        failed++;
        failures.push(`${label}${detail ? ' → ' + detail : ''}`);
    }
}

function section(title) {
    console.log(`\n${C.cyan}${C.bold}━━━  ${title}  ━━━${C.reset}`);
}

async function main() {
    console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════════════════════╗`);
    console.log(`║      Banana Backend — E2E Flow Integration Test  ║`);
    console.log(`║      Target: ${BASE_URL.padEnd(36)}║`);
    console.log(`╚══════════════════════════════════════════════════╝${C.reset}\n`);

    // 1. Resolve DB Credentials & Seed Temp Users
    section('1. CONNECTING TO DATABASE & CREATING TEMPORARY TEST USERS');
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/banana';
    console.log(`  Connecting to MongoDB at: ${uri}`);
    await mongoose.connect(uri);
    console.log('  Database connected successfully!');

    // Fetch models dynamically
    const User = require('./src/modules/users/user.model');
    const Generation = require('./src/modules/master-data/generation.model');
    const Company = require('./src/modules/master-data/company.model');
    const Vehicle = require('./src/modules/master-data/vehicle.model');
    const Enquiry = require('./src/modules/enquiries/enquiry.model');
    const Inspection = require('./src/modules/inspections/inspection.model');
    const Logistics = require('./src/modules/logistics/logistics.model');
    const Packing = require('./src/modules/execution/packing.model');
    const Trip = require('./src/modules/execution/trip.model');

    // Define temporary mobile numbers
    const foMobile = '9999990001';
    const fsMobile = '9999990002';
    const omMobile = '9999990003';
    const munshiMobile = '9999990004';
    const driverMobile = '9999990005';

    // Delete existing temp users to prevent duplicates
    await User.deleteMany({ mobileNo: { $in: [foMobile, fsMobile, omMobile, munshiMobile, driverMobile] } });

    // Fetch a vehicle for the driver
    const vehicle = await Vehicle.findOne();
    if (!vehicle) {
        console.error('No vehicle found in database. Please seed vehicles first.');
        process.exit(1);
    }

    const generation = await Generation.findOne();
    const company = await Company.findOne();

    if (!generation || !company) {
        console.error('  Error: Could not resolve master data (Generation/Company) from the database.');
        process.exit(1);
    }

    // Create temporary users
    const foUser = await User.create({
        firstName: 'Temp-FO',
        lastName: 'User',
        mobileNo: foMobile,
        passwordHash: 'password123',
        role: 'Field Owner'
    });

    const fsUser = await User.create({
        firstName: 'Temp-FS',
        lastName: 'User',
        mobileNo: fsMobile,
        passwordHash: 'password123',
        role: 'Field Selector',
        bikeNumber: 'MH-12-AB-1234'
    });

    const omUser = await User.create({
        firstName: 'Temp-OM',
        lastName: 'User',
        mobileNo: omMobile,
        passwordHash: 'password123',
        role: 'Operational Manager'
    });

    const munshiUser = await User.create({
        firstName: 'Temp-Munshi',
        lastName: 'User',
        mobileNo: munshiMobile,
        passwordHash: 'password123',
        role: 'Munshi'
    });

    const driverUser = await User.create({
        firstName: 'Temp-Driver',
        lastName: 'User',
        mobileNo: driverMobile,
        passwordHash: 'password123',
        role: 'driver eicher',
        vehicleId: vehicle._id
    });

    console.log(`  Created Temp Field Owner: ${foUser.firstName} (${foUser.mobileNo})`);
    console.log(`  Created Temp Selector:    ${fsUser.firstName} (${fsUser.mobileNo})`);
    console.log(`  Created Temp OM:          ${omUser.firstName} (${omUser.mobileNo})`);
    console.log(`  Created Temp Munshi:      ${munshiUser.firstName} (${munshiUser.mobileNo})`);
    console.log(`  Created Temp Driver:      ${driverUser.firstName} (${driverUser.mobileNo})`);
    console.log(`  Resolved Generation:      ${generation.name} (${generation._id})`);
    console.log(`  Resolved Company:         ${company.companyName} (${company._id})`);

    const tokens = {};
    const createdIds = {
        enquiryDbId: null,
        assignmentId: null,
        tripId: null
    };

    // 2. AUTHENTICATION
    section('2. AUTHENTICATION');
    const rolesToLogin = [
        { roleName: 'fieldOwner', creds: { mobileNo: foMobile, password: 'password123' } },
        { roleName: 'fieldSelector', creds: { mobileNo: fsMobile, password: 'password123' } },
        { roleName: 'om', creds: { mobileNo: omMobile, password: 'password123' } },
        { roleName: 'munshi', creds: { mobileNo: munshiMobile, password: 'password123' } },
        { roleName: 'driver', creds: { mobileNo: driverMobile, password: 'password123' } }
    ];

    for (const r of rolesToLogin) {
        try {
            const loginRes = await request('POST', '/api/users/login', r.creds);
            if (loginRes.status === 200 && loginRes.body.token) {
                tokens[r.roleName] = loginRes.body.token;
                assert(true, `Login successful for role [${r.roleName}]`);
            } else {
                assert(false, `Login failed for role [${r.roleName}]`, `Status: ${loginRes.status}`);
            }
        } catch (err) {
            assert(false, `Login failed for role [${r.roleName}]`, err.message);
            process.exit(1);
        }
    }

    // 3. CREATE ENQUIRY
    section('3. CREATE ENQUIRY (PENDING)');
    const enquiryPayload = {
        farmerFirstName: 'E2E-Test',
        farmerLastName:  'Farmer',
        farmerMobile:    '9999999999',
        location:        'Test Village',
        subLocation:     'Test Sub-Village',
        plantCount:      1000,
        generation:      generation._id.toString(),
        visitPriority:   'Medium',
    };

    const createRes = await request('POST', '/api/enquiries', enquiryPayload, tokens.fieldOwner);
    assert(createRes.status === 201, 'POST /api/enquiries → 201 Created');
    if (createRes.status === 201) {
        createdIds.enquiryDbId = createRes.body._id;
        console.log(`  Enquiry Created ID: ${createRes.body.enquiryId} (DB ID: ${createdIds.enquiryDbId})`);
    } else {
        console.error('Failed to create enquiry. Exiting test.');
        process.exit(1);
    }

    // 4. ASSIGN FIELD SELECTOR
    section('4. ASSIGN FIELD SELECTOR');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const assignPayload = {
        assignedSelectorId: fsUser._id.toString(),
        scheduledDate: tomorrow.toISOString(),
        visitPriority: 'High',
    };

    const assignRes = await request('PUT', `/api/enquiries/${createdIds.enquiryDbId}`, assignPayload, tokens.fieldOwner);
    assert(assignRes.status === 200, 'PUT /api/enquiries/:id → 200 Selector Assigned');

    // Verify Selector gets it in list
    const fsPlotsRes = await request('GET', '/api/field-selector/fields', null, tokens.fieldSelector);
    if (fsPlotsRes.status === 200) {
        const found = fsPlotsRes.body.data.find(p => p._id === createdIds.enquiryDbId);
        assert(found !== undefined, 'Verify plot is visible in Field Selector\'s assigned fields list');
    } else {
        assert(false, 'GET /api/field-selector/fields failed', `Status: ${fsPlotsRes.status}`);
    }

    // 5. SUBMIT INSPECTION (SELECTED)
    section('5. SUBMIT INSPECTION (SELECTED)');
    const inspectPayload = {
        enquiryId: createdIds.enquiryDbId,
        packingSize: '13.5kg',
        volumeBoxRange: '300-400',
        recoveryPercent: '85-90',
        chellingPercent: '0-5',
        spiklingPercent: '0-5',
        pulpePercent: '0-5',
        phreepsPercent: '0-5',
        decision: 'SELECTED',
        harvestingTime: 'Immediate',
        harvestingStage: 'Ready',
        minVolume: 300,
        maxVolume: 400,
        remarks: 'E2E Inspection Complete',
    };

    const inspectRes = await request('POST', '/api/inspections', inspectPayload, tokens.fieldSelector);
    assert(inspectRes.status === 201, 'POST /api/inspections → 201 Created', JSON.stringify(inspectRes.body));

    // 6. FIX RATE
    section('6. LOCK RATE (RATE_FIXED)');
    const ratePayload = {
        companyId: company._id.toString(),
        purchaseRate: 850,
        packingType: '13.5Kg',
        estimatedBoxes: 350,
        remarks: 'E2E Fixed Rate 850',
    };
    const rateRes = await request('PATCH', `/api/enquiries/fix-rate/${createdIds.enquiryDbId}`, ratePayload, tokens.fieldOwner);
    assert(rateRes.status === 200, 'PATCH /api/enquiries/fix-rate/:id → 200 Rate Fixed');

    // 7. ASSIGN LOGISTICS TEAM
    section('7. DISPATCH LOGISTICS (ASSIGNED)');
    const logisticsPayload = {
        enquiryId: createdIds.enquiryDbId,
        companyId: company._id.toString(),
        purchaseRate: 850,
        packingType: '13.5Kg',
        totalBoxes: 350,
        teamName: 'E2E Test Team',
        munshiId: munshiUser._id.toString(),
        driverId: driverUser._id.toString(),
        priority: 'MEDIUM',
        lightInTime: '08:00 AM',
        lightOutTime: '10:00 AM',
        scheduledDate: new Date().toISOString(),
    };
    const logRes = await request('POST', '/api/logistics/assign', logisticsPayload, tokens.om);
    assert(logRes.status === 201, 'POST /api/logistics/assign → 201 Logistics Assigned');
    if (logRes.status === 201) {
        createdIds.assignmentId = logRes.body._id;
        console.log(`  Logistics Assignment Created ID: ${createdIds.assignmentId}`);
    } else {
        console.error('Failed to assign logistics. Exiting test.');
        process.exit(1);
    }

    // 8. MUNSHI SUBMIT PACKING REPORT
    section('8. MUNSHI PACKING SUBMISSION');
    const packingPayload = {
        box13_5Kg: 350,
        totalBoxes: 350,
        wastageKg: 15,
        remarks: 'Munshi E2E Packing Complete',
        teamName: 'E2E Test Team',
    };
    const packRes = await request('POST', `/api/munshi/packing/${createdIds.assignmentId}`, packingPayload, tokens.munshi);
    assert(packRes.status === 201, 'POST /api/munshi/packing/:id → 201 Packing Submitted');

    // 9. DRIVER SUBMIT TRIP REPORT
    section('9. DRIVER TRIP SUBMISSION');
    const tripPayload = {
        assignmentId: createdIds.assignmentId,
        driverType: 'Eicher',
        totalKm: 150,
        tollExpense: 20,
        startRoute: 'Test Source',
        destination: 'Test Destination',
        weightSlipUrl: 'http://example.com/weight.jpg',
        dieselSlipUrl: 'http://example.com/diesel.jpg',
        unloadSlipUrl: 'http://example.com/unload.jpg',
        isLocked: true
    };
    const tripRes = await request('POST', '/api/execution/trips', tripPayload, tokens.driver);
    assert(tripRes.status === 201, 'POST /api/execution/trips → 201 Trip Submitted', JSON.stringify(tripRes.body));
    if (tripRes.status === 201) {
        createdIds.tripId = tripRes.body._id;
        console.log(`  Trip Created ID: ${createdIds.tripId}`);
    } else {
        console.error('Failed to submit trip. Exiting.');
        process.exit(1);
    }

    // 10. OM APPROVE TRIP & HARVESTING (PHASE 5 REVIEW)
    section('10. OM REVIEW & APPROVAL (TRIP REVIEW)');
    const reviewPayload = {
        reviewStatus: 'APPROVED',
        reviewNote: 'E2E Trip Approval Note'
    };
    const reviewRes = await request('PATCH', `/api/execution/${createdIds.assignmentId}/review`, reviewPayload, tokens.om);
    assert(reviewRes.status === 200, 'PATCH /api/execution/:id/review → 200 Trip Approved by OM', JSON.stringify(reviewRes.body));

    // 11. GET API VISIBILITY CHECKS
    section('11. VISIBILITY CHECKS (GET PLOTS)');
    
    // Check A: Is it in the Completed list?
    const completedPlotsRes = await request('GET', '/api/field-owner/plots?status=COMPLETED', null, tokens.fieldOwner);
    if (completedPlotsRes.status === 200) {
        const found = completedPlotsRes.body.data.find(p => p._id === createdIds.enquiryDbId);
        assert(found !== undefined, 'COMPLETED plot visibility check (Should be returned in status=COMPLETED query)');
    } else {
        assert(false, 'GET /api/field-owner/plots?status=COMPLETED failed', `Status: ${completedPlotsRes.status}`);
    }

    // Check B: Is it absent from the active Assigned list (awaiting rate fixing)?
    const activePlotsRes = await request('GET', '/api/field-owner/plots?status=ASSIGNED', null, tokens.fieldOwner);
    if (activePlotsRes.status === 200) {
        const found = activePlotsRes.body.data.find(p => p._id === createdIds.enquiryDbId);
        assert(found === undefined, 'ASSIGNED plot exclusion check (Should NOT be returned in status=ASSIGNED query anymore)');
    } else {
        assert(false, 'GET /api/field-owner/plots?status=ASSIGNED failed', `Status: ${activePlotsRes.status}`);
    }

    // 12. CLEANUP
    section('12. DATABASE CLEANUP');
    console.log('  Deleting test records from MongoDB...');
    if (createdIds.enquiryDbId) {
        await Enquiry.deleteOne({ _id: createdIds.enquiryDbId });
        await Inspection.deleteOne({ enquiryId: createdIds.enquiryDbId });
    }
    if (createdIds.assignmentId) {
        await Logistics.deleteOne({ _id: createdIds.assignmentId });
        await Packing.deleteOne({ assignmentId: createdIds.assignmentId });
        await Trip.deleteMany({ assignmentId: createdIds.assignmentId });
    }
    
    // Delete temp users
    await User.deleteMany({ mobileNo: { $in: [foMobile, fsMobile, omMobile, munshiMobile, driverMobile] } });

    console.log('  Cleaned up all created test documents.');
    await mongoose.disconnect();
    assert(true, 'Database connection closed and clean up successful');

    // 13. PRINT SUMMARY
    section('SUMMARY OF RESULTS');
    console.log(`  Passed: ${C.green}${passed}${C.reset}`);
    console.log(`  Failed: ${C.red}${failed}${C.reset}`);
    
    if (failed > 0) {
        console.log(`\n  ${C.red}Failed assertions:${C.reset}`);
        failures.forEach((f, i) => console.log(`    ${i+1}. ${f}`));
        process.exitCode = 1;
    } else {
        console.log(`\n  ${C.green}🎉 All integration tests passed! E2E flow works correctly.${C.reset}\n`);
    }
}

main().catch((err) => {
    console.error(`\n${C.red}FATAL ERROR: ${err.message}${C.reset}`);
    console.error(err.stack);
    process.exit(1);
});
