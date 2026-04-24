const Inspection = require('./inspection.model');
const Enquiry = require('../enquiries/enquiry.model');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');

// @desc    Create new inspection
// @route   POST /api/inspections
// @access  Protected (Admin, Field Selector)
//
// ─── ROUTE STRATEGY NOTE ──────────────────────────────────────────────────────
// We intentionally keep this as POST /api/inspections (not POST /api/inspections/:enquiryId)
// because the Admin Postman collection and existing integrations already depend on this URL.
// The enquiryId is sent in the request body instead — which is equally safe and avoids
// breaking any downstream frontend or testing tooling.
// ─────────────────────────────────────────────────────────────────────────────
//
// ─── PAYLOAD MAPPING NOTE ─────────────────────────────────────────────────────
// The Field Selector UI sends field names from the Figma spec.
// The DB schema uses legacy names from the first implementation.
// We map here in the controller so neither schema nor frontend needs to change.
//
//   UI field name        →   DB schema field
//   ─────────────────────────────────────────
//   volumeBox            →   volumeBoxRange
//   chellingPercent      →   chelling
//   spiklingPercent      →   spikling
//   pulpePercent         →   pulpe
//   phreepsPercent       →   phreeps
//   decision: 'SELECTED' →   decision: 'APPROVED'   (and Enquiry.status = 'SELECTED')
//   decision: 'REJECTED' →   decision: 'REJECTED'   (and Enquiry.status = 'REJECTED')
// ─────────────────────────────────────────────────────────────────────────────
const createInspection = async (req, res) => {
    try {
        // ── 1. Destructure using UI field names ───────────────────────────────
        const {
            enquiryId,
            harvestingStage,
            volumeBox,            // UI name → maps to DB field 'volumeBoxRange'
            recoveryPercent,
            packingSize,
            chellingPercent,      // UI name → maps to DB field 'chelling'
            spiklingPercent,      // UI name → maps to DB field 'spikling'
            pulpePercent,         // UI name → maps to DB field 'pulpe'
            phreepsPercent,       // UI name → maps to DB field 'phreeps'
            harvestingTime,
            generalNotes,
            isThroughPartner,
            partnerName,
            decision,             // UI sends 'SELECTED' or 'REJECTED'
            
            // ── NEW FIELDS (Optional) ──
            caliper,
            length,
            plotType,
            greenLeaf,
        } = req.body;

        // ── 2. Build photo URL array from uploaded files ──────────────────────
        const photos = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

        // ── 3. Map UI decision value → DB enum value ──────────────────────────
        // DB enum is ['APPROVED', 'REJECTED']. UI sends 'SELECTED' or 'REJECTED'.
        let dbDecision;
        if (decision === 'SELECTED') {
            dbDecision = 'APPROVED';
        } else if (decision === 'REJECTED') {
            dbDecision = 'REJECTED';
        } else {
            return res.status(400).json({ message: "decision must be 'SELECTED' or 'REJECTED'" });
        }

        // ── 4. Verify enquiry exists ──────────────────────────────────────────
        const enquiry = await Enquiry.findById(enquiryId);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found with the provided ID' });
        }

        const selectorId = req.user._id;

        const existing = await Inspection.findOne({ enquiryId });
        if (existing) {
            return res.status(400).json({ message: 'An inspection has already been submitted for this enquiry' });
        }

        // ── 5. Save inspection using mapped DB field names ────────────────────
        const inspection = await Inspection.create({
            enquiryId,
            selectorId,
            harvestingStage,
            volumeBoxRange: volumeBox,           // UI → DB mapping
            recoveryPercent,
            packingSize,
            chelling: chellingPercent,      // UI → DB mapping
            spikling: spiklingPercent,      // UI → DB mapping
            pulpe: pulpePercent,         // UI → DB mapping
            phreeps: phreepsPercent,       // UI → DB mapping
            harvestingTime,
            generalNotes,
            isThroughPartner,
            partnerName,
            photos,
            decision: dbDecision,           // 'APPROVED' | 'REJECTED'
            // ── NEW FIELDS (Optional) ──
            caliper,
            length,
            plotType,
            greenLeaf,
        });

        // ── 6. Propagate decision to parent Enquiry ───────────────────────────
        // 'APPROVED' inspection → Enquiry status becomes 'SELECTED' (DB enum value)
        // 'REJECTED' inspection → Enquiry status becomes 'REJECTED'
        if (dbDecision === 'APPROVED') {
            enquiry.status = 'SELECTED';
        } else {
            enquiry.status = 'REJECTED';
        }
        await enquiry.save();

        // ── 7. Fire notification on rejection ────────────────────────────────
        if (dbDecision === 'REJECTED') {
            NotificationService.sendInspectionRejected(enquiry.farmerMobile, enquiry.farmerFirstName);
        }

        // ── 8. Audit log ──────────────────────────────────────────────────────
        await logSystemAction(
            req.user._id,
            dbDecision === 'APPROVED' ? 'APPROVE' : 'REJECT',
            'Inspections',
            inspection._id,
            `Inspection ${dbDecision} for Enquiry ${enquiryId}`
        );

        res.status(201).json(inspection);
    } catch (error) {
        console.error('Error creating inspection:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(400).json({ message: error.message || 'Error creating inspection' });
    }
};

// @desc    Get inspections
// @route   GET /api/inspections
// @access  Protected (Admin, Field Owner, Field Selector, Operational Manager)
const getInspections = async (req, res) => {
    try {
        const inspections = await Inspection.find()
            .populate('enquiryId')
            .populate('selectorId', 'firstName lastName mobileNo');

        res.status(200).json(inspections);
    } catch (error) {
        console.error('Error fetching inspections:', error);
        res.status(500).json({ message: 'Server error while fetching inspections' });
    }
};

const getInspectionById = async (req, res) => {
    try {
        const inspection = await Inspection.findById(req.params.id)
            .populate('enquiryId')
            .populate('selectorId', 'firstName lastName mobileNo');

        if (!inspection) {
            return res.status(404).json({ message: 'Inspection not found' });
        }
        res.status(200).json(inspection);
    } catch (error) {
        console.error('Error fetching inspection by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching inspection' });
    }
};

// @desc    Get inspection form config (dropdown options)
// @route   GET /api/inspections/config
// @access  Protected (Field Selector, Admin)
//
// Reads enum values directly from the Mongoose schema so the config
// is always in sync with the model — no hardcoding needed here.
const getInspectionConfig = (req, res) => {
    try {
        const schema = Inspection.schema.paths;

        res.status(200).json({
            harvestingStage: ['1st', '2nd'],
            packingSize: schema.packingSize.enumValues,
            harvestingTime: schema.harvestingTime.enumValues,
            decision: ['SELECTED', 'REJECTED'], // UI-facing values (backend maps internally)
        });
    } catch (error) {
        console.error('Error fetching inspection config:', error);
        res.status(500).json({ message: 'Server error while fetching inspection config' });
    }
};

module.exports = {
    createInspection,
    getInspections,
    getInspectionById,
    getInspectionConfig,
};
