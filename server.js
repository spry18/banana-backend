require('dotenv').config();
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB = require('./src/config/db');
const { notFound, errorHandler } = require('./src/middlewares/error.middleware');

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message, err.stack);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message, err.stack);
    // If using a server, gracefully close it before exiting
    // server.close(() => {
    process.exit(1);
    // });
});

// Load Env variables
dotenv.config();

// Connect to the database
connectDB();

const app = express();

// Apply Global Middlewares
app.use(express.json());
// app.use(mongoSanitize()); comment it due to version issue
// 1. CORS MUST come first so it can handle the preflight requests
app.use(cors({
    origin: '*', // Allows all origins (Safe for dev, lock down later!)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 2. Helmet comes SECOND, configured specifically for an API server
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Disables CSP (not needed for APIs, only for serving HTML)
}));

// Rate Limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api', limiter);

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
app.use('/api/daily-logs', require('./src/modules/auditing/dailyLog.routes'));

// Execution: merged detail view + OM review (GET /:id, PATCH /:id/review)
app.use('/api/execution', require('./src/modules/execution/execution.routes'));

// Diesel Advance module (OM fuel advances to drivers)
app.use('/api/diesel-advance', require('./src/modules/diesel-advance/dieselAdvance.routes'));

// Operational Manager module
app.use('/api/operational-manager', require('./src/modules/operational-manager/om.routes'));

// Munshi (Packing Supervisor) module
app.use('/api/munshi', require('./src/modules/munshi/munshi.routes'));

// Driver (Eicher & Pickup) module
app.use('/api/driver', require('./src/modules/driver/driver.routes'));

// Phase 4+7: Admin aggregation routes (dashboard-stats, alerts, field-selection, performance)
app.use('/api/admin', require('./src/modules/admin/admin.routes'));

// Field Owner module
app.use('/api/field-owner', require('./src/modules/field-owner/field-owner.routes'));

// Field Selector module
app.use('/api/field-selector', require('./src/modules/field-selector/field-selector.routes'));

// Phase 6: Notification feed + WhatsApp trigger
app.use('/api/notifications', require('./src/modules/notifications/notification.routes'));

// Phase 8: Analytics & export
app.use('/api/analytics', require('./src/modules/analytics/analytics.routes'));

// Phase 9: Audit logs — correct path is now /api/audit/logs (GET /)
app.use('/api/audit/logs', require('./src/modules/auditing/systemAudit.routes'));

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Define the port
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
