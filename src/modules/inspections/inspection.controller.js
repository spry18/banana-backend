const Inspection = require('./inspection.model');
const Enquiry = require('../enquiries/enquiry.model');
const { getFullUrl } = require('../../utils/urlHelper');
const NotificationService = require('../../services/notification.service');
const { logSystemAction } = require('../../utils/auditLogger');
const { createNotification } = require('../../utils/notificationHelper');
const { broadcastToRole } = require('../../utils/broadcastToRole');

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
//   ────────────────────────────────────────────
//   minVolume            →   minVolume          (Number, 1000–10000)
//   maxVolume            →   maxVolume          (Number, 1000–10000)
//   chellingPercent      →   chelling
//   spiklingPercent      →   spikling
//   pulpePercent         →   pulpe
//   phreepsPercent       →   phreeps
//   decision: 'SELECTED' →   decision: 'APPROVED'   (and Enquiry.status = 'SELECTED')
//   decision: 'REJECTED' →   decision: 'REJECTED'   (and Enquiry.status = 'REJECTED')
// ─────────────────────────────────────────────────────────────────────────────
const createInspection = async (req, res) => {
    try {
        // ── 1. Destructure using UI field names ──────────────────────────────────────
        const {
            enquiryId,
            harvestingStage,
            minVolume,            // separate integer field (1000–10000)
            maxVolume,            // separate integer field (1000–10000)
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

        // ── 2. Backend Validations ──────────────────────────────────────────────────────
        // Backend is the final validation gate — invalid data MUST NOT reach DB
        // even if frontend validation is bypassed.

        const _isInt = (v) => Number.isInteger(Number(v)) && !isNaN(Number(v)) && !/[a-zA-Z]/.test(String(v));

        // Green Leaf: 1–9 (single digit, numeric only)
        if (greenLeaf !== undefined && greenLeaf !== null && greenLeaf !== '') {
            const gl = Number(greenLeaf);
            if (!_isInt(greenLeaf) || gl < 1 || gl > 9) {
                return res.status(400).json({ message: 'greenLeaf must be a numeric value between 1 and 9.' });
            }
        }

        // Recovery: 10–99 (2-digit, numeric only)
        if (recoveryPercent !== undefined) {
            const rp = Number(recoveryPercent);
            if (!_isInt(recoveryPercent) || rp < 10 || rp > 99) {
                return res.status(400).json({ message: 'recoveryPercent must be a numeric value between 10 and 99.' });
            }
        }

        // Chelling: 2-digit numeric only (10–99)
        if (chellingPercent !== undefined) {
            const cp = Number(chellingPercent);
            if (!_isInt(chellingPercent) || cp < 10 || cp > 99) {
                return res.status(400).json({ message: 'chellingPercent must be a 2-digit numeric value (10–99). Letters are not allowed.' });
            }
        }

        // Spikling: 2-digit numeric only (10–99)
        if (spiklingPercent !== undefined) {
            const sp = Number(spiklingPercent);
            if (!_isInt(spiklingPercent) || sp < 10 || sp > 99) {
                return res.status(400).json({ message: 'spiklingPercent must be a 2-digit numeric value (10–99). Letters are not allowed.' });
            }
        }

        // Pulpe: 2-digit numeric only (10–99)
        if (pulpePercent !== undefined) {
            const pp = Number(pulpePercent);
            if (!_isInt(pulpePercent) || pp < 10 || pp > 99) {
                return res.status(400).json({ message: 'pulpePercent must be a 2-digit numeric value (10–99). Letters are not allowed.' });
            }
        }

        // Phreeps (Threeps): 2-digit numeric only (10–99)
        if (phreepsPercent !== undefined) {
            const php = Number(phreepsPercent);
            if (!_isInt(phreepsPercent) || php < 10 || php > 99) {
                return res.status(400).json({ message: 'phreepsPercent must be a 2-digit numeric value (10–99). Letters are not allowed.' });
            }
        }

        // Min Volume: numeric, 1000–10000
        if (minVolume !== undefined) {
            const minV = Number(minVolume);
            if (isNaN(minV) || minV < 1000 || minV > 10000) {
                return res.status(400).json({ message: 'minVolume must be a numeric value between 1000 and 10000.' });
            }
        }

        // Max Volume: numeric, 1000–10000, and must be >= minVolume
        if (maxVolume !== undefined) {
            const maxV = Number(maxVolume);
            if (isNaN(maxV) || maxV < 1000 || maxV > 10000) {
                return res.status(400).json({ message: 'maxVolume must be a numeric value between 1000 and 10000.' });
            }
            if (minVolume !== undefined && Number(maxVolume) < Number(minVolume)) {
                return res.status(400).json({ message: 'maxVolume must be greater than or equal to minVolume.' });
            }
        }

        // ── 2. Build photo URL array from uploaded files ──────────────────────
        const photos = req.files ? req.files.map(file => file.location) : [];

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

        // ── 5. Save inspection using mapped DB field names ──────────────────────────────
        const inspection = await Inspection.create({
            enquiryId,
            selectorId,
            harvestingStage,
            minVolume: Number(minVolume),     // separate integer field
            maxVolume: Number(maxVolume),     // separate integer field
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

        // Flow 1 — WhatsApp: notify farmer on result
        if (dbDecision === 'REJECTED') {
            const contactName = `${req.user.firstName} ${req.user.lastName}`;
            NotificationService.sendInspectionRejected(enquiry.farmerMobile, contactName);
        } else if (dbDecision === 'APPROVED') {
            const contactName = `${req.user.firstName} ${req.user.lastName}`;
            NotificationService.sendFieldSelected(enquiry.farmerMobile, contactName);
        }
        // Flow 2 — In-app: notify Field Owner and all Admins about inspection result
        const notifType    = dbDecision === 'APPROVED' ? 'VISIT_SCHEDULED'  : 'ENQUIRY_REJECTED';
        const notifMessage = dbDecision === 'APPROVED'
            ? `Plot for farmer ${enquiry.farmerFirstName} ${enquiry.farmerLastName} at ${enquiry.location} has been SELECTED. Ready for rate fixing. Ref: ${enquiry.enquiryId}`
            : `Plot for farmer ${enquiry.farmerFirstName} ${enquiry.farmerLastName} at ${enquiry.location} was REJECTED. Ref: ${enquiry.enquiryId}`;

        // Notify the Field Owner who raised this enquiry
        if (enquiry.fieldOwnerId) {
            await createNotification(enquiry.fieldOwnerId, notifType, notifMessage, enquiry._id, 'Enquiry');
        }

        // Broadcast to all Admins
        await broadcastToRole('Admin', notifType, notifMessage, enquiry._id, 'Enquiry');

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
            .populate('selectorId', 'firstName lastName mobileNo')
            .lean();

        const data = inspections.map(insp => {
            if (insp.photos && insp.photos.length > 0) {
                insp.photos = insp.photos.map(p => getFullUrl(req, p));
            }
            return insp;
        });

        res.status(200).json(data);
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
        
        const data = inspection.toObject();
        if (data.photos && data.photos.length > 0) {
            data.photos = data.photos.map(p => getFullUrl(req, p));
        }
        
        res.status(200).json(data);
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
