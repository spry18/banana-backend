const Enquiry = require('../enquiries/enquiry.model');
const Logistics = require('../logistics/logistics.model');
const Trip = require('../execution/trip.model');
const DieselAdvance = require('../diesel-advance/dieselAdvance.model');

// @desc    Get OM Dashboard KPIs and recent activity
// @route   GET /api/operational-manager/dashboard
// @access  Protected (Admin, Operational Manager)
const getOmDashboard = async (req, res) => {
    try {
        // Run all KPI queries in parallel for best performance
        const [
            fixedPlotsCount,       // Enquiries at RATE_FIXED (ready to assign)
            teamsAssigned,         // Total logistics assignments created
            activeTripsCount,      // Trips submitted but not yet OM-reviewed
            approvedTripsCount,    // OM-approved trips
            pendingReviewCount,    // Trips awaiting OM review
            recentAssignments,     // Latest 5 assignments for activity feed
        ] = await Promise.all([
            Enquiry.countDocuments({ status: 'RATE_FIXED' }),
            Logistics.countDocuments(),
            Trip.countDocuments({ reviewStatus: 'PENDING' }),
            Trip.countDocuments({ reviewStatus: 'APPROVED' }),
            Trip.countDocuments({ reviewStatus: 'PENDING' }),
            Logistics.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location')
                .populate('driverId', 'firstName lastName')
                .populate('munshiId', 'firstName lastName')
                .lean(),
        ]);

        res.status(200).json({
            kpis: {
                fixedPlots: fixedPlotsCount,       // Enquiries ready for logistics assignment
                teamsAssigned: teamsAssigned,       // Total logistics teams dispatched
                activeTrips: activeTripsCount,      // Trips awaiting OM review
                approvedTrips: approvedTripsCount,  // OM-reviewed and approved
                pendingReview: pendingReviewCount,  // Trips pending OM action
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

// @desc    Get plots pipeline for OM (Unassigned → Assigned → Complete)
// @route   GET /api/operational-manager/plots
// @access  Protected (Admin, Operational Manager)
// @query   ?stage=Unassigned|Assigned|Complete  ?page=1  ?limit=20  ?search=...
const getOmPlots = async (req, res) => {
    try {
        const { stage, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // ---- Stage: Unassigned = RATE_FIXED enquiries that have NO logistics record ----
        if (!stage || stage === 'Unassigned') {
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
                    .populate('assignedSelectorId', 'firstName lastName')
                    .populate('fieldOwnerId', 'firstName lastName')
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

        // ---- Stage: Assigned = logistics records with enquiry status ASSIGNED ----
        if (stage === 'Assigned') {
            const query = {};
            const assignmentQuery = {};

            // Build a join-like filter via two queries
            let matchingEnquiryIds;
            if (search) {
                const matchingEnquiries = await Enquiry.find({
                    status: 'ASSIGNED',
                    $or: [
                        { farmerFirstName: { $regex: search, $options: 'i' } },
                        { farmerLastName: { $regex: search, $options: 'i' } },
                        { enquiryId: { $regex: search, $options: 'i' } },
                    ],
                }).select('_id');
                matchingEnquiryIds = matchingEnquiries.map(e => e._id);
                assignmentQuery.enquiryId = { $in: matchingEnquiryIds };
            }

            const [assignments, total] = await Promise.all([
                Logistics.find(assignmentQuery)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location status')
                    .populate('companyId', 'companyName')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .populate('driverId', 'firstName lastName mobileNo')
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

        // ---- Stage: Complete = Assignments with an APPROVED or REJECTED trip ----
        if (stage === 'Complete') {
            const reviewedTrips = await Trip.find({
                reviewStatus: { $in: ['APPROVED', 'REJECTED'] }
            }).select('assignmentId reviewStatus reviewedBy').lean();

            const completedAssignmentIds = reviewedTrips.map(t => t.assignmentId);

            const assignmentQuery = { _id: { $in: completedAssignmentIds } };

            const [assignments, total] = await Promise.all([
                Logistics.find(assignmentQuery)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .populate('enquiryId', 'enquiryId farmerFirstName farmerLastName location')
                    .populate('companyId', 'companyName')
                    .populate('driverId', 'firstName lastName mobileNo')
                    .populate('munshiId', 'firstName lastName mobileNo')
                    .lean(),
                Logistics.countDocuments(assignmentQuery),
            ]);

            // Merge review status into each assignment
            const tripMap = {};
            reviewedTrips.forEach(t => { tripMap[t.assignmentId.toString()] = t; });

            const enriched = assignments.map(a => ({
                ...a,
                tripReview: tripMap[a._id.toString()] || null,
            }));

            return res.status(200).json({
                stage: 'Complete',
                total,
                page: Number(page),
                pages: Math.ceil(total / Number(limit)),
                data: enriched,
            });
        }

        return res.status(400).json({ message: 'Invalid stage. Must be: Unassigned, Assigned, or Complete' });

    } catch (error) {
        console.error('Error fetching OM plots pipeline:', error);
        res.status(500).json({ message: 'Server error while fetching OM plots' });
    }
};

module.exports = {
    getOmDashboard,
    getOmPlots,
};
