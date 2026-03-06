const Logistics = require('../logistics/logistics.model');
const Packing = require('../execution/packing.model');
const User = require('../users/user.model');
const Enquiry = require('../enquiries/enquiry.model');
const NotificationService = require('../../services/notification.service');

// ============================================================
//  PHASE 2: Dashboard & Pickup Driver
// ============================================================

// @desc    Get Munshi dashboard KPIs + active assignments
// @route   GET /api/munshi/dashboard
// @access  Protected (Munshi, Admin, Operational Manager)
const getMunshiDashboard = async (req, res) => {
    try {
        const munshiId = req.user._id;

        // KPIs scoped to logged-in Munshi
        const [
            pickupsCount,         // Assignments in PENDING or IN_PROGRESS
            completedCount,       // Assignments COMPLETED
            cancelledCount,       // Assignments CANCELLED
            activeAssignments,    // Active list for the UI
        ] = await Promise.all([
            Logistics.countDocuments({ munshiId, assignmentStatus: { $in: ['PENDING', 'IN_PROGRESS'] } }),
            Logistics.countDocuments({ munshiId, assignmentStatus: 'COMPLETED' }),
            Logistics.countDocuments({ munshiId, assignmentStatus: 'CANCELLED' }),
            Logistics.find({
                munshiId,
                assignmentStatus: { $in: ['PENDING', 'IN_PROGRESS'] },
            })
                .sort({ createdAt: -1 })
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation plantCount')
                .populate('companyId', 'companyName')
                .populate('driverId', 'firstName lastName mobileNo')
                .populate('pickupDriverId', 'firstName lastName mobileNo')
                .populate('vehicleId', 'vehicleNumber vehicleType')
                .lean(),
        ]);

        res.status(200).json({
            kpis: {
                pickups: pickupsCount,
                completed: completedCount,
                cancelled: cancelledCount,
                total: pickupsCount + completedCount + cancelledCount,
            },
            activeAssignments,
        });
    } catch (error) {
        console.error('Error fetching Munshi dashboard:', error);
        res.status(500).json({ message: 'Server error while fetching Munshi dashboard' });
    }
};

// @desc    Get paginated assignments for the logged-in Munshi (tabs: Pickups, Completed, Cancelled)
// @route   GET /api/munshi/assignments
// @access  Protected (Munshi, Admin, Operational Manager)
// @query   ?status=PENDING|IN_PROGRESS|COMPLETED|CANCELLED  ?page=1  ?limit=20
const getMunshiAssignments = async (req, res) => {
    try {
        const munshiId = req.user._id;
        const { status, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { munshiId };
        if (status) {
            query.assignmentStatus = status;
        }

        const [assignments, total] = await Promise.all([
            Logistics.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation plantCount status')
                .populate('companyId', 'companyName')
                .populate('driverId', 'firstName lastName mobileNo')
                .populate('pickupDriverId', 'firstName lastName mobileNo')
                .populate('vehicleId', 'vehicleNumber vehicleType')
                .lean(),
            Logistics.countDocuments(query),
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: assignments,
        });
    } catch (error) {
        console.error('Error fetching Munshi assignments:', error);
        res.status(500).json({ message: 'Server error while fetching assignments' });
    }
};

// @desc    Assign a secondary pickup driver to an assignment
// @route   PATCH /api/munshi/assignments/:id/pickup
// @access  Protected (Munshi, Admin, Operational Manager)
const assignPickupDriver = async (req, res) => {
    try {
        const { pickupDriverId } = req.body;
        const munshiId = req.user._id;

        if (!pickupDriverId) {
            return res.status(400).json({ message: 'pickupDriverId is required' });
        }

        // Verify assignment exists and belongs to this Munshi
        const assignment = await Logistics.findById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (assignment.munshiId.toString() !== munshiId.toString() && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'You can only update assignments assigned to you' });
        }

        if (['COMPLETED', 'CANCELLED'].includes(assignment.assignmentStatus)) {
            return res.status(400).json({ message: `Cannot update a ${assignment.assignmentStatus} assignment` });
        }

        // Validate the pickup driver exists and has a driver role
        const driver = await User.findById(pickupDriverId);
        if (!driver) {
            return res.status(404).json({ message: 'Pickup driver not found' });
        }
        const roleNorm = (driver.role || '').toLowerCase();
        if (!roleNorm.includes('driver')) {
            return res.status(400).json({ message: 'The provided user is not a Driver role' });
        }

        assignment.pickupDriverId = pickupDriverId;
        if (assignment.assignmentStatus === 'PENDING') {
            assignment.assignmentStatus = 'IN_PROGRESS';
        }
        await assignment.save();

        // Notify the pickup driver
        if (driver.mobileNo) {
            NotificationService.sendLogisticsAlert(
                driver.mobileNo,
                'Pickup Driver',
                `You have been assigned a pickup task for assignment ${assignment._id}. Please coordinate with the Munshi.`
            );
        }

        res.status(200).json({
            message: 'Pickup driver assigned successfully',
            assignment,
        });
    } catch (error) {
        console.error('Error assigning pickup driver:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while assigning pickup driver' });
    }
};

// ============================================================
//  PHASE 3: Packing Submission & Earnings Report
// ============================================================

// @desc    Submit a packing report for an assignment (or cancel it)
// @route   POST /api/munshi/packing/:id
// @access  Protected (Munshi, Admin, Operational Manager)
const submitPackingReport = async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const munshiId = req.user._id;

        // Verify assignment exists and belongs to this Munshi
        const assignment = await Logistics.findById(assignmentId).populate('enquiryId');
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }
        if (assignment.munshiId.toString() !== munshiId.toString() && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'You can only submit reports for your own assignments' });
        }
        if (['COMPLETED', 'CANCELLED'].includes(assignment.assignmentStatus)) {
            return res.status(400).json({ message: `This assignment is already ${assignment.assignmentStatus}` });
        }

        // Check if a packing record already exists for this assignment
        const existingPacking = await Packing.findOne({ assignmentId });
        if (existingPacking && existingPacking.status !== 'PENDING') {
            return res.status(400).json({ message: `A packing report has already been ${existingPacking.status} for this assignment` });
        }

        const {
            lineNo,
            teamName,
            brandId,
            box4H = 0,
            box5H = 0,
            box6H = 0,
            box8H = 0,
            boxCL = 0,
            box7Kg = 0,
            boxOther = 0,
            totalBoxes,
            wastageKg = 0,
            wastageReason,
            remarks,
            cancellationReason,
        } = req.body;

        // ── CANCELLATION FLOW ──
        if (cancellationReason) {
            const packing = await Packing.create({
                assignmentId,
                munshiId,
                lineNo: lineNo || 'N/A',
                teamName: teamName || 'N/A',
                brandId: brandId || null,
                totalBoxes: 0,
                wastageKg: 0,
                cancellationReason,
                status: 'CANCELLED',
            });

            // Cascade: update logistics and enquiry status
            assignment.assignmentStatus = 'CANCELLED';
            await assignment.save();

            if (assignment.enquiryId) {
                await Enquiry.findByIdAndUpdate(assignment.enquiryId._id || assignment.enquiryId, {
                    status: 'CANCELLED',
                });
            }

            return res.status(201).json({
                message: 'Assignment cancelled successfully',
                packing,
            });
        }

        // ── SUCCESS FLOW ──
        // Validate required fields
        if (!lineNo || !teamName || !brandId) {
            return res.status(400).json({ message: 'lineNo, teamName, and brandId are required' });
        }

        // Validate totalBoxes sum
        const calculatedTotal = Number(box4H) + Number(box5H) + Number(box6H) + Number(box8H)
            + Number(boxCL) + Number(box7Kg) + Number(boxOther);
        if (Number(totalBoxes) !== calculatedTotal) {
            return res.status(400).json({
                message: `totalBoxes (${totalBoxes}) does not match the sum of individual boxes (${calculatedTotal})`,
            });
        }

        // Wastage validation
        if (Number(wastageKg) > 0 && !wastageReason) {
            return res.status(400).json({ message: 'wastageReason is required when wastageKg > 0' });
        }

        // Handle uploaded photos
        const photos = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

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
            box7Kg,
            boxOther,
            totalBoxes,
            wastageKg,
            wastageReason,
            remarks: remarks || '',
            photos,
            status: 'SUBMITTED',
        });

        // Cascade: completed
        assignment.assignmentStatus = 'COMPLETED';
        await assignment.save();

        // Notify farmer
        if (assignment.enquiryId) {
            const enquiry = assignment.enquiryId;
            NotificationService.sendPackingSummary(
                enquiry.farmerMobile,
                enquiry.farmerFirstName,
                totalBoxes,
                wastageKg
            );
        }

        res.status(201).json(packing);
    } catch (error) {
        console.error('Error submitting packing report:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: error.message || 'Server error while submitting packing report' });
    }
};

// @desc    Get Munshi earnings/activity reports
// @route   GET /api/munshi/reports
// @access  Protected (Munshi, Admin, Operational Manager)
// @query   ?month=3&year=2026 (optional — defaults to current month)
const getMunshiReports = async (req, res) => {
    try {
        const munshiId = req.user._id;
        const now = new Date();
        const month = Number(req.query.month) || (now.getMonth() + 1);
        const year = Number(req.query.year) || now.getFullYear();

        // Date range for the requested month
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        // All submitted packing records for this Munshi in the month
        const packings = await Packing.find({
            munshiId,
            status: 'SUBMITTED',
            createdAt: { $gte: startDate, $lt: endDate },
        })
            .populate('assignmentId', 'purchaseRate companyId')
            .populate('brandId', 'brandName')
            .lean();

        // Aggregate totals
        let totalBoxes = 0;
        let totalWaste = 0;
        const boxBreakdown = { box4H: 0, box5H: 0, box6H: 0, box8H: 0, boxCL: 0, box7Kg: 0, boxOther: 0 };
        const dailyLog = {};  // grouped by date string

        packings.forEach(p => {
            totalBoxes += p.totalBoxes || 0;
            totalWaste += p.wastageKg || 0;

            ['box4H', 'box5H', 'box6H', 'box8H', 'boxCL', 'box7Kg', 'boxOther'].forEach(key => {
                boxBreakdown[key] += p[key] || 0;
            });

            // Group by day for daily harvesting log
            const dayKey = new Date(p.createdAt).toISOString().slice(0, 10); // YYYY-MM-DD
            if (!dailyLog[dayKey]) {
                dailyLog[dayKey] = { date: dayKey, entries: [], dayTotalBoxes: 0, dayWastage: 0 };
            }
            dailyLog[dayKey].entries.push({
                packingId: p._id,
                lineNo: p.lineNo,
                teamName: p.teamName,
                brand: p.brandId?.brandName || 'N/A',
                totalBoxes: p.totalBoxes,
                wastageKg: p.wastageKg,
            });
            dailyLog[dayKey].dayTotalBoxes += p.totalBoxes || 0;
            dailyLog[dayKey].dayWastage += p.wastageKg || 0;
        });

        // Sort daily log by date descending
        const dailyHarvestingLog = Object.values(dailyLog).sort((a, b) => b.date.localeCompare(a.date));

        res.status(200).json({
            month,
            year,
            summary: {
                totalRecords: packings.length,
                totalBoxes,
                totalWasteKg: totalWaste,
                boxBreakdown,
            },
            dailyHarvestingLog,
        });
    } catch (error) {
        console.error('Error fetching Munshi reports:', error);
        res.status(500).json({ message: 'Server error while fetching Munshi reports' });
    }
};

module.exports = {
    getMunshiDashboard,
    getMunshiAssignments,
    assignPickupDriver,
    submitPackingReport,
    getMunshiReports,
};
