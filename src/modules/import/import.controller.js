const { parse } = require('csv-parse/sync');
const multer = require('multer');

// ── In-memory multer (no disk write — we parse the buffer directly)
const csvUpload = multer({ storage: multer.memoryStorage() }).single('file');

// ── Helper: parse CSV buffer to array of objects
const parseCsv = (buffer) =>
    parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build import summary
// ─────────────────────────────────────────────────────────────────────────────
const buildSummary = (total, imported, skipped, errors, warnings = []) => ({
    message: 'Import complete',
    total,
    imported,
    skipped,
    errors,
    warnings,
});

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Import master data (agents / companies / generations / vehicles / users)
// @route   POST /api/import/master-data?type=agents|companies|generations|vehicles|users
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
const importMasterData = async (req, res) => {
    csvUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err.message });
        if (!req.file) return res.status(400).json({ message: 'No CSV file uploaded. Use field name "file".' });

        const { type } = req.query;
        const allowedTypes = ['agents', 'companies', 'generations', 'vehicles', 'users'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                message: `Invalid type. Use one of: ${allowedTypes.join(', ')}`,
            });
        }

        let rows;
        try {
            rows = parseCsv(req.file.buffer);
        } catch (e) {
            return res.status(400).json({ message: `CSV parse error: ${e.message}` });
        }

        const errors = [];
        let imported = 0;
        let skipped = 0;

        try {
            if (type === 'agents') {
                const Agent = require('../master-data/agent.model');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNum = i + 2; // +2 because row 1 is header
                    if (!row.agentName || !row.mobileNo || !row.contactPerson || !row.location) {
                        errors.push({ row: rowNum, reason: 'Missing required fields: agentName, mobileNo, contactPerson, location' });
                        continue;
                    }
                    const exists = await Agent.findOne({ mobileNo: row.mobileNo });
                    if (exists) { skipped++; continue; }
                    await Agent.create({
                        agentName: row.agentName,
                        mobileNo: row.mobileNo,
                        contactPerson: row.contactPerson,
                        location: row.location,
                        notes: row.notes || '',
                    });
                    imported++;
                }
            }

            else if (type === 'companies') {
                const Company = require('../master-data/company.model');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNum = i + 2;
                    if (!row.companyName || !row.headquarters) {
                        errors.push({ row: rowNum, reason: 'Missing required fields: companyName, headquarters' });
                        continue;
                    }
                    const exists = await Company.findOne({ companyName: new RegExp(`^${row.companyName.trim()}$`, 'i') });
                    if (exists) { skipped++; continue; }
                    await Company.create({
                        companyName: row.companyName,
                        legalName: row.legalName || '',
                        taxId: row.taxId || '',
                        headquarters: row.headquarters,
                        procurementNotes: row.procurementNotes || '',
                    });
                    imported++;
                }
            }

            else if (type === 'generations') {
                const Generation = require('../master-data/generation.model');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNum = i + 2;
                    if (!row.name) {
                        errors.push({ row: rowNum, reason: 'Missing required field: name' });
                        continue;
                    }
                    const exists = await Generation.findOne({ name: new RegExp(`^${row.name.trim()}$`, 'i') });
                    if (exists) { skipped++; continue; }
                    await Generation.create({
                        name: row.name,
                        description: row.description || '',
                    });
                    imported++;
                }
            }

            else if (type === 'vehicles') {
                const Vehicle = require('../master-data/vehicle.model');
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNum = i + 2;
                    if (!row.vehicleNumber || !row.vehicleType) {
                        errors.push({ row: rowNum, reason: 'Missing required fields: vehicleNumber, vehicleType' });
                        continue;
                    }
                    if (!['Eicher', 'Pickup'].includes(row.vehicleType)) {
                        errors.push({ row: rowNum, vehicleNumber: row.vehicleNumber, reason: `vehicleType must be 'Eicher' or 'Pickup', got: '${row.vehicleType}'` });
                        continue;
                    }
                    const exists = await Vehicle.findOne({ vehicleNumber: row.vehicleNumber });
                    if (exists) { skipped++; continue; }
                    await Vehicle.create({
                        vehicleNumber: row.vehicleNumber,
                        vehicleType: row.vehicleType,
                    });
                    imported++;
                }
            }

            else if (type === 'users') {
                const User = require('../users/user.model');
                const validRoles = ['Admin', 'Field Owner', 'Field Selector', 'Operational Manager', 'Munshi', 'driver eicher', 'driver pickup'];
                const DEFAULT_PASSWORD = 'Welcome@123';

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNum = i + 2;
                    if (!row.firstName || !row.lastName || !row.mobileNo || !row.role) {
                        errors.push({ row: rowNum, reason: 'Missing required fields: firstName, lastName, mobileNo, role' });
                        continue;
                    }
                    if (!validRoles.includes(row.role)) {
                        errors.push({ row: rowNum, mobileNo: row.mobileNo, reason: `Invalid role '${row.role}'. Valid: ${validRoles.join(', ')}` });
                        continue;
                    }
                    const exists = await User.findOne({ mobileNo: row.mobileNo });
                    if (exists) { skipped++; continue; }
                    await User.create({
                        firstName: row.firstName,
                        lastName: row.lastName,
                        mobileNo: row.mobileNo,
                        role: row.role,
                        email: row.email || undefined,
                        passwordHash: DEFAULT_PASSWORD, // hashed by pre-save hook
                    });
                    imported++;
                }
            }

            return res.status(200).json(buildSummary(rows.length, imported, skipped, errors));
        } catch (error) {
            console.error('Import master-data error:', error);
            return res.status(500).json({ message: 'Server error during import', error: error.message });
        }
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Import historical enquiry records
// @route   POST /api/import/enquiries
// @access  Admin only
// ─────────────────────────────────────────────────────────────────────────────
const importEnquiries = async (req, res) => {
    csvUpload(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err.message });
        if (!req.file) return res.status(400).json({ message: 'No CSV file uploaded. Use field name "file".' });

        let rows;
        try {
            rows = parseCsv(req.file.buffer);
        } catch (e) {
            return res.status(400).json({ message: `CSV parse error: ${e.message}` });
        }

        const Enquiry     = require('../enquiries/enquiry.model');
        const Generation  = require('../master-data/generation.model');
        const Agent       = require('../master-data/agent.model');
        const Company     = require('../master-data/company.model');
        const User        = require('../users/user.model');

        const validStatuses = ['PENDING', 'SELECTED', 'REJECTED', 'RATE_FIXED', 'RESCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'];
        const validPriorities = ['High', 'Medium', 'Low'];

        const errors = [];
        const warnings = [];
        let imported = 0;
        let skipped = 0;

        try {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowNum = i + 2;
                const rowTag = `Row ${rowNum} (${row.farmerMobile || 'no mobile'})`;

                // ── Required field validation
                const requiredFields = ['farmerFirstName', 'farmerLastName', 'farmerMobile', 'location', 'plantCount', 'generation', 'status', 'fieldOwnerMobile'];
                const missing = requiredFields.filter((f) => !row[f]);
                if (missing.length) {
                    errors.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `Missing required columns: ${missing.join(', ')}` });
                    continue;
                }

                // ── Status validation
                if (!validStatuses.includes(row.status)) {
                    errors.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `Invalid status '${row.status}'` });
                    continue;
                }

                // ── Generation lookup (required)
                const generation = await Generation.findOne({ name: new RegExp(`^${row.generation.trim()}$`, 'i') });
                if (!generation) {
                    errors.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `Generation '${row.generation}' not found — import generations.csv first` });
                    continue;
                }

                // ── Field Owner lookup (required)
                const fieldOwner = await User.findOne({ mobileNo: row.fieldOwnerMobile.trim() });
                if (!fieldOwner) {
                    errors.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `fieldOwnerMobile '${row.fieldOwnerMobile}' not found in Users — import users.csv first` });
                    continue;
                }

                // ── Agent lookup (optional)
                let agentId = null;
                if (row.agentName && row.agentName.trim()) {
                    const agent = await Agent.findOne({ agentName: new RegExp(`^${row.agentName.trim()}$`, 'i') });
                    if (agent) {
                        agentId = agent._id;
                    } else {
                        warnings.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `Agent '${row.agentName}' not found — imported without agent link` });
                    }
                }

                // ── Company lookup (optional, warned if COMPLETED and missing)
                let companyId = null;
                if (row.companyName && row.companyName.trim()) {
                    const company = await Company.findOne({ companyName: new RegExp(`^${row.companyName.trim()}$`, 'i') });
                    if (company) {
                        companyId = company._id;
                    } else {
                        warnings.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `Company '${row.companyName}' not found — imported without company link` });
                    }
                }

                // ── Field Selector lookup (optional)
                let assignedSelectorId = null;
                if (row.fieldSelectorMobile && row.fieldSelectorMobile.trim()) {
                    const selector = await User.findOne({ mobileNo: row.fieldSelectorMobile.trim() });
                    if (selector) {
                        assignedSelectorId = selector._id;
                    } else {
                        warnings.push({ row: rowNum, farmerMobile: row.farmerMobile, reason: `fieldSelectorMobile '${row.fieldSelectorMobile}' not found — imported without selector link` });
                    }
                }

                // ── Duplicate check: same mobile + same scheduledDate
                const dupQuery = { farmerMobile: row.farmerMobile.trim() };
                if (row.scheduledDate) dupQuery.scheduledDate = new Date(row.scheduledDate);
                const duplicate = await Enquiry.findOne(dupQuery);
                if (duplicate) {
                    skipped++;
                    continue;
                }

                // ── Create Enquiry
                await Enquiry.create({
                    enquiryId:         `ENQ-HIST-${Date.now()}-${i}`,
                    farmerFirstName:   row.farmerFirstName,
                    farmerLastName:    row.farmerLastName,
                    farmerMobile:      row.farmerMobile.trim(),
                    location:          row.location,
                    subLocation:       row.subLocation || '',
                    plantCount:        Number(row.plantCount),
                    generation:        generation._id,
                    agentId,
                    agentAttached:     !!agentId,
                    visitPriority:     validPriorities.includes(row.visitPriority) ? row.visitPriority : 'Medium',
                    fieldOwnerId:      fieldOwner._id,
                    assignedSelectorId,
                    status:            row.status,
                    purchaseRate:      row.purchaseRate ? Number(row.purchaseRate) : undefined,
                    packingType:       row.packingType || undefined,
                    estimatedBoxes:    row.estimatedBoxes ? Number(row.estimatedBoxes) : undefined,
                    companyId,
                    scheduledDate:     row.scheduledDate ? new Date(row.scheduledDate) : undefined,
                    remarks:           row.remarks || '',
                    editableUntil:     null, // historical records are permanently locked
                });

                imported++;
            }

            return res.status(200).json(buildSummary(rows.length, imported, skipped, errors, warnings));
        } catch (error) {
            console.error('Import enquiries error:', error);
            return res.status(500).json({ message: 'Server error during enquiry import', error: error.message });
        }
    });
};

module.exports = { importMasterData, importEnquiries };
