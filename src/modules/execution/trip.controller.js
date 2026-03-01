const Trip = require('./trip.model');
const Logistics = require('../logistics/logistics.model');
const Enquiry = require('../enquiries/enquiry.model');
const PdfService = require('../../services/pdf.service');

// @desc    Create new trip
// @route   POST /api/execution/trips
// @access  Protected (Admin, Driver (Eicher), Driver (Pickup))
const createTrip = async (req, res) => {
    try {
        const {
            assignmentId,
            isBackupTrip,
            parentTripId,
            teamMembers,
            startRoute,
            midRoute,
            destination,
            totalKm,
            tollExpense,
            farmerBoxBreakdown,
            isLocked,
            weightSlipUrl: bodyWeightSlip,
            dieselSlipUrl: bodyDieselSlip,
            unloadSlipUrl: bodyUnloadSlip
        } = req.body;

        // const weightSlipUrl = req.files && req.files.weightSlipUrl ? `/uploads/${req.files.weightSlipUrl[0].filename}` : null;
        // const dieselSlipUrl = req.files && req.files.dieselSlipUrl ? `/uploads/${req.files.dieselSlipUrl[0].filename}` : null;
        // const unloadSlipUrl = req.files && req.files.unloadSlipUrl ? `/uploads/${req.files.unloadSlipUrl[0].filename}` : null;
        const weightSlipUrl = bodyWeightSlip || (req.files?.weightSlipUrl ? `/uploads/${req.files.weightSlipUrl[0].filename}` : null);
        const dieselSlipUrl = bodyDieselSlip || (req.files?.dieselSlipUrl ? `/uploads/${req.files.dieselSlipUrl[0].filename}` : null);
        const unloadSlipUrl = bodyUnloadSlip || (req.files?.unloadSlipUrl ? `/uploads/${req.files.unloadSlipUrl[0].filename}` : null);
        // Verify the assignmentId exists in Logistics collection
        const logistics = await Logistics.findById(assignmentId);
        if (!logistics) {
            return res.status(404).json({ message: 'Logistics assignment not found with the provided ID' });
        }

        // Set driverId to logged-in user
        const driverId = req.user._id;

        // Save the trip document
        const trip = await Trip.create({
            driverId,
            assignmentId,
            isBackupTrip,
            parentTripId,
            teamMembers,
            startRoute,
            midRoute,
            destination,
            totalKm,
            tollExpense,
            farmerBoxBreakdown,
            weightSlipUrl,
            dieselSlipUrl,
            unloadSlipUrl,
            isLocked
        });

        // CRITICAL TRIGGER: Update the original Enquiry document using the enquiryId from Logistics assignment
        const enquiry = await Enquiry.findById(logistics.enquiryId);
        if (enquiry) {
            enquiry.status = 'COMPLETED';
            await enquiry.save();
        }

        const reportUrl = await PdfService.generateTripReport(trip);
        trip.systemReportUrl = reportUrl;
        await trip.save();

        res.status(201).json(trip);
    } catch (error) {
        console.error('Error creating trip:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(400).json({ message: error.message || 'Error creating trip record' });
    }
};

// @desc    Get all trips
// @route   GET /api/execution/trips
// @access  Protected (Admin, Operational Manager, Driver (Eicher), Driver (Pickup))
const getTrips = async (req, res) => {
    try {
        const trips = await Trip.find()
            .populate('assignmentId')
            .populate('driverId', 'firstName lastName mobileNo');

        res.status(200).json(trips);
    } catch (error) {
        console.error('Error fetching trips:', error);
        res.status(500).json({ message: 'Server error while fetching trip records' });
    }
};

module.exports = {
    createTrip,
    getTrips
};
