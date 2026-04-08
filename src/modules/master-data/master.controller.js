const Company = require('./company.model');
const Brand = require('./brand.model');
const Agent = require('./agent.model');
const Vehicle = require('./vehicle.model');
const Generation = require('./generation.model');
const User = require('../users/user.model');

// --- Companies ---
const createCompany = async (req, res) => {
    try {
        const { companyName, legalName, taxId, headquarters, procurementNotes } = req.body;
        if (!companyName || !headquarters) {
            return res.status(400).json({ message: 'companyName and headquarters are required' });
        }
        const company = await Company.create({ companyName, legalName, taxId, headquarters, procurementNotes });
        res.status(201).json(company);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getCompanies = async (req, res) => {
    try {
        const companies = await Company.find({ isActive: true });
        res.json(companies);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateCompany = async (req, res) => {
    try {
        const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(company);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteCompany = async (req, res) => {
    try {
        await Company.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Company deleted (soft)' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Brands ---
const createBrand = async (req, res) => {
    try {
        const { brandName, companyId } = req.body;
        if (!brandName || !companyId) {
            return res.status(400).json({ message: 'brandName and companyId are required' });
        }
        const brand = await Brand.create({ brandName, companyId });
        res.status(201).json(brand);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getBrands = async (req, res) => {
    try {
        const brands = await Brand.find({ isActive: true }).populate('companyId', 'companyName');
        res.json(brands);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateBrand = async (req, res) => {
    try {
        const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(brand);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteBrand = async (req, res) => {
    try {
        await Brand.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Brand deleted (soft)' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Agents ---
const createAgent = async (req, res) => {
    try {
        const { agentName, mobileNo, contactPerson, location, notes } = req.body;
        if (!agentName || !mobileNo || !contactPerson || !location) {
            return res.status(400).json({ message: 'agentName, mobileNo, contactPerson, and location are required' });
        }
        const agent = await Agent.create({ agentName, mobileNo, contactPerson, location, notes });
        res.status(201).json(agent);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getAgents = async (req, res) => {
    try {
        const agents = await Agent.find({ isActive: true });
        res.json(agents);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateAgent = async (req, res) => {
    try {
        const agent = await Agent.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(agent);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteAgent = async (req, res) => {
    try {
        await Agent.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Agent deleted (soft)' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Vehicles ---
const createVehicle = async (req, res) => {
    try {
        const { vehicleNumber, vehicleType } = req.body;
        if (!vehicleNumber || !vehicleType) {
            return res.status(400).json({ message: 'vehicleNumber and vehicleType are required' });
        }
        const vehicle = await Vehicle.create({ vehicleNumber, vehicleType });
        res.status(201).json(vehicle);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getVehicles = async (req, res) => {
    try {
        const vehicles = await Vehicle.find({ isActive: true });
        res.json(vehicles);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateVehicle = async (req, res) => {
    try {
        const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(vehicle);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteVehicle = async (req, res) => {
    try {
        await Vehicle.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Vehicle deleted (soft)' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Generations ---
const createGeneration = async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'name is required' });
        }
        const generation = await Generation.create({ name, description });
        res.status(201).json(generation);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getGenerations = async (req, res) => {
    try {
        const generations = await Generation.find({ isActive: true });
        res.json(generations);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateGeneration = async (req, res) => {
    try {
        const generation = await Generation.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json(generation);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const deleteGeneration = async (req, res) => {
    try {
        await Generation.findByIdAndUpdate(req.params.id, { isActive: false });
        res.json({ message: 'Generation deleted (soft)' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const getDrivers = async (req, res) => {
    try {
        const drivers = await User.find({ role: { $regex: /driver/i }, isActive: true })
            .select('_id firstName lastName mobileNo role vehicleId')
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .lean();
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Form Dropdowns (single aggregated endpoint for all UI select boxes) ---
// @desc    Get all dropdown data needed for Create Enquiry and Fix Rate forms
// @route   GET /api/master-data/dropdowns
// @access  Protected (Admin, Field Owner, Operational Manager)
const getFormDropdowns = async (req, res) => {
    try {
        // Run all queries in parallel for best performance
        const [companies, agents, generations, selectors, brands, munshis, eicherDrivers, pickupDrivers] = await Promise.all([
            Company.find({ isActive: true }).select('_id companyName legalName headquarters').lean(),
            Agent.find({ isActive: true }).select('_id agentName mobileNo location').lean(),
            Generation.find({ isActive: true }).select('_id name description').lean(),
            User.find({ role: 'Field Selector', isActive: true }).select('_id firstName lastName mobileNo').lean(),
            Brand.find({ isActive: true }).select('_id brandName companyId').populate('companyId', 'companyName').lean(),
            User.find({ role: { $regex: /munshi/i }, isActive: true }).select('_id firstName lastName mobileNo').lean(),
            User.find({ role: 'driver eicher', isActive: true }).select('_id firstName lastName mobileNo vehicleId').populate('vehicleId', 'vehicleNumber vehicleType').lean(),
            User.find({ role: 'driver pickup', isActive: true }).select('_id firstName lastName mobileNo vehicleId').populate('vehicleId', 'vehicleNumber vehicleType').lean(),
        ]);

        res.status(200).json({
            companies,
            agents,
            generations,
            selectors,
            brands,
            munshis,
            eicherDrivers,
            pickupDrivers,
        });
    } catch (error) {
        console.error('Error fetching form dropdowns:', error);
        res.status(500).json({ message: 'Server error while fetching form dropdowns' });
    }
};

module.exports = {
    createCompany,
    getCompanies,
    updateCompany,
    deleteCompany,
    createBrand,
    getBrands,
    updateBrand,
    deleteBrand,
    createAgent,
    getAgents,
    updateAgent,
    deleteAgent,
    createVehicle,
    getVehicles,
    updateVehicle,
    deleteVehicle,
    createGeneration,
    getGenerations,
    updateGeneration,
    deleteGeneration,
    getFormDropdowns,
    getDrivers,
};
