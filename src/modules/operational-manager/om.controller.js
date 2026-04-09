const Enquiry = require('../enquiries/enquiry.model');
const Logistics = require('../logistics/logistics.model');
const Trip = require('../execution/trip.model');
const DieselAdvance = require('../diesel-advance/dieselAdvance.model');
const Packing = require('../execution/packing.model');

// @desc    Get OM Dashboard KPIs and recent activity
// @route   GET /api/operational-manager/dashboard
// @access  Protected (Admin, Operational Manager)
const getOmDashboard = async (req, res) => {
    try {
        // Run all KPI queries in parallel for best performance
        const [
            fixedPlotsCount,       // Enquiries at RATE_FIXED (ready to assign)
            teamsAssigned,         // Total logistics assignments created
            pendingReviewCount,    // Packing reports Munshi submitted → OM hasn't acted yet
            approvedCount,         // Packing reports OM has approved
            recentAssignments,     // Latest 5 assignments for activity feed
        ] = await Promise.all([
            Enquiry.countDocuments({ status: 'RATE_FIXED' }),
            Logistics.countDocuments(),
            Packing.countDocuments({ status: 'SUBMITTED' }),   // Munshi done, OM pending
            Logistics.countDocuments({ assignmentStatus: 'APPROVED' }),    // OM approved logistics assignments
            Logistics.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location')
                .populate({ path: 'driverId', select: 'firstName lastName vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('munshiId', 'firstName lastName')
                .lean(),
        ]);

        res.status(200).json({
            kpis: {
                fixedPlots: fixedPlotsCount,       // Enquiries ready for logistics assignment
                teamsAssigned: teamsAssigned,       // Total logistics assignments created
                pendingReview: pendingReviewCount,  // Munshi submitted packing, OM hasn't reviewed yet
                approvedTrips: approvedCount,       // Packing reports OM has approved
            },
            recentActivity: recentAssignments.map(a => ({
                assignmentId: a._id,
                enquiryRef: a.enquiryId?.enquiryId || 'N/A',
                farmerName: a.enquiryId ? `${a.enquiryId.farmerFirstName} ${a.enquiryId.farmerLastName}` : 'N/A',
                location: a.enquiryId?.location || 'N/A',
                driver: a.driverId ? `${a.driverId.firstName} ${a.driverId.lastName}` : 'N/A',
                munshi: a.munshiId ? `${a.munshiId.firstName} ${a.munshiId.lastName}` : 'N/A',
                lightInTime: a.lightInTime,
                createdAt: a.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error fetching OM dashboard:', error);
        res.status(500).json({ message: 'Server error while fetching OM dashboard' });
    }
};

// @desc    Get plots pipeline for OM (All → Unassigned → Assigned → Complete)
// @route   GET /api/operational-manager/plots
// @access  Protected (Admin, Operational Manager)
// @query   ?stage=All|Unassigned|Assigned|Complete  ?page=1  ?limit=20  ?search=...
const getOmPlots = async (req, res) => {
    try {
        const { stage, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // ---- Stage: All (default) = combined active workload view ----
        // Returns all RATE_FIXED and ASSIGNED enquiries with their logistics record (if any) attached.
        // purchaseRate is strictly excluded from all logistics objects.
        if (!stage || stage === 'All') {
            const query = {
                status: { $in: ['RATE_FIXED', 'ASSIGNED', 'IN_PROGRESS'] },
            };

            if (search) {
                query.$or = [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                ];
            }

            const [enquiries, total] = await Promise.all([
                Enquiry.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('companyId', 'companyName')
                    .populate('assignedSelectorId', 'firstName lastName')
                    .populate('fieldOwnerId', 'firstName lastName')
                    .lean(),
                Enquiry.countDocuments(query),
            ]);

            // Build a lookup map of enquiryId → logistics assignment (purchaseRate excluded)
            const enquiryObjectIds = enquiries.map(e => e._id);
            const logisticsRecords = await Logistics.find({ enquiryId: { $in: enquiryObjectIds } })
                .select('-purchaseRate')
                .populate('munshiId', 'firstName lastName mobileNo')
                .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('vehicleId', 'vehicleNumber')
                .lean();

            // An enquiry can have multiple Logistics records (original + rollovers).
            // Use status priority so APPROVED/COMPLETED always shows over CANCELLED.
            const statusPriority = { 'APPROVED': 6, 'COMPLETED': 5, 'IN_PROGRESS': 4, 'PENDING': 3, 'REJECTED': 2, 'CANCELLED': 1 };
            const logisticsMap = {};
            logisticsRecords.forEach(l => {
                const key = l.enquiryId.toString();
                const existing = logisticsMap[key];
                if (!existing) {
                    logisticsMap[key] = l;
                } else {
                    const newPriority = statusPriority[l.assignmentStatus] || 0;
                    const oldPriority = statusPriority[existing.assignmentStatus] || 0;
                    if (newPriority > oldPriority) {
                        logisticsMap[key] = l;
                    }
                }
            });

            const data = enquiries.map(e => ({
                ...e,
                logistics: logisticsMap[e._id.toString()] || null,
            }));

            return res.status(200).json({
                stage: 'All',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data,
            });
        }

        // ---- Stage: Unassigned = RATE_FIXED enquiries that have NO logistics record ----
        if (stage === 'Unassigned') {
            // Find all enquiryIds that already have a logistics assignment
            const assignedEnquiryIds = await Logistics.distinct('enquiryId');

            const query = {
                status: 'RATE_FIXED',
                _id: { $nin: assignedEnquiryIds },
            };

            if (search) {
                query.$or = [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                ];
            }

            const [enquiries, total] = await Promise.all([
                Enquiry.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('companyId', 'companyName')
                    .populate('assignedSelectorId', 'firstName lastName mobileNo')
                    .populate('fieldOwnerId', 'firstName lastName mobileNo')
                    .lean(),
                Enquiry.countDocuments(query),
            ]);

            return res.status(200).json({
                stage: 'Unassigned',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data: enquiries,
            });
        }

        // ---- Stage: Assigned = logistics records with assignmentStatus in PENDING or IN_PROGRESS ----
        if (stage === 'Assigned') {
            const assignmentQuery = {
                assignmentStatus: { $in: ['PENDING'] },
            };

            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                    ],
                }).select('_id');
                assignmentQuery.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
            }

            const [assignments, total] = await Promise.all([
                Logistics.find(assignmentQuery)
                    .select('-purchaseRate')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location')
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                    .populate('vehicleId', 'vehicleNumber')
                    .lean(),
                Logistics.countDocuments(assignmentQuery),
            ]);

            return res.status(200).json({
                stage: 'Assigned',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data: assignments,
            });
        }

        // ---- Stage: Rejected = Assignments with assignmentStatus REJECTED ----
        if (stage === 'Rejected') {
            const assignmentQuery = {
                assignmentStatus: 'REJECTED',
            };

            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                    ],
                }).select('_id');
                assignmentQuery.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
            }

            const [assignments, total] = await Promise.all([
                Logistics.find(assignmentQuery)
                    .select('-purchaseRate')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location')
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                    .populate('vehicleId', 'vehicleNumber')
                    .lean(),
                Logistics.countDocuments(assignmentQuery),
            ]);

            // --- Enhancement: Attach Packing Details ---
            const assignmentIds = assignments.map(a => a._id);
            const packingRecords = await Packing.find({ assignmentId: { $in: assignmentIds } }).lean();
            const packingMap = packingRecords.reduce((map, packing) => {
                map[packing.assignmentId.toString()] = packing;
                return map;
            }, {});

            const data = assignments.map(a => ({
                ...a,
                packingDetails: packingMap[a._id.toString()] || null,
            }));
            // --- End Enhancement ---

            return res.status(200).json({
                stage: 'Rejected',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data,
            });
        }

        // ---- Stage: Complete = Assignments with assignmentStatus COMPLETED, REJECTED, or APPROVED ----
        if (stage === 'Complete') {
            const assignmentQuery = {
                // assignmentStatus: { $in: ['COMPLETED', 'REJECTED', 'APPROVED'] },
                assignmentStatus: { $in: ['COMPLETED'] },
            };

            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                    ],
                }).select('_id');
                assignmentQuery.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
            }

            const [assignments, total] = await Promise.all([
                Logistics.find(assignmentQuery)
                    .select('-purchaseRate')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location')
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                    .populate('vehicleId', 'vehicleNumber')
                    .lean(),
                Logistics.countDocuments(assignmentQuery),
            ]);

            // --- Enhancement: Attach Packing Details ---
            const assignmentIds = assignments.map(a => a._id);
            const packingRecords = await Packing.find({ assignmentId: { $in: assignmentIds } }).lean();
            const packingMap = packingRecords.reduce((map, packing) => {
                map[packing.assignmentId.toString()] = packing;
                return map;
            }, {});

            const data = assignments.map(a => ({
                ...a,
                packingDetails: packingMap[a._id.toString()] || null,
            }));
            // --- End Enhancement ---

            return res.status(200).json({
                stage: 'Complete',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data,
            });
        }

        return res.status(400).json({ message: 'Invalid stage. Must be: All, Unassigned, Assigned, or Complete' });

    } catch (error) {
        console.error('Error fetching OM plots pipeline:', error);
        res.status(500).json({ message: 'Server error while fetching OM plots' });
    }
};

// @desc    Reject a submitted packing report and request resubmission
// @route   POST /api/operational-manager/assignments/:assignmentId/reject
// @access  Protected (Admin, Operational Manager)
const rejectPackingReport = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { remark } = req.body;

        if (!remark) {
            return res.status(400).json({ message: 'remark is required for rejection' });
        }

        // Find and verify the packing record exists and is in SUBMITTED status
        const packing = await Packing.findOne({ assignmentId });
        if (!packing) {
            return res.status(404).json({ message: 'Packing report not found for this assignment' });
        }

        if (packing.status !== 'SUBMITTED') {
            return res.status(400).json({ message: `Cannot reject a packing report with status: ${packing.status}` });
        }

        // Update packing record
        packing.status = 'REJECTED';
        packing.omRemark = remark;
        await packing.save();

        // Update parent logistics assignment status to REJECTED
        const assignment = await Logistics.findById(assignmentId);
        if (assignment) {
            assignment.assignmentStatus = 'REJECTED';
            await assignment.save();
        }

        res.status(200).json({
            message: 'Packing report rejected successfully. Munshi has been notified to resubmit.',
            packing,
        });
    } catch (error) {
        console.error('Error rejecting packing report:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while rejecting packing report' });
    }
};

// @desc    Approve a submitted packing report (final lock)
// @route   POST /api/operational-manager/assignments/:assignmentId/approve
// @access  Protected (Admin, Operational Manager)
const approvePackingReport = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { approvalNote } = req.body;

        // Find and verify the packing record exists and is in SUBMITTED status
        const packing = await Packing.findOne({ assignmentId });
        if (!packing) {
            return res.status(404).json({ message: 'Packing report not found for this assignment' });
        }

        if (packing.status !== 'SUBMITTED') {
            return res.status(400).json({ message: `Cannot approve a packing report with status: ${packing.status}. Only SUBMITTED reports can be approved.` });
        }

        // Update packing record
        packing.status = 'APPROVED';
        packing.omRemark = null;  // Clear any remark field
        await packing.save();

        // Update parent logistics assignment status to APPROVED
        const assignment = await Logistics.findById(assignmentId);
        if (assignment) {
            assignment.assignmentStatus = 'APPROVED';
            await assignment.save();
            if (assignment.enquiryId) {
                await Enquiry.findByIdAndUpdate(assignment.enquiryId, { status: 'COMPLETED' });
            }
        }

        res.status(200).json({
            message: 'Packing report approved successfully. Assignment is now locked for Finance processing. Parent enquiry marked COMPLETED.',
            assignment,
            packing,
            approvalNote: approvalNote || null,
        });
    } catch (error) {
        console.error('Error approving packing report:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while approving packing report' });
    }
};

// @desc    Get all approved plots for OM
// @route   GET /api/operational-manager/plots/approved
// @access  Protected (Admin, Operational Manager)
// @query   ?page=1  ?limit=20  ?search=...
const getApprovedPlots = async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const assignmentQuery = {
            assignmentStatus: 'APPROVED',
        };

        // Build a search filter on enquiry fields via two queries
        if (search) {
            const matchingEnquiries = await Enquiry.find({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                ],
            }).select('_id');
            assignmentQuery.enquiryId = { $in: matchingEnquiries.map(e => e._id) };
        }

        const [assignments, total] = await Promise.all([
            Logistics.find(assignmentQuery)
                .select('-purchaseRate')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName farmerMobile location')
                .populate('companyId', 'companyName')
                .populate('munshiId', 'firstName lastName mobileNo')
                .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('vehicleId', 'vehicleNumber')
                .lean(),
            Logistics.countDocuments(assignmentQuery),
        ]);

        // Attach Packing Details
        const assignmentIds = assignments.map(a => a._id);
        const packingRecords = await Packing.find({ assignmentId: { $in: assignmentIds } }).lean();
        const packingMap = packingRecords.reduce((map, packing) => {
            map[packing.assignmentId.toString()] = packing;
            return map;
        }, {});

        const data = assignments.map(a => ({
            ...a,
            packingDetails: packingMap[a._id.toString()] || null,
        }));

        return res.status(200).json({
            stage: 'Approved',
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });

    } catch (error) {
        console.error('Error fetching approved plots:', error);
        res.status(500).json({ message: 'Server error while fetching approved plots' });
    }
};

module.exports = {
    getOmDashboard,
    getOmPlots,
    rejectPackingReport,
    approvePackingReport,
    getApprovedPlots,
};
