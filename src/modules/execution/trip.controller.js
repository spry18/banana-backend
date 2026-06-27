const Trip = require('./trip.model');
const Logistics = require('../logistics/logistics.model');
const PdfService = require('../../services/pdf.service');

// @desc    Create new trip
// @route   POST /api/execution/trips
// @access  Protected (Admin, driver eicher, driver pickup)
const createTrip = async (req, res) => {
    try {
        const {
            assignmentId,
            driverType,
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

        if (totalKm === undefined || totalKm === '') {
            return res.status(400).json({ message: 'totalKm is required' });
        }
        const kmNum = Number(totalKm);
        if (Number.isNaN(kmNum) || kmNum > 999 || kmNum < 0) {
            return res.status(400).json({ message: 'totalKm must be a valid number and maximum 3 digits (0 - 999)' });
        }

        if (tollExpense !== undefined && tollExpense !== '') {
            const tollNum = Number(tollExpense);
            if (Number.isNaN(tollNum) || tollNum > 999 || tollNum < 0) {
                return res.status(400).json({ message: 'tollExpense must be a valid number and maximum 3 digits (0 - 999)' });
            }
        }

        // const weightSlipUrl = req.files && req.files.weightSlipUrl ? req.files.weightSlipUrl[0].location : null;
        // const dieselSlipUrl = req.files && req.files.dieselSlipUrl ? req.files.dieselSlipUrl[0].location : null;
        // const unloadSlipUrl = req.files && req.files.unloadSlipUrl ? req.files.unloadSlipUrl[0].location : null;
        const weightSlipUrl = bodyWeightSlip || (req.files?.weightSlipUrl ? req.files.weightSlipUrl[0].location : null);
        const dieselSlipUrl = bodyDieselSlip || (req.files?.dieselSlipUrl ? req.files.dieselSlipUrl[0].location : null);
        const unloadSlipUrl = bodyUnloadSlip || (req.files?.unloadSlipUrl ? req.files.unloadSlipUrl[0].location : null);
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
            driverType,
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

        try {
            const reportUrl = await PdfService.generateTripReport(trip);
            trip.systemReportUrl = reportUrl;
            await trip.save();
        } catch (pdfError) {
            console.error('Failed to generate or upload system PDF report:', pdfError.message);
        }

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
// @access  Protected (Admin, Operational Manager, driver eicher, driver pickup)
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
