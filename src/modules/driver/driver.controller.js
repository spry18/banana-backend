const Trip = require('../execution/trip.model');
const Logistics = require('../logistics/logistics.model');
const Enquiry = require('../enquiries/enquiry.model');
const DieselAdvance = require('../diesel-advance/dieselAdvance.model');
const PdfService = require('../../services/pdf.service');

// ============================================================
//  PHASE 2: Dashboard & History
// ============================================================

// @desc    Get Driver dashboard — active assignments where this user is driverId OR pickupDriverId
// @route   GET /api/driver/dashboard
// @access  Protected (Driver, Admin, OM)
const getDriverDashboard = async (req, res) => {
    try {
        const userId = req.user._id;

        const activeAssignments = await Logistics.find({
            $or: [
                { driverId: userId },
                { pickupDriverId: userId },
            ],
            assignmentStatus: { $in: ['PENDING', 'IN_PROGRESS'] },
        })
            .sort({ createdAt: -1 })
            .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation plantCount')
            .populate('companyId', 'companyName')
            .populate('munshiId', 'firstName lastName mobileNo')
            .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
            .populate({ path: 'pickupDriverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .lean();

        // KPI counts scoped to this driver
        const allMyAssignments = { $or: [{ driverId: userId }, { pickupDriverId: userId }] };
        const [totalPending, totalCompleted, totalCancelled] = await Promise.all([
            Logistics.countDocuments({ ...allMyAssignments, assignmentStatus: { $in: ['PENDING', 'IN_PROGRESS'] } }),
            Logistics.countDocuments({ ...allMyAssignments, assignmentStatus: 'COMPLETED' }),
            Logistics.countDocuments({ ...allMyAssignments, assignmentStatus: 'CANCELLED' }),
        ]);

        res.status(200).json({
            kpis: {
                active: totalPending,
                completed: totalCompleted,
                cancelled: totalCancelled,
                total: totalPending + totalCompleted + totalCancelled,
            },
            activeAssignments,
        });
    } catch (error) {
        console.error('Error fetching Driver dashboard:', error);
        res.status(500).json({ message: 'Server error while fetching Driver dashboard' });
    }
};

// @desc    Get paginated trip history for the logged-in driver
// @route   GET /api/driver/history
// @access  Protected (Driver, Admin, OM)
// @query   ?page=1  ?limit=20
const getDriverHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { driverId: userId };

        const [trips, total] = await Promise.all([
            Trip.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate({
                    path: 'assignmentId',
                    populate: [
                        { path: 'enquiryId', select: 'enquiryId farmerFirstName farmerLastName location' },
                        { path: 'companyId', select: 'companyName' },
                        { path: 'munshiId', select: 'firstName lastName' },
                    ],
                })
                .populate('reviewedBy', 'firstName lastName')
                .lean(),
            Trip.countDocuments(query),
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: trips,
        });
    } catch (error) {
        console.error('Error fetching Driver history:', error);
        res.status(500).json({ message: 'Server error while fetching Driver history' });
    }
};

// ============================================================
//  PHASE 3: Flexible Trip Submission & Reports
// ============================================================

// @desc    Submit a trip report (flexible for Eicher or Pickup)
// @route   POST /api/driver/trips/:assignmentId
// @access  Protected (Driver, Admin, OM)
const submitTripReport = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const userId = req.user._id;

        // Verify assignment exists and the driver is either driverId or pickupDriverId
        const assignment = await Logistics.findById(assignmentId).populate('enquiryId');
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const isDrv = assignment.driverId.toString() === userId.toString();
        const isPkp = assignment.pickupDriverId && assignment.pickupDriverId.toString() === userId.toString();
        if (!isDrv && !isPkp && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'You are not assigned to this logistics record' });
        }

        // Check for duplicate trip submission for this assignment by this driver
        const existingTrip = await Trip.findOne({ assignmentId, driverId: userId });
        if (existingTrip) {
            return res.status(400).json({ message: 'A trip report has already been submitted for this assignment' });
        }

        // Auto-detect driver type from user role
        const roleNorm = (req.user.role || '').toLowerCase();
        const driverType = roleNorm.includes('pickup') ? 'Pickup' : 'Eicher';

        // Parse body
        const {
            isBackupTrip,
            parentTripId,
            teamMembers,
            startRoute,
            midRoute,
            destination,
            routes,       // JSON string or array for Pickup multi-route
            totalKm,
            tollExpense,
            isHault,
            isLineCancel,
            farmerBoxBreakdown,  // JSON string or array
            isLocked,
        } = req.body;

        // Parse JSON fields that may come as strings from form-data
        let parsedRoutes = [];
        if (routes) {
            parsedRoutes = typeof routes === 'string' ? JSON.parse(routes) : routes;
        }

        let parsedBoxBreakdown = [];
        if (farmerBoxBreakdown) {
            parsedBoxBreakdown = typeof farmerBoxBreakdown === 'string' ? JSON.parse(farmerBoxBreakdown) : farmerBoxBreakdown;
        }

        // Handle file uploads (flexible — Eicher and Pickup fields coexist)
        const files = req.files || {};
        const weightSlipUrl = files.weightSlipPhoto?.[0] ? `/uploads/${files.weightSlipPhoto[0].filename}` : null;
        const dieselSlipUrl = files.dieselSlipPhoto?.[0] ? `/uploads/${files.dieselSlipPhoto[0].filename}` : null;
        const unloadSlipUrl = files.unloadSlipPhoto?.[0] ? `/uploads/${files.unloadSlipPhoto[0].filename}` : null;
        const endKmPhotoUrl = files.endKmPhoto?.[0] ? `/uploads/${files.endKmPhoto[0].filename}` : null;
        const uploadSlipUrl = files.uploadSlipPhoto?.[0] ? `/uploads/${files.uploadSlipPhoto[0].filename}` : null;
        const meterPhotoUrl = files.meterPhoto?.[0] ? `/uploads/${files.meterPhoto[0].filename}` : null;

        const trip = await Trip.create({
            driverId: userId,
            assignmentId,
            driverType,
            isBackupTrip: isBackupTrip === 'true' || isBackupTrip === true,
            parentTripId: parentTripId || null,
            teamMembers: teamMembers || '',
            // Eicher flat route
            startRoute: startRoute || '',
            midRoute: midRoute || '',
            destination: destination || '',
            // Pickup multi-route
            routes: parsedRoutes,
            totalKm: Number(totalKm),
            tollExpense: Number(tollExpense) || 0,
            isHault: isHault === 'true' || isHault === true,
            isLineCancel: isLineCancel === 'true' || isLineCancel === true,
            farmerBoxBreakdown: parsedBoxBreakdown,
            // Eicher files
            weightSlipUrl,
            dieselSlipUrl,
            unloadSlipUrl,
            // Pickup files
            uploadSlipUrl,
            meterPhotoUrl,
            // Shared
            endKmPhotoUrl,
            isLocked: isLocked !== 'false' && isLocked !== false,
        });

        // Update Enquiry status to COMPLETED
        if (assignment.enquiryId) {
            const enquiryDoc = assignment.enquiryId._id || assignment.enquiryId;
            await Enquiry.findByIdAndUpdate(enquiryDoc, { status: 'COMPLETED' });
        }

        // Generate system report PDF
        try {
            const reportUrl = await PdfService.generateTripReport(trip);
            trip.systemReportUrl = reportUrl;
            await trip.save();
        } catch (pdfErr) {
            console.error('PDF generation failed (non-blocking):', pdfErr.message);
        }

        res.status(201).json(trip);
    } catch (error) {
        console.error('Error submitting trip report:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: error.message || 'Server error while submitting trip report' });
    }
};

// @desc    Get Driver monthly reports & earnings
// @route   GET /api/driver/reports
// @access  Protected (Driver, Admin, OM)
// @query   ?month=3&year=2026
const getDriverReports = async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();
        const month = Number(req.query.month) || (now.getMonth() + 1);
        const year = Number(req.query.year) || now.getFullYear();

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        // All trips for this driver in the month
        const trips = await Trip.find({
            driverId: userId,
            createdAt: { $gte: startDate, $lt: endDate },
        })
            .populate({
                path: 'assignmentId',
                populate: [
                    { path: 'enquiryId', select: 'enquiryId farmerFirstName farmerLastName location' },
                    { path: 'companyId', select: 'companyName' },
                ],
            })
            .lean();

        // Diesel advances for this driver in the month
        const advances = await DieselAdvance.find({
            driverId: userId,
            createdAt: { $gte: startDate, $lt: endDate },
        }).lean();

        // Aggregate
        let totalKm = 0;
        let totalToll = 0;
        let totalHaults = 0;
        let totalLineCancels = 0;
        const dailyLog = {};

        trips.forEach(t => {
            totalKm += t.totalKm || 0;
            totalToll += t.tollExpense || 0;
            if (t.isHault) totalHaults++;
            if (t.isLineCancel) totalLineCancels++;

            const dayKey = new Date(t.createdAt).toISOString().slice(0, 10);
            if (!dailyLog[dayKey]) {
                dailyLog[dayKey] = { date: dayKey, trips: [], dayKm: 0, dayToll: 0 };
            }
            dailyLog[dayKey].trips.push({
                tripId: t._id,
                driverType: t.driverType,
                enquiryRef: t.assignmentId?.enquiryId?.enquiryId || 'N/A',
                farmer: t.assignmentId?.enquiryId
                    ? `${t.assignmentId.enquiryId.farmerFirstName} ${t.assignmentId.enquiryId.farmerLastName}`
                    : 'N/A',
                totalKm: t.totalKm,
                tollExpense: t.tollExpense,
                reviewStatus: t.reviewStatus,
            });
            dailyLog[dayKey].dayKm += t.totalKm || 0;
            dailyLog[dayKey].dayToll += t.tollExpense || 0;
        });

        const totalFuelAdvance = advances.reduce((sum, a) => sum + (a.amount || 0), 0);

        const dailyTripLog = Object.values(dailyLog).sort((a, b) => b.date.localeCompare(a.date));

        res.status(200).json({
            month,
            year,
            summary: {
                totalTrips: trips.length,
                totalKm,
                totalToll,
                totalFuelAdvance,
                totalHaults,
                totalLineCancels,
            },
            dailyTripLog,
        });
    } catch (error) {
        console.error('Error fetching Driver reports:', error);
        res.status(500).json({ message: 'Server error while fetching Driver reports' });
    }
};

module.exports = {
    getDriverDashboard,
    getDriverHistory,
    submitTripReport,
    getDriverReports,
};
