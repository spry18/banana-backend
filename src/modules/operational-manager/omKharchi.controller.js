const OMKharchi = require('./omKharchi.model');

// Helper to determine tag from nature if not explicitly passed
const resolveTagFromNature = (nature = '', providedTag = '') => {
    if (providedTag && providedTag.trim()) return providedTag.trim().toUpperCase();

    const n = nature.toLowerCase();
    if (n.includes('breakfast') || n.includes('lunch') || n.includes('dinner') || n.includes('dietary')) {
        return 'DIETARY';
    }
    if (n.includes('puncture') || n.includes('maintenance') || n.includes('repair')) {
        return 'MAINTENANCE';
    }
    if (n.includes('loading') || n.includes('unloading') || n.includes('fastag') || n.includes('weight')) {
        return 'LOGISTICS';
    }
    return 'GENERAL';
};

// @desc    Get Kharchi expenses list (paginated, filterable by category, status, search)
// @route   GET /api/operational-manager/kharchi
// @access  Protected (Admin, Operational Manager)
const getKharchiList = async (req, res) => {
    try {
        const { category = 'Small', status, search = '', page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { category };

        if (status) {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { recipientName: { $regex: search, $options: 'i' } },
                { nature: { $regex: search, $options: 'i' } },
                { natureInDetail: { $regex: search, $options: 'i' } },
                { type: { $regex: search, $options: 'i' } },
            ];
        }

        const [kharchis, total] = await Promise.all([
            OMKharchi.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('issuedBy', 'firstName lastName mobileNo role')
                .populate('approvedBy', 'firstName lastName role')
                .lean(),
            OMKharchi.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data: kharchis,
        });
    } catch (error) {
        console.error('Error fetching OM Kharchi list:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching Kharchi list', error: error.message });
    }
};

// @desc    Get single Kharchi record by ID
// @route   GET /api/operational-manager/kharchi/:id
// @access  Protected (Admin, Operational Manager)
const getKharchiById = async (req, res) => {
    try {
        const kharchi = await OMKharchi.findById(req.params.id)
            .populate('issuedBy', 'firstName lastName mobileNo role')
            .populate('approvedBy', 'firstName lastName role')
            .lean();

        if (!kharchi) {
            return res.status(404).json({ success: false, message: 'Kharchi record not found' });
        }

        res.status(200).json({ success: true, data: kharchi });
    } catch (error) {
        console.error('Error fetching OM Kharchi by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Invalid ID format' });
        }
        res.status(500).json({ success: false, message: 'Server error while fetching Kharchi details', error: error.message });
    }
};

// @desc    Create Small Kharchi (Auto-approve if amount < 1000)
// @route   POST /api/operational-manager/kharchi/small
// @access  Protected (Admin, Operational Manager)
const createSmallKharchi = async (req, res) => {
    try {
        const {
            transferDate,
            amount,
            recipientName,
            transferTo, // fallback alias from frontend
            type,
            nature,
            tag: userTag,
            natureInDetail,
            remark,
        } = req.body;

        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid amount greater than ₹0 is required' });
        }
        if (!nature) {
            return res.status(400).json({ success: false, message: 'Nature of expense is required' });
        }

        // Extract uploaded files if any
        let billReceiptUrl = null;
        let paymentReceiptUrl = null;

        if (req.files) {
            if (req.files.billReceipt && req.files.billReceipt[0]) {
                billReceiptUrl = req.files.billReceipt[0].location || req.files.billReceipt[0].path;
            }
            if (req.files.paymentReceipt && req.files.paymentReceipt[0]) {
                paymentReceiptUrl = req.files.paymentReceipt[0].location || req.files.paymentReceipt[0].path;
            }
        } else if (req.file) {
            billReceiptUrl = req.file.location || req.file.path;
        }

        // Auto-approval logic: amount < 1000 auto-approved
        const isAutoApproved = numAmount < 1000;
        const finalTag = resolveTagFromNature(nature, userTag);

        const kharchi = await OMKharchi.create({
            category: 'Small',
            issuedBy: req.user._id,
            transferDate: transferDate ? new Date(transferDate) : new Date(),
            amount: numAmount,
            recipientName: recipientName || transferTo || '',
            type: type || 'Small Expenses',
            nature,
            tag: finalTag,
            natureInDetail: natureInDetail || '',
            billReceiptUrl,
            paymentReceiptUrl,
            status: isAutoApproved ? 'Approved' : 'Pending',
            approvalType: isAutoApproved ? 'Auto' : 'Manual',
            approvedAt: isAutoApproved ? new Date() : null,
            approvedBy: isAutoApproved ? req.user._id : null,
            remark: remark || '',
        });

        res.status(201).json({
            success: true,
            message: isAutoApproved
                ? 'Small Kharchi created and auto-approved (< ₹1,000)'
                : 'Small Kharchi created and sent for Admin approval (≥ ₹1,000)',
            data: kharchi,
        });
    } catch (error) {
        console.error('Error creating Small Kharchi:', error);
        res.status(500).json({ success: false, message: 'Server error while creating Small Kharchi', error: error.message });
    }
};

// @desc    Create Big Kharchi (Auto-approve if amount < 1000)
// @route   POST /api/operational-manager/kharchi/big
// @access  Protected (Admin, Operational Manager)
const createBigKharchi = async (req, res) => {
    try {
        const {
            transferDate,
            amount,
            consigneeName,
            recipientName,
            type,
            nature,
            tag: userTag,
            natureInDetail,
            remark,
        } = req.body;

        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid amount greater than ₹0 is required' });
        }
        if (!nature) {
            return res.status(400).json({ success: false, message: 'Nature of expense is required' });
        }

        // Extract uploaded files if any
        let billReceiptUrl = null;
        let bankDetailsUrl = null;

        if (req.files) {
            if (req.files.billReceipt && req.files.billReceipt[0]) {
                billReceiptUrl = req.files.billReceipt[0].location || req.files.billReceipt[0].path;
            }
            if (req.files.bankDetails && req.files.bankDetails[0]) {
                bankDetailsUrl = req.files.bankDetails[0].location || req.files.bankDetails[0].path;
            }
        } else if (req.file) {
            billReceiptUrl = req.file.location || req.file.path;
        }

        // Auto-approval logic: amount < 1000 auto-approved
        const isAutoApproved = numAmount < 1000;
        const finalTag = resolveTagFromNature(nature, userTag);

        const kharchi = await OMKharchi.create({
            category: 'Big',
            issuedBy: req.user._id,
            transferDate: transferDate ? new Date(transferDate) : new Date(),
            amount: numAmount,
            recipientName: consigneeName || recipientName || '',
            type: type || 'Big Expenses',
            nature,
            tag: finalTag,
            natureInDetail: natureInDetail || '',
            billReceiptUrl,
            bankDetailsUrl,
            status: isAutoApproved ? 'Approved' : 'Pending',
            approvalType: isAutoApproved ? 'Auto' : 'Manual',
            approvedAt: isAutoApproved ? new Date() : null,
            approvedBy: isAutoApproved ? req.user._id : null,
            remark: remark || '',
        });

        res.status(201).json({
            success: true,
            message: isAutoApproved
                ? 'Big Kharchi created and auto-approved (< ₹1,000)'
                : 'Big Kharchi created and pending Admin approval (≥ ₹1,000)',
            data: kharchi,
        });
    } catch (error) {
        console.error('Error creating Big Kharchi:', error);
        res.status(500).json({ success: false, message: 'Server error while creating Big Kharchi', error: error.message });
    }
};

// @desc    Approve a Kharchi record
// @route   PATCH /api/operational-manager/kharchi/:id/approve
// @access  Protected (Admin, Operational Manager)
const approveKharchi = async (req, res) => {
    try {
        const kharchi = await OMKharchi.findByIdAndUpdate(
            req.params.id,
            {
                status: 'Approved',
                approvedBy: req.user._id,
                approvedAt: new Date(),
            },
            { new: true }
        );

        if (!kharchi) {
            return res.status(404).json({ success: false, message: 'Kharchi record not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Kharchi expense approved successfully',
            data: kharchi,
        });
    } catch (error) {
        console.error('Error approving OM Kharchi:', error);
        res.status(500).json({ success: false, message: 'Server error while approving Kharchi', error: error.message });
    }
};

// @desc    Reject a Kharchi record
// @route   PATCH /api/operational-manager/kharchi/:id/reject
// @access  Protected (Admin, Operational Manager)
const rejectKharchi = async (req, res) => {
    try {
        const kharchi = await OMKharchi.findByIdAndUpdate(
            req.params.id,
            {
                status: 'Rejected',
                rejectedBy: req.user._id,
                rejectedAt: new Date(),
            },
            { new: true }
        );

        if (!kharchi) {
            return res.status(404).json({ success: false, message: 'Kharchi record not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Kharchi expense rejected',
            data: kharchi,
        });
    } catch (error) {
        console.error('Error rejecting OM Kharchi:', error);
        res.status(500).json({ success: false, message: 'Server error while rejecting Kharchi', error: error.message });
    }
};

// @desc    Get pending Kharchi expenses for Admin approval (status = 'Pending')
// @route   GET /api/operational-manager/kharchi/pending (or /api/admin/kharchi/pending)
// @access  Protected (Admin, Operational Manager)
const getPendingKharchi = async (req, res) => {
    try {
        const { category, search = '', page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { status: 'Pending' };
        if (category) query.category = category;

        if (search) {
            query.$or = [
                { recipientName: { $regex: search, $options: 'i' } },
                { nature: { $regex: search, $options: 'i' } },
                { natureInDetail: { $regex: search, $options: 'i' } },
                { type: { $regex: search, $options: 'i' } },
            ];
        }

        const [data, total] = await Promise.all([
            OMKharchi.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('issuedBy', 'firstName lastName mobileNo role')
                .lean(),
            OMKharchi.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });
    } catch (error) {
        console.error('Error fetching pending Kharchi:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching pending Kharchi', error: error.message });
    }
};

// @desc    Get approved Kharchi expenses (status = 'Approved')
// @route   GET /api/operational-manager/kharchi/approved (or /api/admin/kharchi/approved)
// @access  Protected (Admin, Operational Manager)
const getApprovedKharchi = async (req, res) => {
    try {
        const { category, approvalType, search = '', page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const query = { status: 'Approved' };
        if (category) query.category = category;
        if (approvalType) query.approvalType = approvalType;

        if (search) {
            query.$or = [
                { recipientName: { $regex: search, $options: 'i' } },
                { nature: { $regex: search, $options: 'i' } },
                { natureInDetail: { $regex: search, $options: 'i' } },
                { type: { $regex: search, $options: 'i' } },
            ];
        }

        const [data, total] = await Promise.all([
            OMKharchi.find(query)
                .sort({ approvedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('issuedBy', 'firstName lastName mobileNo role')
                .populate('approvedBy', 'firstName lastName role')
                .lean(),
            OMKharchi.countDocuments(query),
        ]);

        res.status(200).json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });
    } catch (error) {
        console.error('Error fetching approved Kharchi:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching approved Kharchi', error: error.message });
    }
};

module.exports = {
    getKharchiList,
    getKharchiById,
    createSmallKharchi,
    createBigKharchi,
    approveKharchi,
    rejectKharchi,
    getPendingKharchi,
    getApprovedKharchi,
};

