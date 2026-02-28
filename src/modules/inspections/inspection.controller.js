const Inspection = require('./inspection.model');
const Enquiry = require('../enquiries/enquiry.model');
const { logSystemAction } = require('../../utils/auditLogger');

// @desc    Create new inspection
// @route   POST /api/inspections
// @access  Protected (Admin, Field Selector)
const createInspection = async (req, res) => {
    try {
        const {
            enquiryId,
            harvestingStage,
            volumeBoxRange,
            recoveryPercent,
            packingSize,
            chelling,
            spikling,
            pulpe,
            phreeps,
            harvestingTime,
            generalNotes,
            isThroughPartner,
            partnerName,
            decision
        } = req.body;

        const photos = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

        // Verify the enquiryId exists
        const enquiry = await Enquiry.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found with the provided ID' });
        }

        // Set selectorId to logged-in user
        const selectorId = req.user._id;

        // Save the inspection document
        const inspection = await Inspection.create({
            enquiryId,
            selectorId,
            harvestingStage,
            volumeBoxRange,
            recoveryPercent,
            packingSize,
            chelling,
            spikling,
            pulpe,
            phreeps,
            harvestingTime,
            generalNotes,
            isThroughPartner,
            partnerName,
            photos,
            decision
        });

        // CRITICAL TRIGGER: Update the original Enquiry document
        if (decision === 'APPROVED') {
            enquiry.status = 'SELECTED';
        } else if (decision === 'REJECTED') {
            enquiry.status = 'REJECTED';
        }
        await enquiry.save();

        await logSystemAction(req.user._id, decision === 'APPROVED' ? 'APPROVE' : 'REJECT', 'Inspections', inspection._id, `Inspection ${decision} for Enquiry ${enquiryId}`);

        res.status(201).json(inspection);
    } catch (error) {
        console.error('Error creating inspection:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(400).json({ message: error.message || 'Error creating inspection' });
    }
};

// @desc    Get inspections
// @route   GET /api/inspections
// @access  Protected (Admin, Field Owner, Field Selector, Operational Manager)
const getInspections = async (req, res) => {
    try {
        const inspections = await Inspection.find()
            .populate('enquiryId')
            .populate('selectorId', 'firstName lastName mobileNo');

        res.status(200).json(inspections);
    } catch (error) {
        console.error('Error fetching inspections:', error);
        res.status(500).json({ message: 'Server error while fetching inspections' });
    }
};

const getInspectionById = async (req, res) => {
    try {
        const inspection = await Inspection.findById(req.params.id)
            .populate('enquiryId')
            .populate('selectorId', 'firstName lastName mobileNo');

        if (!inspection) {
            return res.status(404).json({ message: 'Inspection not found' });
        }
        res.status(200).json(inspection);
    } catch (error) {
        console.error('Error fetching inspection by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching inspection' });
    }
};

module.exports = {
    createInspection,
    getInspections,
    getInspectionById,
};
