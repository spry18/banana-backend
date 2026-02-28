require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/db');

// Connect to the database
connectDB();

const app = express();

// Apply Global Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic test route
app.get('/', (req, res) => {
    res.send('Banana Import-Export API running');
});

// App Routes
app.use('/api/users', require('./src/modules/users/user.routes'));
app.use('/api/master-data', require('./src/modules/master-data/master.routes'));
app.use('/api/enquiries', require('./src/modules/enquiries/enquiry.routes'));
app.use('/api/inspections', require('./src/modules/inspections/inspection.routes'));
app.use('/api/logistics', require('./src/modules/logistics/logistics.routes'));
app.use('/api/execution/packing', require('./src/modules/execution/packing.routes'));
app.use('/api/execution/trips', require('./src/modules/execution/trip.routes'));
app.use('/api/system-audits', require('./src/modules/auditing/systemAudit.routes'));
app.use('/api/dashboard', require('./src/modules/dashboard/dashboard.routes'));

// Define the port
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
