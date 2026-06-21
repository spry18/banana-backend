const Company = require('./company.model');
const Brand = require('./brand.model');
const Agent = require('./agent.model');
const Vehicle = require('./vehicle.model');
const Generation = require('./generation.model');
const User = require('../users/user.model');
const Enquiry = require('../enquiries/enquiry.model');

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
        const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
        const companies = await Company.find(filter);
        res.json(companies);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const toggleCompanyStatus = async (req, res) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive (boolean) is required in request body' });
        }
        const company = await Company.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        );
        if (!company) return res.status(404).json({ message: 'Company not found' });
        res.json({ message: `Company ${isActive ? 'activated' : 'deactivated'} successfully`, company });
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
        const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
        const brands = await Brand.find(filter).populate('companyId', 'companyName');
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
        const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
        const agents = await Agent.find(filter);
        res.json(agents);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const toggleAgentStatus = async (req, res) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive (boolean) is required in request body' });
        }
        const agent = await Agent.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        );
        if (!agent) return res.status(404).json({ message: 'Agent not found' });
        res.json({ message: `Agent ${isActive ? 'activated' : 'deactivated'} successfully`, agent });
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
        const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
        const vehicles = await Vehicle.find(filter);
        res.json(vehicles);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const toggleVehicleStatus = async (req, res) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive (boolean) is required in request body' });
        }
        const vehicle = await Vehicle.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        );
        if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
        res.json({ message: `Vehicle ${isActive ? 'activated' : 'deactivated'} successfully`, vehicle });
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
        const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
        const generations = await Generation.find(filter);
        res.json(generations);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const toggleGenerationStatus = async (req, res) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive (boolean) is required in request body' });
        }
        const generation = await Generation.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        );
        if (!generation) return res.status(404).json({ message: 'Generation not found' });
        res.json({ message: `Generation ${isActive ? 'activated' : 'deactivated'} successfully`, generation });
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
        const { date } = req.query;
        const assignedDriverIds = new Set();

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            const Logistics = require('../logistics/logistics.model');
            const activeAssignments = await Logistics.find({
                scheduledDate: { $gte: startOfDay, $lt: endOfDay },
                assignmentStatus: { $ne: 'CANCELLED' }
            }).select('driverId pickupDriverId').lean();

            activeAssignments.forEach(a => {
                if (a.driverId) assignedDriverIds.add(a.driverId.toString());
                if (a.pickupDriverId) assignedDriverIds.add(a.pickupDriverId.toString());
            });
        }

        const drivers = await User.find({ role: { $regex: /driver/i }, isActive: true })
            .select('_id firstName lastName mobileNo role vehicleId')
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .lean();

        const mappedDrivers = drivers.map(d => ({
            ...d,
            alreadyAssigned: assignedDriverIds.has(d._id.toString()),
        }));

        res.json(mappedDrivers);
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
        const { date } = req.query;
        const assignedMunshiIds = new Set();
        const assignedDriverIds = new Set();

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            const Logistics = require('../logistics/logistics.model');
            const activeAssignments = await Logistics.find({
                scheduledDate: { $gte: startOfDay, $lt: endOfDay },
                assignmentStatus: { $ne: 'CANCELLED' }
            }).select('munshiId driverId pickupDriverId').lean();

            activeAssignments.forEach(a => {
                if (a.munshiId) assignedMunshiIds.add(a.munshiId.toString());
                if (a.driverId) assignedDriverIds.add(a.driverId.toString());
                if (a.pickupDriverId) assignedDriverIds.add(a.pickupDriverId.toString());
            });
        }

        // Run all queries in parallel for best performance
        const [companies, agents, generations, selectors, brands, munshis, eicherDrivers, pickupDrivers, locations] = await Promise.all([
            Company.find({ isActive: true }).select('_id companyName legalName headquarters').lean(),
            Agent.find({ isActive: true }).select('_id agentName mobileNo location').lean(),
            Generation.find({ isActive: true }).select('_id name description').lean(),
            User.find({ role: 'Field Selector', isActive: true }).select('_id firstName lastName mobileNo bikeNumber').lean(),
            Brand.find({ isActive: true }).select('_id brandName companyId').populate('companyId', 'companyName').lean(),
            User.find({ role: { $regex: /munshi/i }, isActive: true }).select('_id firstName lastName mobileNo').lean(),
            User.find({ role: 'driver eicher', isActive: true }).select('_id firstName lastName mobileNo vehicleId').populate('vehicleId', 'vehicleNumber vehicleType').lean(),
            User.find({ role: 'driver pickup', isActive: true }).select('_id firstName lastName mobileNo vehicleId').populate('vehicleId', 'vehicleNumber vehicleType').lean(),
            Enquiry.distinct('location'),
        ]);

        const mappedMunshis = munshis.map(m => ({
            ...m,
            alreadyAssigned: assignedMunshiIds.has(m._id.toString()),
        }));

        const mappedEicherDrivers = eicherDrivers.map(d => ({
            ...d,
            alreadyAssigned: assignedDriverIds.has(d._id.toString()),
        }));

        const mappedPickupDrivers = pickupDrivers.map(d => ({
            ...d,
            alreadyAssigned: assignedDriverIds.has(d._id.toString()),
        }));

        res.status(200).json({
            companies,
            agents,
            generations,
            selectors,
            brands,
            munshis: mappedMunshis,
            eicherDrivers: mappedEicherDrivers,
            pickupDrivers: mappedPickupDrivers,
            locations: locations.filter(Boolean),
        });
    } catch (error) {
        console.error('Error fetching form dropdowns:', error);
        res.status(500).json({ message: 'Server error while fetching form dropdowns' });
    }
};

// --- App Configuration ---
// @desc    Get dynamic app configurations (e.g., screenshot restrictions)
// @route   GET /api/master-data/app-config
// @access  Protected (All authenticated users)
const getAppConfig = async (req, res) => {
    try {
        // This can be moved to a DB collection later if frequent changes are needed.
        // For now, it provides the required dynamic enable/disable and role/screen-based control.
        const appConfig = {
            screenshotRestriction: {
                enabled: true,
                restrictedRoles: [
                    'Munshi', 
                    'driver eicher', 
                    'driver pickup', 
                    'Operational Manager'
                ],
                restrictedScreens: [
                    'ALL' // or specific screens like ['field-visit', 'packing-summary']
                ]
            }
        };
        res.status(200).json(appConfig);
    } catch (error) {
        console.error('Error fetching app config:', error);
        res.status(500).json({ message: 'Server error while fetching app config' });
    }
};

// @desc    Get live fuel prices (diesel and petrol) for a given state or city
// @route   GET /api/master-data/fuel-price
// @access  Protected
const getFuelPrice = async (req, res) => {
    try {
        const location = req.query.location || 'Maharashtra';
        const locationType = req.query.location_type || 'state';
        
        // Allowed location types: state or city
        if (!['state', 'city'].includes(locationType)) {
            return res.status(400).json({ message: 'location_type must be either state or city' });
        }

        const apiKey = process.env.FUEL_API_KEY;

        // Fallback to mock pricing if API key is not configured
        if (!apiKey) {
            return res.status(200).json(getMockPrices(location, locationType));
        }

        console.log(`Fetching live fuel prices from IndianAPI for ${location} (${locationType})`);
        
        const [dieselRes, petrolRes] = await Promise.all([
            fetch(`https://fuel.indianapi.in/live_fuel_price?fuel_type=diesel&location_type=${locationType}`, {
                headers: { 'x-api-key': apiKey }
            }),
            fetch(`https://fuel.indianapi.in/live_fuel_price?fuel_type=petrol&location_type=${locationType}`, {
                headers: { 'x-api-key': apiKey }
            })
        ]);

        if (dieselRes.status !== 200 || petrolRes.status !== 200) {
            console.warn(`Fuel Price API returned non-200. Diesel: ${dieselRes.status}, Petrol: ${petrolRes.status}. Using mock fallback.`);
            return res.status(200).json(getMockPrices(location, locationType));
        }

        const dieselData = await dieselRes.json();
        const petrolData = await petrolRes.json();

        if (!Array.isArray(dieselData) || !Array.isArray(petrolData)) {
            console.warn('Fuel Price API did not return arrays. Using mock fallback.');
            return res.status(200).json(getMockPrices(location, locationType));
        }

        // Case-insensitive search for location in city, state, or name fields
        const matchLocation = (item) => {
            const locName = location.toLowerCase();
            return (item.city && item.city.toLowerCase() === locName) ||
                   (item.state && item.state.toLowerCase() === locName) ||
                   (item.name && item.name.toLowerCase() === locName);
        };

        const dieselRecord = dieselData.find(matchLocation);
        const petrolRecord = petrolData.find(matchLocation);

        if (!dieselRecord && !petrolRecord) {
            return res.status(404).json({ message: `Fuel price data not found for location: ${location}` });
        }

        res.status(200).json({
            location,
            locationType,
            diesel: dieselRecord ? {
                price: parseFloat(dieselRecord.price),
                change: parseFloat(dieselRecord.change || 0)
            } : null,
            petrol: petrolRecord ? {
                price: parseFloat(petrolRecord.price),
                change: parseFloat(petrolRecord.change || 0)
            } : null,
            source: 'live'
        });
    } catch (error) {
        console.error('Error fetching live fuel prices:', error);
        const location = req.query.location || 'Maharashtra';
        const locationType = req.query.location_type || 'state';
        res.status(200).json(getMockPrices(location, locationType));
    }
};

const getMockPrices = (location, locationType) => {
    const isMaharashtra = location.toLowerCase() === 'maharashtra';
    return {
        location,
        locationType,
        diesel: {
            price: isMaharashtra ? 92.50 : 90.00,
            change: 0.00
        },
        petrol: {
            price: isMaharashtra ? 104.20 : 101.50,
            change: 0.00
        },
        source: 'mock_fallback'
    };
};

module.exports = {
    createCompany,
    getCompanies,
    updateCompany,
    deleteCompany,
    toggleCompanyStatus,
    createBrand,
    getBrands,
    updateBrand,
    deleteBrand,
    createAgent,
    getAgents,
    updateAgent,
    deleteAgent,
    toggleAgentStatus,
    createVehicle,
    getVehicles,
    updateVehicle,
    deleteVehicle,
    toggleVehicleStatus,
    createGeneration,
    getGenerations,
    updateGeneration,
    deleteGeneration,
    toggleGenerationStatus,
    getFormDropdowns,
    getDrivers,
    getAppConfig,
    getFuelPrice,
};
