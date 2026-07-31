const express = require('express');
const router = express.Router();
const { getOmDashboard, getOmPlots, rejectPackingReport, approvePackingReport, getApprovedPlots, getPendingAdminApprovalPlots, getPendingApprovalPlots } = require('./om.controller');
const {
    getKharchiList,
    getKharchiById,
    createSmallKharchi,
    createBigKharchi,
    approveKharchi,
    rejectKharchi,
    getPendingKharchi,
    getApprovedKharchi,
} = require('./omKharchi.controller');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');

// Apply protect to all routes
router.use(protect);

// GET /api/operational-manager/dashboard
router.get('/dashboard', authorize('Admin', 'Operational Manager'), getOmDashboard);

// GET /api/operational-manager/plots/approved
router.get('/plots/approved', authorize('Admin', 'Operational Manager'), getApprovedPlots);

// GET /api/operational-manager/plots/pending-approval
router.get('/plots/pending-approval', authorize('Admin', 'Operational Manager'), getPendingApprovalPlots);

// GET /api/operational-manager/plots/pending-admin-approval
router.get('/plots/pending-admin-approval', authorize('Admin', 'Operational Manager'), getPendingAdminApprovalPlots);

// GET /api/operational-manager/plots?stage=Unassigned|Assigned|Complete
router.get('/plots', authorize('Admin', 'Operational Manager'), getOmPlots);

// POST /api/operational-manager/assignments/:assignmentId/reject
router.post('/assignments/:assignmentId/reject', authorize('Admin', 'Operational Manager'), rejectPackingReport);
router.patch('/reject-packing/:assignmentId', authorize('Admin', 'Operational Manager'), rejectPackingReport);
router.post('/reject-packing/:assignmentId', authorize('Admin', 'Operational Manager'), rejectPackingReport);

// POST /api/operational-manager/assignments/:assignmentId/approve
router.post('/assignments/:assignmentId/approve', authorize('Admin', 'Operational Manager'), approvePackingReport);
router.patch('/approve-packing/:assignmentId', authorize('Admin', 'Operational Manager'), approvePackingReport);
router.post('/approve-packing/:assignmentId', authorize('Admin', 'Operational Manager'), approvePackingReport);

// ==================== KHARCHI EXPENSES ROUTES ====================
// GET /api/operational-manager/kharchi?category=Small|Big&status=Pending|Approved&page=1&limit=20
router.get('/kharchi', authorize('Admin', 'Operational Manager'), getKharchiList);

// GET /api/operational-manager/kharchi/pending (Admin queue for expenses requiring manual approval)
router.get('/kharchi/pending', authorize('Admin', 'Operational Manager'), getPendingKharchi);

// GET /api/operational-manager/kharchi/approved (List of approved expenses)
router.get('/kharchi/approved', authorize('Admin', 'Operational Manager'), getApprovedKharchi);

// GET /api/operational-manager/kharchi/:id
router.get('/kharchi/:id', authorize('Admin', 'Operational Manager'), getKharchiById);


// POST /api/operational-manager/kharchi/small (Auto approve if amount < 1000)
router.post(
    '/kharchi/small',
    authorize('Admin', 'Operational Manager'),
    upload.fields([
        { name: 'billReceipt', maxCount: 1 },
        { name: 'paymentReceipt', maxCount: 1 },
    ]),
    createSmallKharchi
);

// POST /api/operational-manager/kharchi/big (Auto approve if amount < 1000)
router.post(
    '/kharchi/big',
    authorize('Admin', 'Operational Manager'),
    upload.fields([
        { name: 'billReceipt', maxCount: 1 },
        { name: 'bankDetails', maxCount: 1 },
    ]),
    createBigKharchi
);

// PATCH or POST /api/operational-manager/kharchi/:id/approve
router.patch('/kharchi/:id/approve', authorize('Admin', 'Operational Manager'), approveKharchi);
router.post('/kharchi/:id/approve', authorize('Admin', 'Operational Manager'), approveKharchi);

// PATCH or POST /api/operational-manager/kharchi/:id/reject
router.patch('/kharchi/:id/reject', authorize('Admin', 'Operational Manager'), rejectKharchi);
router.post('/kharchi/:id/reject', authorize('Admin', 'Operational Manager'), rejectKharchi);

module.exports = router;


