const Packing = require('./packing.model');
const Logistics = require('../logistics/logistics.model');
const NotificationService = require('../../services/notification.service');
const { createNotification } = require('../../utils/notificationHelper');
const { broadcastToRole } = require('../../utils/broadcastToRole');

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
            box5Kg = 0,
            box13Kg = 0,
            box13_5Kg = 0,
            box14Kg = 0,
            box16Kg = 0,
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
        const calculatedTotalBoxes = Number(box4H) + Number(box5H) + Number(box6H) + Number(box8H) + Number(boxCL) + Number(box5Kg) + Number(box13Kg) + Number(box13_5Kg) + Number(box14Kg) + Number(box16Kg);
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
            box5Kg,
            box13Kg,
            box13_5Kg,
            box14Kg,
            box16Kg,
            totalBoxes,
            wastageKg,
            wastageReason
        });

        // Flow 1 — WhatsApp: notify farmer with packing summary (console stub)
        if (logistics.enquiryId) {
            NotificationService.sendPackingSummary(logistics.enquiryId.farmerMobile, logistics.enquiryId.farmerFirstName, totalBoxes, wastageKg);
        }

        // Flow 2 — In-app: notify all Operational Managers and Admins that packing report needs review
        const enquiryRef = logistics.enquiryId?.enquiryId || 'N/A';
        const munshiName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
        await broadcastToRole(
            ['Operational Manager', 'Admin'],
            'PACKING_SUBMITTED',
            `Munshi ${munshiName} submitted a packing report for enquiry ${enquiryRef}. Awaiting your review.`,
            packing._id,
            'Packing'
        );

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
