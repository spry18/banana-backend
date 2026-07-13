const Enquiry = require('../enquiries/enquiry.model');
const Logistics = require('../logistics/logistics.model');
const Trip = require('../execution/trip.model');
const DieselAdvance = require('../diesel-advance/dieselAdvance.model');
const Packing = require('../execution/packing.model');
const { createNotification } = require('../../utils/notificationHelper');

// @desc    Get OM Dashboard KPIs and recent activity
// @route   GET /api/operational-manager/dashboard
// @access  Protected (Admin, Operational Manager)
const getOmDashboard = async (req, res) => {
    try {
        const assignedEnquiryIds = await Logistics.distinct('enquiryId');

        // ── IST-aligned today boundary ──
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowUtc = new Date();
        const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MS);
        const istMidnight = new Date(nowIst);
        istMidnight.setUTCHours(0, 0, 0, 0);                        // midnight in IST expressed as UTC
        const startOfTodayIst = new Date(istMidnight.getTime() - IST_OFFSET_MS); // convert back to UTC
        const endOfTodayIst   = new Date(startOfTodayIst.getTime() + 24 * 60 * 60 * 1000);

        // Run all KPI queries in parallel for best performance
        const [
            fixedPlotsCount,       // Enquiries at RATE_FIXED (ready to assign)
            teamsAssigned,         // Total logistics assignments created today (scheduled for today OR created today)
            activeTripsCount,      // Active assignments (dispatched trips)
            pendingReviewCount,    // Packing reports Munshi submitted today
            approvedCount,         // Logistics assignments OM approved/completed today
            recentAssignments,     // Latest 5 assignments for activity feed
        ] = await Promise.all([
            Enquiry.countDocuments({ status: 'RATE_FIXED', _id: { $nin: assignedEnquiryIds } }),
            Logistics.countDocuments({
                assignmentStatus: { $ne: 'CANCELLED' },
                $or: [
                    { scheduledDate: { $gte: startOfTodayIst, $lt: endOfTodayIst } },
                    {
                        $and: [
                            { $or: [{ scheduledDate: null }, { scheduledDate: { $exists: false } }] },
                            { createdAt: { $gte: startOfTodayIst, $lt: endOfTodayIst } }
                        ]
                    }
                ]
            }),
            Logistics.countDocuments({
                assignmentStatus: { $ne: 'CANCELLED' },
                $or: [
                    { scheduledDate: { $gte: startOfTodayIst, $lt: endOfTodayIst } },
                    {
                        assignmentStatus: 'PENDING',
                        $or: [
                            { scheduledDate: null },
                            { scheduledDate: { $exists: false } }
                        ]
                    }
                ]
            }),
            // pendingReviewCount: Count Packing reports with status 'SUBMITTED' associated with today's assignments
            (async () => {
                const todayAssignments = await Logistics.find({
                    assignmentStatus: { $ne: 'CANCELLED' },
                    $or: [
                        { scheduledDate: { $gte: startOfTodayIst, $lt: endOfTodayIst } },
                        {
                            $and: [
                                { $or: [{ scheduledDate: null }, { scheduledDate: { $exists: false } }] },
                                { createdAt: { $gte: startOfTodayIst, $lt: endOfTodayIst } }
                            ]
                        }
                    ]
                }).select('_id').lean();
                const assignmentIds = todayAssignments.map(a => a._id);
                return Packing.countDocuments({
                    status: 'SUBMITTED',
                    assignmentId: { $in: assignmentIds }
                });
            })(),
            // approvedCount: Count Logistics assignments approved/completed today
            Logistics.countDocuments({
                assignmentStatus: { $in: ['APPROVED', 'COMPLETED'] },
                updatedAt: { $gte: startOfTodayIst, $lt: endOfTodayIst }
            }),
            Logistics.find()
                .select('-purchaseRate')
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location subLocation packingType')
                .populate({ path: 'driverId', select: 'firstName lastName vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('munshiId', 'firstName lastName')
                .lean(),
        ]);

        res.status(200).json({
            kpis: {
                fixedPlots: fixedPlotsCount,       // Enquiries ready for logistics assignment
                teamsAssigned: teamsAssigned,       // Total logistics assignments created
                activeTrips: activeTripsCount,     // Active assignments (dispatched trips)
                pendingReview: pendingReviewCount,  // Munshi submitted packing, OM hasn't reviewed yet
                approvedTrips: approvedCount,       // Packing reports OM has approved
            },
            recentActivity: recentAssignments.map(a => ({
                assignmentId: a._id,
                enquiryRef: a.enquiryId?.enquiryId || 'N/A',
                farmerName: a.enquiryId ? `${a.enquiryId.farmerFirstName} ${a.enquiryId.farmerLastName}` : 'N/A',
                location: a.enquiryId?.location || 'N/A',
                packingType: a.enquiryId?.packingType || 'N/A',
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
        const { stage, search, page = 1, limit = 20, date } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
 
        // ---- Stage: All (default) = combined active workload view ----
        // Returns all RATE_FIXED and ASSIGNED enquiries with their logistics record (if any) attached.
        // purchaseRate is strictly excluded from all logistics objects.
        if (!stage || stage === 'All') {
            const query = {
                status: { $in: ['RATE_FIXED', 'ASSIGNED'] },
            };
 
            if (date) {
                const { getIstDayRange } = require('../../utils/dateHelper');
                const { startOfDay, endOfDay } = getIstDayRange(date);
                query.createdAt = { $gte: startOfDay, $lt: endOfDay };
            }

            if (search) {
                query.$or = [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { subLocation: { $regex: search, $options: 'i' } },
                ];
            }
 
            const [enquiries, total] = await Promise.all([
                Enquiry.find(query)
                    .select('-purchaseRate')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('companyId', 'companyName')
                    .populate('assignedSelectorId', 'firstName lastName bikeNumber')
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
                .populate({ path: 'pickupDriverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                .populate('vehicleId', 'vehicleNumber')
                .lean();
 
            // An enquiry can have multiple Logistics records (original + rollovers + overflows).
            // Return ALL records grouped by enquiry so the frontend can display the full picture.
            const logisticsMap = {};
            logisticsRecords.forEach(l => {
                const key = l.enquiryId.toString();
                if (!logisticsMap[key]) logisticsMap[key] = [];
                logisticsMap[key].push(l);
            });
 
            const data = enquiries.map(e => ({
                ...e,
                logistics: logisticsMap[e._id.toString()] || [],
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

            if (date) {
                const { getIstDayRange } = require('../../utils/dateHelper');
                const { startOfDay, endOfDay } = getIstDayRange(date);
                query.updatedAt = { $gte: startOfDay, $lt: endOfDay };
            }

            if (search) {
                query.$or = [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { subLocation: { $regex: search, $options: 'i' } },
                ];
            }

            const [enquiries, total] = await Promise.all([
                Enquiry.find(query)
                    .select('-purchaseRate')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('companyId', 'companyName')
                    .populate('assignedSelectorId', 'firstName lastName mobileNo bikeNumber')
                    .populate('fieldOwnerId', 'firstName lastName mobileNo')
                    .lean(),
                Enquiry.countDocuments(query),
            ]);

            return res.status(200).json({
                stage: 'Unassigned',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data: enquiries.map(e => ({
                    ...e,
                    packingType: e.packingType ?? null,
                    estimatedBoxes: e.estimatedBoxes ?? null,
                })),
            });
        }

        // ---- Stage: Assigned = logistics records with assignmentStatus in PENDING or IN_PROGRESS ----
        if (stage === 'Assigned') {
            const assignmentQuery = {
                assignmentStatus: { $in: ['PENDING'] },
            };

            if (date) {
                const { getIstDayRange } = require('../../utils/dateHelper');
                const { startOfDay, endOfDay } = getIstDayRange(date);
                assignmentQuery.createdAt = { $gte: startOfDay, $lt: endOfDay };
            }
 
            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                        { subLocation: { $regex: search, $options: 'i' } },
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
                    .populate({
                        path: 'enquiryId',
                        select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId',
                        populate: [
                            { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                            { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                        ]
                    })
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                    .populate({ path: 'pickupDriverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
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

            if (date) {
                const { getIstDayRange } = require('../../utils/dateHelper');
                const { startOfDay, endOfDay } = getIstDayRange(date);
                assignmentQuery.updatedAt = { $gte: startOfDay, $lt: endOfDay };
            }
 
            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                        { subLocation: { $regex: search, $options: 'i' } },
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
                    .populate({
                        path: 'enquiryId',
                        select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId',
                        populate: [
                            { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                            { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                        ]
                    })
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                    .populate({ path: 'pickupDriverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
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
        if (stage === 'Complete' || stage === 'Completed') {
            const assignmentQuery = {
                assignmentStatus: { $in: ['COMPLETED', 'APPROVED', 'REJECTED'] },
            };

            if (date) {
                const { getIstDayRange } = require('../../utils/dateHelper');
                const { startOfDay, endOfDay } = getIstDayRange(date);
                assignmentQuery.updatedAt = { $gte: startOfDay, $lt: endOfDay };
            }

            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                        { subLocation: { $regex: search, $options: 'i' } },
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
                    .populate({
                        path: 'enquiryId',
                        select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId',
                        populate: [
                            { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                            { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                        ]
                    })
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate({ path: 'driverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
                    .populate({ path: 'pickupDriverId', select: 'firstName lastName mobileNo vehicleId', populate: { path: 'vehicleId', select: 'vehicleNumber vehicleType' } })
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
                stage: stage,
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data,
            });
        }

        // ---- Stage: Cancelled = Assignments with assignmentStatus CANCELLED ----
        if (stage === 'Cancelled') {
            const assignmentQuery = {
                assignmentStatus: 'CANCELLED',
            };

            if (date) {
                const { getIstDayRange } = require('../../utils/dateHelper');
                const { startOfDay, endOfDay } = getIstDayRange(date);
                assignmentQuery.updatedAt = { $gte: startOfDay, $lt: endOfDay };
            }

            // Build a search filter on enquiry fields via two queries
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                        { location: { $regex: search, $options: 'i' } },
                        { subLocation: { $regex: search, $options: 'i' } },
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
                    .populate({
                        path: 'enquiryId',
                        select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId',
                        populate: [
                            { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                            { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                        ]
                    })
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
                stage: 'Cancelled',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data,
            });
        }

        return res.status(400).json({ message: 'Invalid stage. Must be: All, Unassigned, Assigned, Rejected, Cancelled, Complete, or Completed' });

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
        const { remark, rejectRoles = [] } = req.body;

        if (!remark) {
            return res.status(400).json({ message: 'remark is required for rejection' });
        }
        if (!Array.isArray(rejectRoles) || rejectRoles.length === 0) {
            return res.status(400).json({ message: 'At least one role must be selected for rejection (Munshi, Eicher, or Pickup)' });
        }

        // Find the logistics assignment
        const assignment = await Logistics.findById(assignmentId);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Handle Munshi Rejection
        if (rejectRoles.includes('Munshi')) {
            const packing = await Packing.findOne({ assignmentId });
            if (packing) {
                packing.status = 'REJECTED';
                packing.omRemark = remark;
                await packing.save();

                assignment.assignmentStatus = 'REJECTED';
                await assignment.save();

                if (packing.munshiId) {
                    await createNotification(
                        packing.munshiId,
                        'PACKING_REJECTED',
                        `Your packing report was rejected by the Operations Manager. Reason: ${remark}. Please resubmit.`,
                        packing._id,
                        'Packing'
                    );
                }
            }
        }

        // Handle Eicher Driver Rejection
        if (rejectRoles.includes('Eicher')) {
            await Trip.findOneAndDelete({ assignmentId, driverType: 'Eicher' });
            if (assignment.driverId) {
                await DieselAdvance.findOneAndDelete({ assignmentId, driverId: assignment.driverId });
            }
            assignment.driverId = null;
            assignment.assignmentStatus = 'ASSIGNED'; // Revert back so it needs re-assignment or driver completion
            await assignment.save();
        }

        // Handle Pickup Driver Rejection
        if (rejectRoles.includes('Pickup')) {
            await Trip.findOneAndDelete({ assignmentId, driverType: 'Pickup' });
            if (assignment.pickupDriverId) {
                await DieselAdvance.findOneAndDelete({ assignmentId, driverId: assignment.pickupDriverId });
            }
            assignment.pickupDriverId = null;
            assignment.assignmentStatus = 'ASSIGNED';
            await assignment.save();
        }

        res.status(200).json({
            message: 'Rejection processed successfully for selected roles.',
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
        const { approvalNote, slipDetails, actualWeight } = req.body;

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
        
        if (slipDetails !== undefined) {
            packing.slipDetails = slipDetails;
        }
        if (actualWeight !== undefined) {
            packing.actualWeight = actualWeight;
        }
        
        await packing.save();

        // Update parent logistics assignment status to APPROVED
        const assignment = await Logistics.findById(assignmentId)
            .populate('enquiryId', 'fieldOwnerId farmerFirstName enquiryId location subLocation')
            .populate('driverId', '_id firstName lastName')
            .populate('munshiId', '_id firstName lastName');

        if (assignment) {
            assignment.assignmentStatus = 'APPROVED';
            await assignment.save();
            if (assignment.enquiryId) {
                await Enquiry.findByIdAndUpdate(assignment.enquiryId._id || assignment.enquiryId, { status: 'PENDING_ADMIN_APPROVAL' });
            }

            // Flow 2 — In-app: notify Munshi (their report was approved)
            if (assignment.munshiId) {
                await createNotification(
                    assignment.munshiId._id || assignment.munshiId,
                    'PACKING_APPROVED',
                    `Your packing report for enquiry ${assignment.enquiryId?.enquiryId || ''} has been approved by the Operations Manager.`,
                    packing._id,
                    'Packing'
                );
            }

            // Flow 2 — In-app: notify Driver (their assignment is now complete)
            if (assignment.driverId) {
                await createNotification(
                    assignment.driverId._id || assignment.driverId,
                    'PACKING_APPROVED',
                    `Your assignment for enquiry ${assignment.enquiryId?.enquiryId || ''} at ${assignment.enquiryId?.location || ''} has been completed and approved.`,
                    assignment._id,
                    'Logistics'
                );
            }

            // Flow 2 — In-app: notify all Admins that final approval is needed
            const { broadcastToRole } = require('../../utils/broadcastToRole');
            await broadcastToRole(
                'Admin',
                'SYSTEM',
                `Enquiry ${assignment.enquiryId?.enquiryId || ''} is awaiting final admin approval.`,
                assignment.enquiryId?._id || assignment.enquiryId,
                'Enquiry'
            );
        }

        res.status(200).json({
            message: 'Packing report approved successfully. Assignment is now locked for Finance processing. Parent enquiry marked PENDING_ADMIN_APPROVAL.',
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
        const { search, page = 1, limit = 20, date } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
 
        const assignmentQuery = {
            assignmentStatus: 'APPROVED',
        };

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            assignmentQuery.updatedAt = { $gte: startOfDay, $lt: endOfDay };
        }

        // Build a search filter on enquiry fields via two queries
        if (search) {
            const matchingEnquiries = await Enquiry.find({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { subLocation: { $regex: search, $options: 'i' } },
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
                .populate({
                    path: 'enquiryId',
                    select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId',
                    populate: [
                        { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                        { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                    ]
                })
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

// @desc    Get all plots pending OM approval (submitted by Munshi/Driver, not yet approved/rejected)
// @route   GET /api/operational-manager/plots/pending-approval
// @access  Protected (Admin, Operational Manager)
const getPendingApprovalPlots = async (req, res) => {
    try {
        const { search, page = 1, limit = 20, date } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
 
        const assignmentQuery = {
            assignmentStatus: 'COMPLETED',
        };

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            assignmentQuery.updatedAt = { $gte: startOfDay, $lt: endOfDay };
        }

        // Build a search filter on enquiry fields via two queries
        if (search) {
            const matchingEnquiries = await Enquiry.find({
                $or: [
                    { farmerFirstName: { $regex: search, $options: 'i' } },
                    { farmerLastName: { $regex: search, $options: 'i' } },
                    { enquiryId: { $regex: search, $options: 'i' } },
                    { location: { $regex: search, $options: 'i' } },
                    { subLocation: { $regex: search, $options: 'i' } },
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
                .populate({
                    path: 'enquiryId',
                    select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId',
                    populate: [
                        { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                        { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                    ]
                })
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
            stage: 'PendingApproval',
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });

    } catch (error) {
        console.error('Error fetching pending approval plots:', error);
        res.status(500).json({ message: 'Server error while fetching pending approval plots' });
    }
};

// @desc    Get OM approved plots awaiting Admin final approval
// @route   GET /api/operational-manager/plots/pending-admin-approval
// @access  Protected (Admin, Operational Manager)
const getPendingAdminApprovalPlots = async (req, res) => {
    try {
        const { search, page = 1, limit = 20, date } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const enquiryMatchQuery = { status: 'PENDING_ADMIN_APPROVAL' };
        if (search) {
            enquiryMatchQuery.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { enquiryId: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } },
                { subLocation: { $regex: search, $options: 'i' } },
            ];
        }

        const matchingEnquiries = await Enquiry.find(enquiryMatchQuery).select('_id');
        const matchingEnquiryIds = matchingEnquiries.map(e => e._id);

        const assignmentQuery = {
            assignmentStatus: 'APPROVED',
            enquiryId: { $in: matchingEnquiryIds }
        };

        if (date) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const { startOfDay, endOfDay } = getIstDayRange(date);
            assignmentQuery.updatedAt = { $gte: startOfDay, $lt: endOfDay };
        }

        const [assignments, total] = await Promise.all([
            Logistics.find(assignmentQuery)
                .select('-purchaseRate')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate({
                    path: 'enquiryId',
                    select: 'enquiryId farmerFirstName farmerLastName farmerMobile location subLocation packingType fieldOwnerId assignedSelectorId status',
                    populate: [
                        { path: 'fieldOwnerId', select: 'firstName lastName mobileNo' },
                        { path: 'assignedSelectorId', select: 'firstName lastName mobileNo bikeNumber' }
                    ]
                })
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
            stage: 'Pending Admin Approval',
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });

    } catch (error) {
        console.error('Error fetching pending admin approval plots:', error);
        res.status(500).json({ message: 'Server error while fetching pending admin approval plots' });
    }
};

module.exports = {
    getOmDashboard,
    getOmPlots,
    rejectPackingReport,
    approvePackingReport,
    getApprovedPlots,
    getPendingAdminApprovalPlots,
    getPendingApprovalPlots,
};
