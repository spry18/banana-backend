require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');

// Connect to the database
connectDB();

const app = express();

// Apply Global Middlewares
app.use(cors());
app.use(express.json());

// Basic test route
app.get('/', (req, res) => {
    res.send('Banana Import-Export API running');
});

// App Routes
app.use('/api/users', require('./src/modules/users/user.routes'));
app.use('/api/master-data', require('./src/modules/master-data/master.routes'));

// Define the port
const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
