const mongoose = require('mongoose');

const omKharchiSchema = new mongoose.Schema(
    {
        // Category: Small or Big Kharchi
        category: {
            type: String,
            enum: ['Small', 'Big'],
            required: true,
        },

        // Who issued this kharchi (Logged-in Operational Manager)
        issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        // Date of transfer/expense
        transferDate: {
            type: Date,
            default: Date.now,
        },

        // Amount in INR
        amount: {
            type: Number,
            required: true,
            min: [1, 'Amount must be at least ₹1'],
        },

        // Recipient Name (For Small Kharchi) / Consignee Name (For Big Kharchi)
        recipientName: {
            type: String,
            trim: true,
            default: '',
        },

        // Type selected from dropdown (e.g. Maintenance, Dietary, Operational, etc.)
        type: {
            type: String,
            trim: true,
            default: '',
        },

        // Nature of expense (Pill selected e.g. "Vehicle Puncture", "Breakfast / Lunch / Dinner")
        nature: {
            type: String,
            required: true,
            trim: true,
        },

        // Tag derived from nature (e.g., MAINTENANCE, DIETARY, LOGISTICS, GENERAL)
        tag: {
            type: String,
            trim: true,
            default: 'GENERAL',
        },

        // Detailed description (Nature in Detail)
        natureInDetail: {
            type: String,
            trim: true,
            default: '',
        },

        // Uploaded Image URLs
        billReceiptUrl: {
            type: String,
            default: null,
        },
        paymentReceiptUrl: {
            type: String,
            default: null,
        }, // PhonePe / GPay receipt (Small Kharchi)
        bankDetailsUrl: {
            type: String,
            default: null,
        }, // Bank receipt photo (Big Kharchi)

        // Expense Status
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected', 'Paid'],
            default: 'Pending',
        },

        // Approval Type (Auto for < ₹1000, Manual for >= ₹1000)
        approvalType: {
            type: String,
            enum: ['Auto', 'Manual'],
            default: 'Manual',
        },

        // User who approved (Admin/OM)
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        approvedAt: {
            type: Date,
            default: null,
        },

        // User who rejected
        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },

        remark: {
            type: String,
            trim: true,
            default: '',
        },
    },
    { timestamps: true }
);

omKharchiSchema.index({ category: 1, status: 1 });
omKharchiSchema.index({ issuedBy: 1 });
omKharchiSchema.index({ transferDate: -1 });

module.exports = mongoose.model('OMKharchi', omKharchiSchema);
