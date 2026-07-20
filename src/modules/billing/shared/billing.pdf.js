'use strict';
/**
 * Billing module PDF generator.
 * Generates PDFs via PDFKit, uploads them to S3, and returns the S3 URL.
 * Exports: generateFarmerReceiptPDF, generateCompanyInvoicePDF
 */
const PDFDocument = require('pdfkit');
const { uploadBufferToS3 } = require('./billing.upload');

/**
 * Internal helper — pipes a PDFKit doc into a buffer, uploads to S3, returns URL.
 * @param {Function} drawFn - Receives the PDFDocument and draws content
 * @param {string} s3Key - S3 object key
 * @returns {Promise<string>} S3 URL
 */
const generateAndUpload = (drawFn, s3Key) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const url = await uploadBufferToS3(buffer, s3Key, 'application/pdf');
        resolve(url);
      } catch (err) {
        reject(err);
      }
    });
    doc.on('error', reject);
    drawFn(doc);
    doc.end();
  });

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtCurrency = (n) =>
  n != null ? `₹ ${Number(n).toLocaleString('en-IN')}` : '—';

// ── PDF: Farmer Receipt ───────────────────────────────────────────────────────
/**
 * Generates a farmer payment receipt PDF, uploads to S3, returns URL.
 * @param {Object} bill - FarmerBill document
 * @returns {Promise<string>}
 */
const generateFarmerReceiptPDF = (bill) => {
  const s3Key = `billing-uploads/receipts/receipt-${bill._id}-${Date.now()}.pdf`;
  return generateAndUpload((doc) => {
    const W = doc.page.width - 100; // printable width

    // Header
    doc.rect(50, 40, W, 60).fill('#1e40af');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text('BANANA TRANSPORT', 60, 55, { width: W - 20, align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Farmer Payment Receipt', 60, 80, { width: W - 20, align: 'center' });

    doc.fillColor('#000000');
    let y = 120;

    // Details grid
    const row = (label, value) => {
      doc.fontSize(10).font('Helvetica-Bold').text(label, 60, y);
      doc.fontSize(10).font('Helvetica').text(String(value ?? '—'), 220, y);
      y += 22;
    };

    doc.moveTo(50, y - 5).lineTo(550, y - 5).stroke('#e5e7eb');
    row('Farmer Name:', bill.farmerName);
    row('Date:', fmtDate(bill.date));
    row('Vehicle No:', bill.vehicleNumber || '—');
    row('Packing Type:', bill.packingType);
    row('Boxes:', bill.boxes);
    row('Total Weight:', `${bill.totalWeight} kg`);
    row('Gross Weight:', `${Number(bill.grossWeight).toFixed(3)} kg`);
    row('Wastage:', `${bill.wastage ?? 0} kg`);
    row('Net Weight:', `${bill.netWeight} kg`);
    row('Rate:', fmtCurrency(bill.rate) + '/kg');
    row('Transport:', fmtCurrency(bill.transport));
    row('Initial Amount:', fmtCurrency(bill.initialAmount));
    row('Total Amount (Gross):', fmtCurrency(bill.totalAmount));

    // Net payable highlight
    y += 10;
    doc.rect(50, y, W, 40).fill('#dbeafe');
    doc.fillColor('#1e3a8a').fontSize(14).font('Helvetica-Bold')
      .text('Net Payable Amount:', 60, y + 12)
      .text(fmtCurrency(bill.netPayable), 60, y + 12, { width: W - 20, align: 'right' });

    // Footer
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
      .text(`Generated: ${fmtDate(new Date())}   |   Status: ${bill.status}`, 50, doc.page.height - 60, {
        width: W,
        align: 'center',
      });
  }, s3Key);
};

// ── PDF: Company Invoice ──────────────────────────────────────────────────────
/**
 * Generates a company invoice PDF, uploads to S3, returns URL.
 * @param {Object} bill - CompanyBill document
 * @returns {Promise<string>}
 */
const generateCompanyInvoicePDF = (bill) => {
  const s3Key = `billing-uploads/invoices/invoice-${bill._id}-${Date.now()}.pdf`;
  return generateAndUpload((doc) => {
    const W = doc.page.width - 100;

    // Header
    doc.rect(50, 40, W, 60).fill('#1e40af');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text('BANANA TRANSPORT', 60, 55, { width: W - 20, align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Company Invoice', 60, 80, { width: W - 20, align: 'center' });

    doc.fillColor('#000000');
    let y = 120;

    // Invoice meta
    doc.fontSize(10).font('Helvetica-Bold').text(`Invoice No: ${bill.invoiceNo || '—'}`, 60, y);
    doc.fontSize(10).font('Helvetica').text(`Date: ${fmtDate(bill.date)}`, 350, y);
    y += 30;

    doc.moveTo(50, y).lineTo(550, y).stroke('#e5e7eb');
    y += 15;

    const row = (label, value) => {
      doc.fontSize(10).font('Helvetica-Bold').text(label, 60, y);
      doc.fontSize(10).font('Helvetica').text(String(value ?? '—'), 250, y);
      y += 22;
    };

    row('Company:', bill.companyName);
    row('Farmer:', bill.farmerName);
    row('Vehicle No:', bill.vehicleNumber);
    row('Location:', bill.location || '—');
    row('Packing Type:', bill.packingType);
    row('Boxes:', bill.boxes);
    row('Total Weight:', `${bill.totalWeight} kg`);
    row('Gross Weight:', `${Number(bill.grossWeight).toFixed(3)} kg`);
    row('Rate:', fmtCurrency(bill.rate) + '/kg');
    row('Status:', bill.status);

    // Bill amount highlight
    y += 10;
    doc.rect(50, y, W, 40).fill('#dcfce7');
    doc.fillColor('#14532d').fontSize(14).font('Helvetica-Bold')
      .text('Bill Amount:', 60, y + 12)
      .text(fmtCurrency(bill.billAmount), 60, y + 12, { width: W - 20, align: 'right' });

    // Footer
    doc.fillColor('#6b7280').fontSize(9).font('Helvetica')
      .text(`Generated: ${fmtDate(new Date())}`, 50, doc.page.height - 60, {
        width: W,
        align: 'center',
      });
  }, s3Key);
};

module.exports = { generateFarmerReceiptPDF, generateCompanyInvoicePDF };
