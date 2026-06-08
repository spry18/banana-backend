const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
require('dotenv').config();

// Initialize S3 Client safely
const s3Config = {
    region: process.env.AWS_REGION || 'ap-south-1',
};
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
}
const s3 = new S3Client(s3Config);

class PdfService {
    static generateTripReport(trip) {
        return new Promise(async (resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const filename = `uploads/reports/trip-report-${trip._id}-${Date.now()}.pdf`;
                
                // Use a PassThrough stream instead of generating a file locally
                const passThrough = new PassThrough();
                doc.pipe(passThrough);

                // Add content
                doc.fontSize(20).font('Helvetica-Bold').text('VaxTrack - Official Trip Report', { align: 'center' });
                doc.moveDown();
                doc.fontSize(12).font('Helvetica');
                doc.text(`Trip ID: ${trip._id}`);
                doc.text(`Assignment ID: ${trip.assignmentId}`);
                doc.text(`Total KM: ${trip.totalKm}`);
                doc.text(`Toll Expense: Rs. ${trip.tollExpense}`);
                doc.moveDown();
                doc.text(`Generated On: ${new Date().toLocaleString()}`);

                // Finish creating the PDF document
                doc.end();

                // Stream the PDF directly to AWS S3
                const upload = new Upload({
                    client: s3,
                    params: {
                        Bucket: process.env.AWS_S3_BUCKET_NAME || 'fallback-bucket-name',
                        Key: filename,
                        Body: passThrough,
                        ContentType: 'application/pdf',
                    },
                });

                upload.done()
                    .then((response) => {
                        resolve(response.Location);
                    })
                    .catch((err) => {
                        reject(err);
                    });
            } catch (error) {
                reject(error);
            }
        });
    }

    static generateFarmersPdfStream(farmers) {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        let currentY = 30;
        farmers.forEach((farmer, idx) => {
            // Check for page break (A4 height 842 - margin 30 = 812 max, using 790 safety margin)
            if (currentY + 25 > 790) {
                doc.addPage();
                currentY = 30;
            }

            // Draw alternating row background for clean structure
            if (idx % 2 === 1) {
                doc.fillColor('#F9FAFB').rect(30, currentY, 535, 25).fill();
            }

            // Draw thin bottom border
            doc.strokeColor('#F3F4F6').lineWidth(0.5).moveTo(30, currentY + 25).lineTo(565, currentY + 25).stroke();

            // Render columns: Location, Name, Mobile
            doc.fillColor('#374151').font('Helvetica').fontSize(9);
            
            // Col 1: Location (width: 170 pt)
            doc.text(farmer.location, 35, currentY + 8, { width: 160, ellipsis: true, lineBreak: false });
            
            // Col 2: Name (width: 220 pt)
            doc.text(farmer.name, 210, currentY + 8, { width: 210, ellipsis: true, lineBreak: false });
            
            // Col 3: Mobile (width: 135 pt)
            doc.text(farmer.mobile, 435, currentY + 8, { width: 125, ellipsis: true, lineBreak: false });

            currentY += 25;
        });

        // Finalize document
        doc.end();
        return doc;
    }
}

module.exports = PdfService;
