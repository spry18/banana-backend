const Inspection = require("./inspection.model");
const Enquiry = require("../enquiries/enquiry.model");
const { getFullUrl } = require("../../utils/urlHelper");
const NotificationService = require("../../services/notification.service");
const { logSystemAction } = require("../../utils/auditLogger");
const { createNotification } = require("../../utils/notificationHelper");
const { broadcastToRole } = require("../../utils/broadcastToRole");

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
      minVolume, // separate integer field (1000–10000)
      maxVolume, // separate integer field (1000–10000)
      recoveryPercent,
      packingSize,
      chellingPercent, // UI name → maps to DB field 'chelling'
      spiklingPercent, // UI name → maps to DB field 'spikling'
      pulpePercent, // UI name → maps to DB field 'pulpe'
      phreepsPercent, // UI name → maps to DB field 'phreeps'
      harvestingTime,
      generalNotes,
      isThroughPartner,
      partnerName,
      decision, // UI sends 'SELECTED' or 'REJECTED'

      // ── NEW FIELDS (Optional) ──
      caliper,
      length,
      plotType,
      greenLeaf,
    } = req.body;

    // ── 2. Backend Validations ──────────────────────────────────────────────────────
    // Backend is the final validation gate — invalid data MUST NOT reach DB
    // even if frontend validation is bypassed.

    // Helper: validates a range string like "10-20"
    const validateRange = (value, minAllowed, maxAllowed, fieldName) => {
      if (value === undefined || value === null || value === "") {
        return null;
      }

      const parts = String(value).split("-");

      if (parts.length !== 2) {
        return `${fieldName} must be in Min-Max format.`;
      }

      const min = Number(parts[0]);
      const max = Number(parts[1]);

      if (
        isNaN(min) ||
        isNaN(max) ||
        min < minAllowed ||
        max > maxAllowed ||
        min > max
      ) {
        return `${fieldName} range must be between ${minAllowed} and ${maxAllowed}.`;
      }

      return null;
    };

    // ──────────────────────────────────────────────────────────────
    // Green Leaf (1 to 9)
    // Example: "6 to 8"
    // ──────────────────────────────────────────────────────────────
    if (greenLeaf !== undefined && greenLeaf !== null && greenLeaf !== "") {
      const parts = String(greenLeaf).split(" to ");

      if (parts.length !== 2) {
        return res.status(400).json({
          message: "greenLeaf must be in 'X to Y' format.",
        });
      }

      const min = Number(parts[0]);
      const max = Number(parts[1]);

      if (isNaN(min) || isNaN(max) || min < 1 || max > 9 || min > max) {
        return res.status(400).json({
          message: "greenLeaf range must be between 1 and 9.",
        });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Recovery (10-99)
    // Example: 45-68
    // ──────────────────────────────────────────────────────────────
    const recoveryError = validateRange(
      recoveryPercent,
      10,
      99,
      "recoveryPercent",
    );

    if (recoveryError) {
      return res.status(400).json({
        message: recoveryError,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Chelling (00-99)
    // Example: 00-00
    // ──────────────────────────────────────────────────────────────
    const chellingError = validateRange(
      chellingPercent,
      0,
      99,
      "chellingPercent",
    );

    if (chellingError) {
      return res.status(400).json({
        message: chellingError,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Spikling (00-99)
    // ──────────────────────────────────────────────────────────────
    const spiklingError = validateRange(
      spiklingPercent,
      0,
      99,
      "spiklingPercent",
    );

    if (spiklingError) {
      return res.status(400).json({
        message: spiklingError,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Pulpe (00-99)
    // ──────────────────────────────────────────────────────────────
    const pulpeError = validateRange(pulpePercent, 0, 99, "pulpePercent");

    if (pulpeError) {
      return res.status(400).json({
        message: pulpeError,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Phreeps (00-99)
    // ──────────────────────────────────────────────────────────────
    const phreepsError = validateRange(phreepsPercent, 0, 99, "phreepsPercent");

    if (phreepsError) {
      return res.status(400).json({
        message: phreepsError,
      });
    }

    // ──────────────────────────────────────────────────────────────
    // Min Volume (100-10000)
    // ──────────────────────────────────────────────────────────────
    if (minVolume !== undefined) {
      const minV = Number(minVolume);

      if (isNaN(minV) || minV < 100 || minV > 10000) {
        return res.status(400).json({
          message: "minVolume must be a numeric value between 100 and 10000.",
        });
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Max Volume (100-10000)
    // ──────────────────────────────────────────────────────────────
    if (maxVolume !== undefined) {
      const maxV = Number(maxVolume);

      if (isNaN(maxV) || maxV < 100 || maxV > 10000) {
        return res.status(400).json({
          message: "maxVolume must be a numeric value between 100 and 10000.",
        });
      }

      if (minVolume !== undefined && Number(maxVolume) < Number(minVolume)) {
        return res.status(400).json({
          message: "maxVolume must be greater than or equal to minVolume.",
        });
      }
    }

    // ── 2. Build photo URL array from uploaded files ──────────────────────
    const photos = req.files ? req.files.map((file) => file.location) : [];

    // ── 3. Map UI decision value → DB enum value ──────────────────────────
    // DB enum is ['APPROVED', 'REJECTED']. UI sends 'SELECTED' or 'REJECTED'.
    let dbDecision;
    if (decision === "SELECTED") {
      dbDecision = "APPROVED";
    } else if (decision === "REJECTED") {
      dbDecision = "REJECTED";
    } else {
      return res
        .status(400)
        .json({ message: "decision must be 'SELECTED' or 'REJECTED'" });
    }

    // ── 4. Verify enquiry exists ──────────────────────────────────────────
    const enquiry = await Enquiry.findById(enquiryId);
    if (!enquiry) {
      return res
        .status(404)
        .json({ message: "Enquiry not found with the provided ID" });
    }

    const selectorId = req.user._id;

    const existing = await Inspection.findOne({ enquiryId });
    if (existing) {
      return res.status(400).json({
        message: "An inspection has already been submitted for this enquiry",
      });
    }

    // ── 5. Save inspection using mapped DB field names ──────────────────────────────
    const inspection = await Inspection.create({
      enquiryId,
      selectorId,
      harvestingStage,
      minVolume: Number(minVolume), // separate integer field
      maxVolume: Number(maxVolume), // separate integer field
      recoveryPercent,
      packingSize,
      chelling: chellingPercent, // UI → DB mapping
      spikling: spiklingPercent, // UI → DB mapping
      pulpe: pulpePercent, // UI → DB mapping
      phreeps: phreepsPercent, // UI → DB mapping
      harvestingTime,
      generalNotes,
      isThroughPartner,
      partnerName,
      photos,
      decision: dbDecision, // 'APPROVED' | 'REJECTED'
      // ── NEW FIELDS (Optional) ──
      caliper,
      length,
      plotType,
      greenLeaf,
    });

    // ── 6. Propagate decision to parent Enquiry ───────────────────────────
    // 'APPROVED' inspection → Enquiry status becomes 'SELECTED' (DB enum value)
    // 'REJECTED' inspection → Enquiry status becomes 'REJECTED'
    if (dbDecision === "APPROVED") {
      enquiry.status = "SELECTED";
    } else {
      enquiry.status = "REJECTED";
    }
    await enquiry.save();

    // Flow 1 — WhatsApp: notify farmer on result
    if (dbDecision === "REJECTED") {
      const contactName = `${req.user.firstName} ${req.user.lastName}`;
      NotificationService.sendInspectionRejected(
        enquiry.farmerMobile,
        contactName,
      );
    } else if (dbDecision === "APPROVED") {
      const contactName = `${req.user.firstName} ${req.user.lastName}`;
      NotificationService.sendFieldSelected(enquiry.farmerMobile, contactName);
    }
    // Flow 2 — In-app: notify Field Owner and all Admins about inspection result
    const notifType =
      dbDecision === "APPROVED" ? "VISIT_SCHEDULED" : "ENQUIRY_REJECTED";
    const notifMessage =
      dbDecision === "APPROVED"
        ? `Plot for farmer ${enquiry.farmerFirstName} ${enquiry.farmerLastName} at ${enquiry.location} has been SELECTED. Ready for rate fixing. Ref: ${enquiry.enquiryId}`
        : `Plot for farmer ${enquiry.farmerFirstName} ${enquiry.farmerLastName} at ${enquiry.location} was REJECTED. Ref: ${enquiry.enquiryId}`;

    // Notify the Field Owner who raised this enquiry
    if (enquiry.fieldOwnerId) {
      await createNotification(
        enquiry.fieldOwnerId,
        notifType,
        notifMessage,
        enquiry._id,
        "Enquiry",
      );
    }

    // Broadcast to all Admins
    await broadcastToRole(
      "Admin",
      notifType,
      notifMessage,
      enquiry._id,
      "Enquiry",
    );

    // ── 8. Audit log ──────────────────────────────────────────────────────
    await logSystemAction(
      req.user._id,
      dbDecision === "APPROVED" ? "APPROVE" : "REJECT",
      "Inspections",
      inspection._id,
      `Inspection ${dbDecision} for Enquiry ${enquiryId}`,
    );

    res.status(201).json(inspection);
  } catch (error) {
    console.error("Error creating inspection:", error);
    if (error.name === "CastError") {
      return res
        .status(400)
        .json({ message: `Invalid ID format for field: ${error.path}` });
    }
    res
      .status(400)
      .json({ message: error.message || "Error creating inspection" });
  }
};

// @desc    Get inspections
// @route   GET /api/inspections
// @access  Protected (Admin, Field Owner, Field Selector, Operational Manager)
const getInspections = async (req, res) => {
  try {
    const inspections = await Inspection.find()
      .populate("enquiryId")
      .populate("selectorId", "firstName lastName mobileNo bikeNumber")
      .lean();

    const data = inspections.map((insp) => {
      if (insp.photos && insp.photos.length > 0) {
        insp.photos = insp.photos.map((p) => getFullUrl(req, p));
      }
      return insp;
    });

    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching inspections:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching inspections" });
  }
};

const getInspectionById = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id)
      .populate("enquiryId")
      .populate("selectorId", "firstName lastName mobileNo bikeNumber");

    if (!inspection) {
      return res.status(404).json({ message: "Inspection not found" });
    }

    const data = inspection.toObject();
    if (data.photos && data.photos.length > 0) {
      data.photos = data.photos.map((p) => getFullUrl(req, p));
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching inspection by ID:", error);
    if (error.name === "CastError") {
      return res
        .status(400)
        .json({ message: `Invalid ID format for field: ${error.path}` });
    }
    res.status(500).json({ message: "Server error while fetching inspection" });
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
      harvestingStage: ["1st", "2nd"],
      packingSize: schema.packingSize.enumValues,
      harvestingTime: schema.harvestingTime.enumValues,
      decision: ["SELECTED", "REJECTED"], // UI-facing values (backend maps internally)
    });
  } catch (error) {
    console.error("Error fetching inspection config:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching inspection config" });
  }
};

module.exports = {
  createInspection,
  getInspections,
  getInspectionById,
  getInspectionConfig,
};
