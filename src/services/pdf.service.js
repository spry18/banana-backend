const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PdfService {
    static generateTripReport(trip) {
        return new Promise((resolve, reject) => {
            try {
                // Ensure directory exists
                const reportsDir = path.join(__dirname, '../../uploads/reports');
                if (!fs.existsSync(reportsDir)) {
                    fs.mkdirSync(reportsDir, { recursive: true });
                }

                const doc = new PDFDocument({ margin: 50 });
                const filename = `trip-report-${trip._id}.pdf`;
                const filePath = path.join(reportsDir, filename);

                const stream = fs.createWriteStream(filePath);
                doc.pipe(stream);

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

                doc.end();

                stream.on('finish', () => {
                    resolve(`/uploads/reports/${filename}`);
                });

                stream.on('error', (err) => {
                    reject(err);
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = PdfService;
