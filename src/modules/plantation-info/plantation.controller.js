const FarmerPlantation = require('./plantation.model');

// @desc    Submit farmer plantation information (Public)
// @route   POST /api/plantation-info
// @access  Public
const createPlantation = async (req, res) => {
    try {
        const {
            farmerName,
            location,
            mobileNo,
            totalPlants,
            spacing,
            plantationDate,
            acres,
            variety,
        } = req.body;

        if (!farmerName || !location || !mobileNo || !totalPlants || !spacing || !plantationDate || !acres || !variety) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        const plantation = await FarmerPlantation.create({
            farmerName,
            location,
            mobileNo,
            totalPlants,
            spacing,
            plantationDate,
            acres,
            variety,
        });

        res.status(201).json({
            message: 'Plantation information submitted successfully.',
            plantation,
        });
    } catch (error) {
        console.error('Error in createPlantation:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        res.status(500).json({ message: 'Server error while submitting plantation information.' });
    }
};

// @desc    Get all plantation info submissions (Protected)
// @route   GET /api/plantation-info
// @access  Private (Admin, Field Owner)
const getPlantations = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = {};
        if (search) {
            query.$or = [
                { farmerName: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { mobileNo: { $regex: search, $options: 'i' } },
                { variety: { $regex: search, $options: 'i' } },
            ];
        }

        const total = await FarmerPlantation.countDocuments(query);
        const plantations = await FarmerPlantation.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            plantations,
        });
    } catch (error) {
        console.error('Error in getPlantations:', error);
        res.status(500).json({ message: 'Server error while fetching plantations.' });
    }
};

// @desc    Get single plantation info submission by ID (Protected)
// @route   GET /api/plantation-info/:id
// @access  Private (Admin, Field Owner)
const getPlantationById = async (req, res) => {
    try {
        const plantation = await FarmerPlantation.findById(req.params.id);
        if (!plantation) {
            return res.status(404).json({ message: 'Plantation record not found.' });
        }
        res.status(200).json({ plantation });
    } catch (error) {
        console.error('Error in getPlantationById:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }
        res.status(500).json({ message: 'Server error while fetching plantation details.' });
    }
};

// @desc    Update plantation info submission (Protected)
// @route   PUT /api/plantation-info/:id
// @access  Private (Admin, Field Owner)
const updatePlantation = async (req, res) => {
    try {
        const {
            farmerName,
            location,
            mobileNo,
            totalPlants,
            spacing,
            plantationDate,
            acres,
            variety,
        } = req.body;

        const plantation = await FarmerPlantation.findById(req.params.id);
        if (!plantation) {
            return res.status(404).json({ message: 'Plantation record not found.' });
        }

        if (farmerName !== undefined) plantation.farmerName = farmerName;
        if (location !== undefined) plantation.location = location;
        if (mobileNo !== undefined) plantation.mobileNo = mobileNo;
        if (totalPlants !== undefined) plantation.totalPlants = totalPlants;
        if (spacing !== undefined) plantation.spacing = spacing;
        if (plantationDate !== undefined) plantation.plantationDate = plantationDate;
        if (acres !== undefined) plantation.acres = acres;
        if (variety !== undefined) plantation.variety = variety;

        await plantation.save();

        res.status(200).json({
            message: 'Plantation record updated successfully.',
            plantation,
        });
    } catch (error) {
        console.error('Error in updatePlantation:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }
        res.status(500).json({ message: 'Server error while updating plantation details.' });
    }
};

// @desc    Delete plantation info submission (Protected)
// @route   DELETE /api/plantation-info/:id
// @access  Private (Admin only)
const deletePlantation = async (req, res) => {
    try {
        const plantation = await FarmerPlantation.findById(req.params.id);
        if (!plantation) {
            return res.status(404).json({ message: 'Plantation record not found.' });
        }

        await plantation.deleteOne();

        res.status(200).json({
            message: 'Plantation record deleted successfully.',
        });
    } catch (error) {
        console.error('Error in deletePlantation:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid ID format.' });
        }
        res.status(500).json({ message: 'Server error while deleting plantation record.' });
    }
};

module.exports = {
    createPlantation,
    getPlantations,
    getPlantationById,
    updatePlantation,
    deletePlantation,
};
