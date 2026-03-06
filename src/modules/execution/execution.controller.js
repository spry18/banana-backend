const Logistics = require('../logistics/logistics.model');
const Trip = require('./trip.model');
const Packing = require('./packing.model');
const { logSystemAction } = require('../../utils/auditLogger');

// @desc    Get a single execution record (Assignment + merged Trip + Packing data)
// @route   GET /api/execution/:id
// @access  Protected (Admin, Operational Manager)
const getExecutionById = async (req, res) => {
    try {
        // 1. Fetch the base logistics assignment
        const assignment = await Logistics.findById(req.params.id)
            .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation plantCount')
            .populate('companyId', 'companyName legalName')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .populate('omId', 'firstName lastName');

        if (!assignment) {
            return res.status(404).json({ message: 'Logistics assignment not found' });
        }

        // 2. Fetch the associated Trip report (Driver's submission)
        const trip = await Trip.findOne({ assignmentId: assignment._id })
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('reviewedBy', 'firstName lastName')
            .lean();

        // 3. Fetch the associated Packing report (Munshi's submission)
        const packing = await Packing.findOne({ assignmentId: assignment._id })
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('brandId', 'brandName')
            .lean();

        // 4. Merge into unified response
        res.status(200).json({
            assignment: assignment.toObject(),
            trip: trip || null,      // null if Driver hasn't submitted yet
            packing: packing || null, // null if Munshi hasn't submitted yet
            executionStatus: {
                packingSubmitted: !!packing,
                tripSubmitted: !!trip,
                reviewStatus: trip?.reviewStatus || 'PENDING',
            },
        });
    } catch (error) {
        console.error('Error fetching execution by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching execution details' });
    }
};

// @desc    OM reviews (Approves or Rejects) a completed trip report
// @route   PATCH /api/execution/:id/review
// @access  Protected (Admin, Operational Manager)
const reviewExecution = async (req, res) => {
    try {
        const { reviewStatus, reviewNote } = req.body;

        if (!reviewStatus) {
            return res.status(400).json({ message: 'reviewStatus is required (APPROVED or REJECTED)' });
        }

        if (!['APPROVED', 'REJECTED'].includes(reviewStatus)) {
            return res.status(400).json({ message: 'reviewStatus must be either APPROVED or REJECTED' });
        }

        if (reviewStatus === 'REJECTED' && !reviewNote) {
            return res.status(400).json({ message: 'reviewNote is required when rejecting a report' });
        }

        // Find the Trip linked to this assignment (req.params.id = assignmentId)
        const trip = await Trip.findOne({ assignmentId: req.params.id });
        if (!trip) {
            return res.status(404).json({ message: 'No trip report found for this assignment. The Driver must submit their report first.' });
        }

        if (trip.reviewStatus !== 'PENDING') {
            return res.status(400).json({
                message: `This report has already been reviewed. Current status: '${trip.reviewStatus}'`,
            });
        }

        const before = { reviewStatus: trip.reviewStatus, reviewNote: trip.reviewNote };

        trip.reviewStatus = reviewStatus;
        trip.reviewNote = reviewNote || '';
        trip.reviewedBy = req.user._id;
        await trip.save();

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Trip',
            trip._id,
            `OM ${reviewStatus} trip report for assignment ${req.params.id}`,
            before,
            { reviewStatus, reviewNote }
        );

        res.status(200).json({
            message: `Trip report ${reviewStatus} successfully`,
            trip,
        });
    } catch (error) {
        console.error('Error reviewing execution:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while reviewing execution' });
    }
};

module.exports = {
    getExecutionById,
    reviewExecution,
};
