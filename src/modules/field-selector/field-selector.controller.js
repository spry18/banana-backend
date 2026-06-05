const Enquiry = require('../enquiries/enquiry.model');
const Inspection = require('../inspections/inspection.model');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get Field Selector dashboard KPIs
// @route   GET /api/field-selector/dashboard
// @access  Protected (Field Selector, Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getDashboard = async (req, res) => {
    try {
        const selectorId = req.user._id;

        // ── IST-aligned today boundary (matches Field Owner dashboard pattern) ──
        // Server runs UTC; users are IST (UTC+5:30). We compute the IST calendar
        // day boundaries in UTC so MongoDB date comparisons are correct.
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const nowUtc = new Date();
        const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MS);
        const istMidnight = new Date(nowIst);
        istMidnight.setUTCHours(0, 0, 0, 0);                        // midnight in IST expressed as UTC
        const startOfTodayIst = new Date(istMidnight.getTime() - IST_OFFSET_MS); // convert back to UTC
        const endOfTodayIst   = new Date(startOfTodayIst.getTime() + 24 * 60 * 60 * 1000);

        // Base filter: this selector's enquiries assigned/scheduled for today (IST)
        // We scope on scheduledDate for today so plots assigned today show up regardless
        // of when the underlying enquiry record was originally created.
        const baseFilter = { assignedSelectorId: selectorId };
        const todayScheduledFilter = {
            ...baseFilter,
            scheduledDate: { $gte: startOfTodayIst, $lt: endOfTodayIst },
        };

        // Run all aggregation counters in parallel for performance
        const [
            assigned,
            selected,
            rejected,
            missed,
            visited,
            recentActivity,
        ] = await Promise.all([
            // Assigned = PENDING plots scheduled for today (not yet inspected)
            Enquiry.countDocuments({ ...todayScheduledFilter, status: 'PENDING' }),

            // Selector marked the plot as SELECTED (inspection approved) — today
            Enquiry.countDocuments({ ...todayScheduledFilter, status: 'SELECTED' }),

            // Selector rejected the plot — today
            Enquiry.countDocuments({ ...todayScheduledFilter, status: 'REJECTED' }),

            // Missed = still PENDING but the scheduledDate has passed (today's plots only)
            Enquiry.countDocuments({
                ...todayScheduledFilter,
                scheduledDate: { $gte: startOfTodayIst, $lt: nowUtc },
                status: 'PENDING',
            }),

            // Visited = inspection was submitted today (SELECTED + REJECTED + downstream)
            Enquiry.countDocuments({
                ...todayScheduledFilter,
                status: { $in: ['SELECTED', 'REJECTED', 'RATE_FIXED', 'ASSIGNED', 'COMPLETED', 'CLOSED'] },
            }),

            // Last 5 activity items for the feed — all active assignments (no date cap)
            Enquiry.find({
                ...baseFilter,
                status: { $in: ['PENDING', 'SELECTED', 'REJECTED', 'RESCHEDULED'] },
            })
                .sort({ updatedAt: -1 })
                .limit(5)
                .select('enquiryId farmerFirstName farmerLastName farmerMobile location subLocation status scheduledDate updatedAt generation companyId packingType estimatedBoxes')
                .populate('generation', 'name')
                .populate('companyId', 'companyName')   // FIX: Company schema uses 'companyName', not 'name'
                .lean(),
        ]);

        res.status(200).json({
            kpis: {
                assigned,
                selected,
                rejected,
                missed,
                visited,
            },
            recentActivity,
        });
    } catch (error) {
        console.error('Error fetching field-selector dashboard:', error);
        res.status(500).json({ message: 'Server error while fetching dashboard' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all enquiries assigned to the logged-in Field Selector
// @route   GET /api/field-selector/fields
// @access  Protected (Field Selector, Admin)
//
// Query params:
//   status   — filter by enquiry status (e.g. PENDING, SELECTED, REJECTED)
//   search   — search by farmer name or location (case-insensitive)
//   page     — page number (default: 1)
//   limit    — results per page (default: 20)
// ─────────────────────────────────────────────────────────────────────────────
const getAssignedFields = async (req, res) => {
    try {
        const selectorId = req.user._id;
        const { status, search, page = 1, limit = 20 } = req.query;

        // Base filter: all enquiries currently assigned to this selector
        // (No date cap — a selector must be able to see plots regardless of when
        //  the enquiry was created or how long ago it was assigned to them.)
        const filter = {
            assignedSelectorId: selectorId,
        };

        // Optional status filter (single value or comma-separated list)
        if (status) {
            const statuses = status.split(',').map(s => s.trim().toUpperCase());
            filter.status = { $in: statuses };
        }

        // Optional text search across farmer name and location
        if (search) {
            const regex = new RegExp(search, 'i');
            filter.$or = [
                { farmerFirstName: regex },
                { farmerLastName: regex },
                { location: regex },
                { subLocation: regex },
                { enquiryId: regex },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [data, total] = await Promise.all([
            Enquiry.find(filter)
                .sort({ scheduledDate: 1, createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('generation', 'name')
                .populate('fieldOwnerId', 'firstName lastName mobileNo')
                .lean(),
            Enquiry.countDocuments(filter),
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });
    } catch (error) {
        console.error('Error fetching assigned fields:', error);
        res.status(500).json({ message: 'Server error while fetching assigned fields' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single enquiry assigned to the logged-in Field Selector
// @route   GET /api/field-selector/fields/:id
// @access  Protected (Field Selector, Admin)
// ─────────────────────────────────────────────────────────────────────────────
const getFieldDetails = async (req, res) => {
    try {
        const selectorId = req.user._id;
        const enquiryId = req.params.id;

        // Fetch the enquiry and its linked inspection in parallel
        // Ownership is enforced by assignedSelectorId — no date filter needed here.
        const [enquiry, inspection] = await Promise.all([
            Enquiry.findOne({
                _id: enquiryId,
                assignedSelectorId: selectorId,
            })
                .populate('generation', 'name')
                .populate('companyId', 'companyName')   // FIX: Company schema uses 'companyName'
                .populate('fieldOwnerId', 'firstName lastName mobileNo')
                .lean(),

            // Inspection uses enquiryId (ObjectId ref to Enquiry._id)
            Inspection.findOne({ enquiryId }).lean(),
        ]);

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found, not assigned to you, or no longer visible' });
        }

        // Map DB field names back to the UI field names the frontend expects
        let inspectionData = null;
        if (inspection) {
            inspectionData = {
                _id:               inspection._id,
                harvestingStage:   inspection.harvestingStage,
                minVolume:         inspection.minVolume,         // separate integer fields
                maxVolume:         inspection.maxVolume,         // separate integer fields
                recoveryPercent:   inspection.recoveryPercent,
                packingSize:       inspection.packingSize,
                chellingPercent:   inspection.chelling,         // DB → UI name
                spiklingPercent:   inspection.spikling,         // DB → UI name
                pulpePercent:      inspection.pulpe,            // DB → UI name
                phreepsPercent:    inspection.phreeps,          // DB → UI name
                harvestingTime:    inspection.harvestingTime,
                generalNotes:      inspection.generalNotes,
                isThroughPartner:  inspection.isThroughPartner,
                partnerName:       inspection.partnerName ?? null,
                photos:            inspection.photos,
                caliper:           inspection.caliper ?? null,
                length:            inspection.length ?? null,
                plotType:          inspection.plotType ?? null,
                greenLeaf:         inspection.greenLeaf ?? null,
                decision:          inspection.decision,
                submittedAt:       inspection.createdAt,
            };
        }

        // Explicitly surface generation so the frontend can read it in the Field Visit Form
        const generationData = enquiry.generation
            ? { _id: enquiry.generation._id, name: enquiry.generation.name }
            : null;

        res.status(200).json({
            ...enquiry,
            generation: generationData,      // explicitly exposed for Field Visit Form
            inspection: inspectionData,      // null when not yet submitted, full object after submission
        });
    } catch (error) {
        console.error('Error fetching field details:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid enquiry ID format' });
        }
        res.status(500).json({ message: 'Server error while fetching field details' });
    }
};

module.exports = {
    getDashboard,
    getAssignedFields,
    getFieldDetails,
};
