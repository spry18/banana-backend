const Farmer = require('./farmer.model');
const PdfService = require('../../services/pdf.service');
const ExcelJS = require('exceljs');
const multer = require('multer');

// Configure multer for memory storage uploads (field name: 'file')
const uploadFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single('file');

// Helpers for clean cell parsing
const getCleanText = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
        if (val.richText) return val.richText.map(t => t.text || '').join('').trim();
        if (val.text) return String(val.text).trim();
        return String(val.result || '').trim();
    }
    return String(val).trim();
};

// @desc    Get all farmers (paginated)
// @route   GET /api/farmers
// @access  Private (Admin, Field Owner)
const getFarmers = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [farmers, total] = await Promise.all([
            Farmer.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Farmer.countDocuments()
        ]);

        res.status(200).json({
            total,
            page,
            pages: Math.ceil(total / limit),
            data: farmers
        });
    } catch (error) {
        console.error('Error fetching farmers:', error);
        res.status(500).json({ message: 'Server error while fetching farmers.', error: error.message });
    }
};

// @desc    Search and filter farmers by name, location, and mobile number
// @route   GET /api/farmers/search
// @access  Private (Admin, Field Owner)
const searchFarmers = async (req, res) => {
    try {
        const { name, location, mobile, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = {};

        if (name) {
            query.name = { $regex: name.trim(), $options: 'i' };
        }
        if (location) {
            query.location = { $regex: location.trim(), $options: 'i' };
        }
        if (mobile) {
            // Match digits only
            const cleanMobile = mobile.trim().replace(/[^0-9]/g, '');
            query.mobile = { $regex: cleanMobile, $options: 'i' };
        }

        const [farmers, total] = await Promise.all([
            Farmer.find(query).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
            Farmer.countDocuments(query)
        ]);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: farmers
        });
    } catch (error) {
        console.error('Error searching farmers:', error);
        res.status(500).json({ message: 'Server error while searching farmers.', error: error.message });
    }
};

// @desc    Import farmer data using Excel (.xlsx) or CSV file
// @route   POST /api/farmers/import
// @access  Private (Admin)
const importFarmers = async (req, res) => {
    uploadFile(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: `Upload error: ${err.message}` });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded. Please upload an Excel (.xlsx) or CSV file using the form-data field "file".' });
        }

        try {
            const workbook = new ExcelJS.Workbook();
            const filename = req.file.originalname.toLowerCase();

            // Load file based on extension
            if (filename.endsWith('.csv')) {
                const { Readable } = require('stream');
                const stream = Readable.from(req.file.buffer);
                await workbook.csv.read(stream);
            } else if (filename.endsWith('.xlsx')) {
                await workbook.xlsx.load(req.file.buffer);
            } else {
                return res.status(400).json({ message: 'Unsupported file format. Please upload a .xlsx Excel sheet or a .csv file.' });
            }

            const worksheet = workbook.worksheets[0];
            if (!worksheet || worksheet.rowCount < 1) {
                return res.status(400).json({ message: 'The uploaded file is empty.' });
            }

            const errors = [];
            let importedCount = 0;
            let updatedCount = 0;

            // Start directly from Row 1 since there is no header row
            for (let i = 1; i <= worksheet.rowCount; i++) {
                const row = worksheet.getRow(i);
                if (!row.values || row.values.length === 0) continue;

                // Explicit column layout: Column 1 = Location, Column 2 = Name, Column 3 = Mobile
                let rawLocation = row.getCell(1).value;
                let rawName = row.getCell(2).value;
                let rawMobile = row.getCell(3).value;

                const locationVal = getCleanText(rawLocation);
                const nameVal = getCleanText(rawName);
                const mobileVal = getCleanText(rawMobile).replace(/[^0-9]/g, ''); // Numeric digits only

                // Skip completely blank rows
                if (!nameVal && !mobileVal && !locationVal) continue;

                // Validate row fields
                if (!nameVal || !mobileVal || !locationVal) {
                    errors.push({ row: i, reason: 'Row has missing fields. Required order: Column 1 (Location), Column 2 (Name), Column 3 (Number).' });
                    continue;
                }

                if (mobileVal.length !== 10) {
                    errors.push({ row: i, name: nameVal, mobile: mobileVal, reason: 'Mobile number must be exactly 10 digits.' });
                    continue;
                }

                try {
                    // Upsert: update name and location if mobile matches, otherwise create
                    const result = await Farmer.findOneAndUpdate(
                        { mobile: mobileVal },
                        { name: nameVal, location: locationVal },
                        { upsert: true, new: true, rawResult: true }
                    );

                    if (result.lastErrorObject && result.lastErrorObject.updatedExisting) {
                        updatedCount++;
                    } else {
                        importedCount++;
                    }
                } catch (dbErr) {
                    errors.push({ row: i, name: nameVal, mobile: mobileVal, reason: dbErr.message });
                }
            }

            res.status(200).json({
                message: 'Farmer data import completed.',
                totalRowsProcessed: worksheet.rowCount,
                imported: importedCount,
                updated: updatedCount,
                errorsCount: errors.length,
                errors: errors.length > 0 ? errors : undefined
            });
        } catch (parseErr) {
            console.error('File parsing error:', parseErr);
            res.status(500).json({ message: 'Failed to process file contents. Make sure it is a valid Excel/CSV document.', error: parseErr.message });
        }
    });
};

// @desc    Export a PDF containing the farmer name, mobile, and location (supports same search/filters)
// @route   GET /api/farmers/export-pdf
// @access  Private (Admin, Field Owner)
const exportFarmersPdf = async (req, res) => {
    try {
        const { name, location, mobile } = req.query;

        const query = {};

        if (name) {
            query.name = { $regex: name.trim(), $options: 'i' };
        }
        if (location) {
            query.location = { $regex: location.trim(), $options: 'i' };
        }
        if (mobile) {
            const cleanMobile = mobile.trim().replace(/[^0-9]/g, '');
            query.mobile = { $regex: cleanMobile, $options: 'i' };
        }

        // Fetch farmers matching the criteria
        const farmers = await Farmer.find(query).sort({ name: 1 }).lean();

        if (farmers.length === 0) {
            return res.status(404).json({ message: 'No farmer records found matching the filter criteria to export.' });
        }

        // Generate PDF
        const docStream = PdfService.generateFarmersPdfStream(farmers);

        // Pipe directly to client response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="vaxtrack-farmers-list.pdf"');

        docStream.pipe(res);
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ message: 'Failed to generate PDF document.', error: error.message });
    }
};

module.exports = {
    getFarmers,
    searchFarmers,
    importFarmers,
    exportFarmersPdf
};
