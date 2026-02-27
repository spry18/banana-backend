const Company = require('./company.model');
const Brand = require('./brand.model');
const Agent = require('./agent.model');
const Vehicle = require('./vehicle.model');

// --- Companies ---
const createCompany = async (req, res) => {
    try {
        const { companyName } = req.body;
        if (!companyName) {
            return res.status(400).json({ message: 'companyName is required' });
        }
        const company = await Company.create({ companyName });
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
        await Company.findByIdAndDelete(req.params.id);
        res.json({ message: 'Company deleted' });
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
        await Brand.findByIdAndDelete(req.params.id);
        res.json({ message: 'Brand deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Agents ---
const createAgent = async (req, res) => {
    try {
        const { agentName, mobileNo } = req.body;
        if (!agentName || !mobileNo) {
            return res.status(400).json({ message: 'agentName and mobileNo are required' });
        }
        const agent = await Agent.create({ agentName, mobileNo });
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
        await Agent.findByIdAndDelete(req.params.id);
        res.json({ message: 'Agent deleted' });
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
        await Vehicle.findByIdAndDelete(req.params.id);
        res.json({ message: 'Vehicle deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
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
};
