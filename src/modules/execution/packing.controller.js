const Packing = require('./packing.model');
const Logistics = require('../logistics/logistics.model');
const NotificationService = require('../../services/notification.service');

// @desc    Create new packing record
// @route   POST /api/execution/packing
// @access  Protected (Admin, Munshi)
const createPacking = async (req, res) => {
    try {
        const {
            assignmentId,
            lineNo,
            teamName,
            brandId,
            box4H = 0,
            box5H = 0,
            box6H = 0,
            box8H = 0,
            boxCL = 0,
            totalBoxes,
            wastageKg,
            wastageReason
        } = req.body;

        // Verify the assignmentId exists in Logistics collection
        const logistics = await Logistics.findById(assignmentId).populate('enquiryId');
        if (!logistics) {
            return res.status(404).json({ message: 'Logistics assignment not found with the provided ID' });
        }

        // Validate totalBoxes equals the sum of individual box counts
        const calculatedTotalBoxes = Number(box4H) + Number(box5H) + Number(box6H) + Number(box8H) + Number(boxCL);
        if (Number(totalBoxes) !== calculatedTotalBoxes) {
            return res.status(400).json({
                message: `totalBoxes (${totalBoxes}) does not match the sum of individual boxes (${calculatedTotalBoxes})`
            });
        }

        // Validate wastage reason if wastage exists
        if (Number(wastageKg) > 0 && !wastageReason) {
            return res.status(400).json({ message: 'wastageReason is required when wastageKg is greater than 0' });
        }

        // Set munshiId to logged-in user
        const munshiId = req.user._id;

        // Save the packing document
        const packing = await Packing.create({
            assignmentId,
            munshiId,
            lineNo,
            teamName,
            brandId,
            box4H,
            box5H,
            box6H,
            box8H,
            boxCL,
            totalBoxes,
            wastageKg,
            wastageReason
        });

        if (logistics.enquiryId) {
            NotificationService.sendPackingSummary(logistics.enquiryId.farmerMobile, logistics.enquiryId.farmerFirstName, totalBoxes, wastageKg);
        }

        res.status(201).json(packing);
    } catch (error) {
        console.error('Error creating packing record:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(400).json({ message: error.message || 'Error creating packing record' });
    }
};

// @desc    Get packing records
// @route   GET /api/execution/packing
// @access  Protected (Admin, Operational Manager, Munshi)
const getPackings = async (req, res) => {
    try {
        const packings = await Packing.find()
            .populate('assignmentId')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('brandId', 'brandName');

        res.status(200).json(packings);
    } catch (error) {
        console.error('Error fetching packing records:', error);
        res.status(500).json({ message: 'Server error while fetching packing records' });
    }
};

module.exports = {
    createPacking,
    getPackings
};
