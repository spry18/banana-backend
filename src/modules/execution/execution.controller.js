const Logistics = require('../logistics/logistics.model');
const Trip = require('./trip.model');
const Packing = require('./packing.model');
const { logSystemAction } = require('../../utils/auditLogger');

// @desc    Get a single execution record (Assignment + merged Trip + Packing data)
// @route   GET /api/execution/:id
// @access  Protected (Admin, Operational Manager)
const getExecutionById = async (req, res) => {
    try {
        const assignmentId = req.params.id.trim();
        // 1. Fetch the base logistics assignment
        const assignment = await Logistics.findById(assignmentId)
            .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation plantCount')
            .populate('companyId', 'companyName legalName')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .populate('omId', 'firstName lastName')
            .populate('pickupDriverId', 'firstName lastName mobileNo') 
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .populate('omId', 'firstName lastName');

        if (!assignment) {
            return res.status(404).json({ message: 'Logistics assignment not found' });
        }

        // 2. Fetch the associated Trip reports (Both Eicher and Pickup trips)
        const trips = await Trip.find({ assignmentId: assignment._id })
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('reviewedBy', 'firstName lastName')
            .lean();

        const eicherTrip = trips.find(t => t.driverType === 'Eicher') || null;
        const pickupTrip = trips.find(t => t.driverType === 'Pickup') || null;

        // 3. Fetch the associated Packing report (Munshi's submission)
        const packing = await Packing.findOne({ assignmentId: assignment._id })
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate('brandId', 'brandName')
            .lean();

        // 4. Merge into unified response
        res.status(200).json({
            assignment: assignment.toObject(),
            trip: eicherTrip,         // kept for backward compatibility if FE relies on this name
            pickupTrip: pickupTrip,  // added the pickup trip explicitly
            trips: trips,            // you can optionally send the entire array
            packing: packing || null, // null if Munshi hasn't submitted yet
            executionStatus: {
                packingSubmitted: !!packing,
                tripSubmitted: trips.length > 0,
                reviewStatus: trips[0]?.reviewStatus || 'PENDING',
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
        const assignmentId = req.params.id.trim();
        const { reviewStatus, reviewNote, rejectedComponents } = req.body;

        if (!reviewStatus) {
            return res.status(400).json({ message: 'reviewStatus is required (APPROVED or REJECTED)' });
        }

        if (!['APPROVED', 'REJECTED'].includes(reviewStatus)) {
            return res.status(400).json({ message: 'reviewStatus must be either APPROVED or REJECTED' });
        }

        if (reviewStatus === 'REJECTED' && !reviewNote) {
            return res.status(400).json({ message: 'reviewNote is required when rejecting a report' });
        }

        // --- 1. HANDLING APPROVAL (Updates everything linked to assignment to APPROVED) ---
        if (reviewStatus === 'APPROVED') {
            // Update all trips (Eicher & Pickup) associated with this assignment
            await Trip.updateMany(
                { assignmentId },
                { 
                    reviewStatus: 'APPROVED', 
                    reviewNote: reviewNote || '', 
                    reviewedBy: req.user._id 
                }
            );

            // Update packing report status to approved/completed if your model tracks it
            await Packing.updateOne(
                { assignmentId },
                { status: 'APPROVED' } // Adjust key matching Munshi's schema (e.g., 'APPROVED' or 'COMPLETED')
            );

            // Also update the main Logistics assignment status to COMPLETED if necessary
            await Logistics.findByIdAndUpdate(assignmentId, { assignmentStatus: 'COMPLETED' });

            await logSystemAction(
                req.user._id,
                'UPDATE',
                'Execution',
                assignmentId,
                `OM APPROVED execution report for assignment ${assignmentId}`,
                {},
                { reviewStatus }
            );

            return res.status(200).json({ message: 'Execution report approved successfully.' });
        }

        // --- 2. HANDLING REJECTION (Targeted Component Rollbacks) ---
        if (reviewStatus === 'REJECTED') {
            if (!rejectedComponents) {
                return res.status(400).json({ 
                    message: 'rejectedComponents object is required when status is REJECTED.' 
                });
            }

            const { packing, trip, pickupTrip } = rejectedComponents;
            let targetLogs = [];

            // Case A: Reject Munshi's packing summary
            if (packing === true) {
                const packingDoc = await Packing.findOneAndUpdate(
                    { assignmentId },
                    { status: 'REJECTED', reviewNote: reviewNote }, // Unlocks editing for Munshi app
                    { new: true }
                );
                if (packingDoc) targetLogs.push('Packing Summary');
            }

            // Case B: Reject Eicher Driver's trip logs
            if (trip === true) {
                const eicherDoc = await Trip.findOneAndUpdate(
                    { assignmentId, driverType: 'Eicher' },
                    { reviewStatus: 'REJECTED', reviewNote: reviewNote, reviewedBy: req.user._id }, // Unlocks Eicher App
                    { new: true }
                );
                if (eicherDoc) targetLogs.push('Eicher Trip');
            }

            // Case C: Reject Pickup Driver's trip logs
            if (pickupTrip === true) {
                const pickupDoc = await Trip.findOneAndUpdate(
                    { assignmentId, driverType: 'Pickup' },
                    { reviewStatus: 'REJECTED', reviewNote: reviewNote, reviewedBy: req.user._id }, // Unlocks Pickup App
                    { new: true }
                );
                if (pickupDoc) targetLogs.push('Pickup Trip');
            }

            // Fallback safety check if they sent all booleans as false
            if (targetLogs.length === 0) {
                return res.status(400).json({ 
                    message: 'At least one component (packing, trip, or pickupTrip) must be set to true for rejection.' 
                });
            }

            // Update main assignment status back to a processing state if needed
            await Logistics.findByIdAndUpdate(assignmentId, { assignmentStatus: 'REJECTED' });

            await logSystemAction(
                req.user._id,
                'UPDATE',
                'Execution',
                assignmentId,
                `OM REJECTED components (${targetLogs.join(', ')}) for assignment ${assignmentId}`,
                { rejectedComponents },
                { reviewStatus, reviewNote }
            );

            return res.status(200).json({
                message: `Rejected components (${targetLogs.join(', ')}) updated successfully.`,
                rejectedComponents
            });
        }

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
