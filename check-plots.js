require('dotenv').config();
const mongoose = require('mongoose');

// Register all schemas
require('./src/modules/master-data/generation.model');
require('./src/modules/master-data/company.model');
const Enquiry = require('./src/modules/enquiries/enquiry.model');
const Inspection = require('./src/modules/inspections/inspection.model');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const enq = await Enquiry.findOne({ farmerFirstName: "Ajay", farmerLastName: "Girme" }).populate('companyId').lean();
    if (enq) {
        const insp = await Inspection.findOne({ enquiryId: enq._id }).lean();
        console.log(`Farmer: ${enq.farmerFirstName} ${enq.farmerLastName}`);
        console.log(`  Status: ${enq.status}`);
        console.log(`  PurchaseRate: ${enq.purchaseRate}`);
        console.log(`  Company: ${enq.companyId ? enq.companyId.companyName : 'None'}`);
        console.log(`  Inspection: ${insp ? JSON.stringify(insp) : 'None'}`);
    } else {
        console.log("Ajay Girme not found");
    }

    await mongoose.disconnect();
}

main().catch(console.error);
