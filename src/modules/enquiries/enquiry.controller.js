const mongoose = require('mongoose');
const Enquiry = require('./enquiry.model');
const User = require('../users/user.model');
const Agent = require('../master-data/agent.model');
const Farmer = require('../farmers/farmer.model');
const { logSystemAction } = require('../../utils/auditLogger');
const NotificationService = require('../../services/notification.service');
const { checkAndResetExpiredEnquiries } = require('../../utils/enquiryService');
const { createNotification } = require('../../utils/notificationHelper');
const { broadcastToRole } = require('../../utils/broadcastToRole');

// @desc    Create new enquiry
// @route   POST /api/enquiries
// @access  Protected
const createEnquiry = async (req, res) => {
    try {
        console.log("=== CREATE ENQUIRY CONTROLLER HIT ===");
        console.log(req.body);
        const {
            farmerFirstName,
            farmerLastName,
            farmerMobile,
            location,
            subLocation,
            plantCount,
            generation,
            agentId,
            agentAttached,
            visitPriority,
            assignedSelectorId,
        } = req.body;

        // ── Assignment Card is OPTIONAL ──────────────────────────────────────
        // Validate selector only if provided
        let selector = null;
        let sanitizedSelectorId = assignedSelectorId;
        
        if (
            assignedSelectorId === null ||
            assignedSelectorId === 'null' ||
            assignedSelectorId === 'undefined' ||
            (typeof assignedSelectorId === 'string' && assignedSelectorId.trim() === '')
        ) {
            sanitizedSelectorId = null;
        }

        if (sanitizedSelectorId) {
            if (typeof sanitizedSelectorId === 'string' && mongoose.Types.ObjectId.isValid(sanitizedSelectorId)) {
                selector = await User.findById(sanitizedSelectorId);
                if (!selector) {
                    return res.status(404).json({ message: 'Assigned Selector not found with the provided ID' });
                }
                if (selector.role !== 'Field Selector') {
                    return res.status(400).json({ message: 'Invalid Role: Assigned user must be a Field Selector' });
                }
            } else {
                return res.status(400).json({ message: 'Invalid ID format for Assigned Selector' });
            }
        }

        if (agentId && agentId.trim() !== "") {
            const agent = await Agent.findById(agentId);
            if (!agent) {
                return res.status(404).json({ message: 'Agent not found with the provided ID' });
            }
        }

        // Automatically generate an enquiryId
        const enquiryId = `ENQ-${Date.now()}`;

        // Set fieldOwnerId to logged-in user
        const fieldOwnerId = req.user._id;

        // Calculate editableUntil (exactly 24 hours from current time)
        const editableUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const enquiry = await Enquiry.create({
            enquiryId,
            farmerFirstName,
            farmerLastName,
            farmerMobile,
            location,
            subLocation,
            plantCount,
            generation,
            agentId: (agentId && agentId.trim() !== "") ? agentId : null,
            agentAttached: agentAttached ?? false,
            visitPriority: visitPriority || 'Medium',
            fieldOwnerId,
            assignedSelectorId: selector ? sanitizedSelectorId : null,
            status: selector ? 'ASSIGNED' : 'PENDING',
            editableUntil,
        });

        // Sync to master Farmer collection
        try {
            const farmerNameStr = `${farmerFirstName} ${farmerLastName}`.trim();
            await Farmer.findOneAndUpdate(
                { mobile: farmerMobile },
                { name: farmerNameStr, location: location },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (farmerErr) {
            console.error('Failed to sync created farmer to master collection:', farmerErr.message);
        }

        // Flow 1 — WhatsApp: notify farmer that enquiry is received
        NotificationService.sendEnquiryReceived(enquiry.farmerMobile, enquiry.farmerFirstName, enquiry.enquiryId);

        // Flow 1b — WhatsApp: if selector assigned, notify farmer + selector
        if (selector) {
            const selectorFullName = `${selector.firstName} ${selector.lastName}`;
            // Notify farmer: visit will be scheduled by the selector
            NotificationService.sendVisitScheduled(enquiry.farmerMobile, selectorFullName, selector.mobileNo);
            // Notify selector: they have been assigned to this plot
            NotificationService.sendSelectorAssigned(selector.mobileNo, enquiry.farmerFirstName, enquiry.farmerLastName, enquiry.location, enquiry.enquiryId);
        }

        // Flow 2 — In-app: notify the assigned Field Selector (only if assigned)
        const farmerName = `${farmerFirstName} ${farmerLastName}`;
        // Flow 2 — In-app: notify the assigned Field Selector and Field Owner
        if (selector) {
            const selectorMsg = `Field Selector assigned for farmer ${farmerName} at ${location}.`;
            await createNotification(
                sanitizedSelectorId,
                'FIELD_SELECTOR_ASSIGNED',
                selectorMsg,
                enquiry._id,
                'Enquiry'
            );
            await createNotification(
                fieldOwnerId,
                'FIELD_SELECTOR_ASSIGNED',
                selectorMsg,
                enquiry._id,
                'Enquiry'
            );
        }

        // Flow 2 — In-app: notify all Admins and the Field Owner
        const createdMsg = `New enquiry created for farmer ${farmerName} at ${location}.`;
        await createNotification(
            fieldOwnerId,
            'ENQUIRY_CREATED',
            createdMsg,
            enquiry._id,
            'Enquiry'
        );
        await broadcastToRole(
            'Admin',
            'ENQUIRY_CREATED',
            createdMsg,
            enquiry._id,
            'Enquiry'
        );

        await logSystemAction(req.user._id, 'CREATE', 'Enquiries', enquiry._id, 'Created a new farmer enquiry');

        res.status(201).json(enquiry);
    } catch (error) {
        console.error('Error creating enquiry:', error);
        res.status(400).json({ message: error.message || 'Error creating enquiry' });
    }
};

// @desc    Get enquiries
// @route   GET /api/enquiries
// @access  Protected
const getEnquiries = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, location, date, fieldOwnerId, selectorId, dateFrom, dateTo } = req.query;
        const skip = (page - 1) * limit;

        let query = {};

        if (req.user.role === 'Admin' || req.user.role === 'Field Owner') {
            // Admin and Field Owner (Global Shared Pool) see all enquiries
            query = {};
        } else {
            // Other roles: deny access
            query = { _id: null };
        }

        if (fieldOwnerId) {
            query.fieldOwnerId = fieldOwnerId;
        }

        if (selectorId) {
            query.assignedSelectorId = selectorId;
        }

        if (status) {
            const statusUpper = status.toUpperCase();
            if (statusUpper === 'MISSED') {
                // 'Missed' = past scheduledDate but still PENDING (never visited)
                query.scheduledDate = { $lt: new Date() };
                query.status = 'PENDING';
            } else if (statusUpper === 'UNASSIGNED') {
                query.assignedSelectorId = null;
            } else {
                const statuses = status.split(',').map(s => s.trim().toUpperCase());
                query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
            }
        }

        if (req.query.logisticsStatus) {
            const Logistics = require('../logistics/logistics.model');
            const lStatus = req.query.logisticsStatus.toUpperCase();
            let arr = [];
            if (lStatus === 'ASSIGNED') arr = ['PENDING'];
            else if (lStatus === 'IN_PROGRESS') arr = ['IN_PROGRESS'];
            else if (lStatus === 'COMPLETED') arr = ['COMPLETED', 'APPROVED'];
            
            if (arr.length > 0) {
                const logs = await Logistics.find({ assignmentStatus: { $in: arr } }).select('enquiryId').lean();
                query._id = { $in: logs.map(l => l.enquiryId) };
            }
        }

        if (date || dateFrom || dateTo) {
            const { getIstDayRange } = require('../../utils/dateHelper');
            const statusStr = status ? status.toUpperCase() : '';
            const isPendingQuery = statusStr.includes('PENDING') || statusStr.includes('RESCHEDULED') || statusStr.includes('MISSED') || statusStr.includes('UNASSIGNED');
            
            let dateFilter = {};
            if (date) {
                const { startOfDay, endOfDay } = getIstDayRange(date);
                dateFilter = { $gte: startOfDay, $lt: endOfDay };
            } else {
                if (dateFrom) {
                    const { startOfDay } = getIstDayRange(dateFrom);
                    dateFilter.$gte = startOfDay;
                }
                if (dateTo) {
                    const { endOfDay } = getIstDayRange(dateTo);
                    dateFilter.$lt = endOfDay;
                }
            }
            
            if (Object.keys(dateFilter).length > 0) {
                if (isPendingQuery) {
                    query.scheduledDate = dateFilter;
                } else if (statusStr && statusStr !== 'ALL') {
                    query.updatedAt = dateFilter;
                } else {
                    query.createdAt = dateFilter;
                }
            }
        }

        if (location) {
            query.location = location;
        }

        if (search) {
            query.$or = [
                { farmerFirstName: { $regex: search, $options: 'i' } },
                { farmerLastName: { $regex: search, $options: 'i' } },
                { farmerMobile: { $regex: search, $options: 'i' } },
                { enquiryId: { $regex: search, $options: 'i' } }
            ];
        }

        const enquiries = await Enquiry.find(query)
            .skip(skip)
            .limit(Number(limit))
            .sort({ createdAt: -1 })
            .populate('assignedSelectorId', 'firstName lastName mobileNo bikeNumber')
            .populate('fieldOwnerId', 'firstName lastName')
            .populate('agentId', 'name')
            .populate('generation', 'name')
            .populate('companyId', 'companyName')
            .lean();

        // Fetch related inspections to map rejectReason
        const enquiryIds = enquiries.map((e) => e._id);
        const Inspection = require('../inspections/inspection.model');
        const inspections = await Inspection.find({ enquiryId: { $in: enquiryIds } })
            .select('enquiryId generalNotes')
            .lean();
            
        const inspectionMap = {};
        inspections.forEach((insp) => {
            inspectionMap[insp.enquiryId.toString()] = insp;
        });

        const data = enquiries.map(enq => {
            const insp = inspectionMap[enq._id.toString()] || null;
            return {
                ...enq,
                status: req.query.logisticsStatus ? req.query.logisticsStatus.toUpperCase() : enq.status,
                rejectReason: (enq.status === 'REJECTED' && insp) ? (insp.generalNotes || null) : null
            };
        });

        const total = await Enquiry.countDocuments(query);

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data
        });
    } catch (error) {
        console.error('Error fetching enquiries:', error);
        res.status(500).json({ message: 'Server error while fetching enquiries' });
    }
};

// @desc    Update enquiry
// @route   PUT /api/enquiries/:id
// @access  Protected (Admin, Field Owner)
const updateEnquiry = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // 24-hour edit guard: enquiry is locked after editableUntil expires (Admin bypasses this guard)
        if (req.user.role !== 'Admin' && enquiry.status !== 'PENDING' && enquiry.editableUntil && new Date() > enquiry.editableUntil) {
            return res.status(403).json({ message: 'Edit window of 24 hours has expired. Reschedule the enquiry to unlock editing.' });
        }

        // If updating selector or agent, validate their existence
        let assignedSelectorId = req.body.assignedSelectorId;
        if (
            assignedSelectorId === null ||
            assignedSelectorId === 'null' ||
            assignedSelectorId === 'undefined' ||
            (typeof assignedSelectorId === 'string' && assignedSelectorId.trim() === '')
        ) {
            req.body.assignedSelectorId = null;
        } else if (assignedSelectorId) {
            if (typeof assignedSelectorId === 'string' && mongoose.Types.ObjectId.isValid(assignedSelectorId)) {
                const selector = await User.findById(assignedSelectorId);
                if (!selector) {
                    return res.status(404).json({ message: 'Assigned Selector not found with the provided ID' });
                }
                if (selector.role !== 'Field Selector') {
                    return res.status(400).json({ message: 'Invalid Role: Assigned user must be a Field Selector' });
                }
            } else {
                return res.status(400).json({ message: 'Invalid ID format for Assigned Selector' });
            }
        }

        if (req.body.agentId && req.body.agentId.trim() !== "") {
            const agent = await Agent.findById(req.body.agentId);
            if (!agent) {
                return res.status(404).json({ message: 'Agent not found with the provided ID' });
            }
        } else if (req.body.agentId === "") {
            req.body.agentId = null;
        }

        // We should ensure we don't accidentally overwrite system-controlled fields if not allowed, 
        // but simple req.body is what was implicitly requested. We can prevent updating enquiryId, etc.
        const updateData = { ...req.body };
        delete updateData.enquiryId;
        delete updateData.fieldOwnerId; // Usually shouldn't change the creator implicitly

        // If a new selector is being assigned, automatically set the status to 'ASSIGNED'
        const newSelectorId = updateData.assignedSelectorId;
        const oldSelectorId = enquiry.assignedSelectorId?.toString();
        const selectorChanged = newSelectorId && newSelectorId !== oldSelectorId;

        if (selectorChanged) {
            updateData.status = 'ASSIGNED';
        }

        // However, standard Mongoose findByIdAndUpdate uses req.body directly
        const updatedEnquiry = await Enquiry.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        // Sync to master Farmer collection if farmerFirstName, farmerLastName, farmerMobile, or location changed
        if (req.body.farmerFirstName || req.body.farmerLastName || req.body.farmerMobile || req.body.location) {
            try {
                const fname = req.body.farmerFirstName || updatedEnquiry.farmerFirstName;
                const lname = req.body.farmerLastName || updatedEnquiry.farmerLastName;
                const mobileNo = req.body.farmerMobile || updatedEnquiry.farmerMobile;
                const loc = req.body.location || updatedEnquiry.location;
                const farmerNameStr = `${fname} ${lname}`.trim();
                
                await Farmer.findOneAndUpdate(
                    { mobile: mobileNo },
                    { name: farmerNameStr, location: loc },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
            } catch (farmerErr) {
                console.error('Failed to sync updated farmer to master collection:', farmerErr.message);
            }
        }

        // Flow 1 — WhatsApp: commercial rejection
        if (req.body.status && (req.body.status === 'CLOSED' || req.body.status === 'CANCELLED') && enquiry.status !== req.body.status) {
            NotificationService.sendDealCancelled(updatedEnquiry.farmerMobile, updatedEnquiry.farmerFirstName);
        }

        // Flow 1b — WhatsApp: notify farmer + new selector when selector changes
        if (selectorChanged) {
            const newSelector = await User.findById(newSelectorId).select('firstName lastName mobileNo');
            if (newSelector) {
                const selectorFullName = `${newSelector.firstName} ${newSelector.lastName}`;
                // Notify farmer that a visit will be scheduled
                NotificationService.sendVisitScheduled(updatedEnquiry.farmerMobile, selectorFullName, newSelector.mobileNo);
                // Notify the newly assigned selector
                NotificationService.sendSelectorAssigned(newSelector.mobileNo, updatedEnquiry.farmerFirstName, updatedEnquiry.farmerLastName, updatedEnquiry.location, updatedEnquiry.enquiryId);
            }
        }

        // Flow 2 — In-app: notify new Field Selector and Field Owner when selector changes
        if (selectorChanged) {
            const selectorMsg = `Field Selector assigned for farmer ${updatedEnquiry.farmerFirstName} ${updatedEnquiry.farmerLastName} at ${updatedEnquiry.location}.`;
            await createNotification(
                newSelectorId,
                'FIELD_SELECTOR_ASSIGNED',
                selectorMsg,
                updatedEnquiry._id,
                'Enquiry'
            );
            if (updatedEnquiry.fieldOwnerId) {
                await createNotification(
                    updatedEnquiry.fieldOwnerId,
                    'FIELD_SELECTOR_ASSIGNED',
                    selectorMsg,
                    updatedEnquiry._id,
                    'Enquiry'
                );
            }
        }

        res.status(200).json(updatedEnquiry);
    } catch (error) {
        console.error('Error updating enquiry:', error);

        // Mongoose CastError for invalid ObjectIDs
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }

        res.status(500).json({ message: error.message || 'Internal server error while updating enquiry' });
    }
};

// @desc    Get a single enquiry by ID with full details (for plot detail view)
// @route   GET /api/enquiries/:id
// @access  Protected (Admin, Field Owner, Operational Manager)
const getEnquiryById = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id)
            .populate('generation', 'name description')
            .populate('agentId', 'agentName mobileNo location')
            .populate('fieldOwnerId', 'firstName lastName mobileNo')
            .populate('assignedSelectorId', 'firstName lastName mobileNo bikeNumber')
            .populate('companyId', 'companyName');

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // Global Shared Pool: Field Owners can view all enquiries — no ownership guard needed

        // Join the inspection record for this enquiry (photos + composition data)
        const Inspection = require('../inspections/inspection.model');
        const inspection = await Inspection.findOne({ enquiryId: enquiry._id })
            .populate('selectorId', 'firstName lastName mobileNo bikeNumber')
            .lean();

        // Join the logistics record to expose munshi, driver, vehicle, team data
        const Logistics = require('../logistics/logistics.model');
        const logistics = await Logistics.findOne({ enquiryId: enquiry._id })
            .populate('munshiId', 'firstName lastName')
            .populate('driverId', 'firstName lastName mobileNo')
            .populate('vehicleId', 'vehicleNumber vehicleType')
            .lean();

        const logisticsData = logistics ? {
            munshiId: logistics.munshiId ? logistics.munshiId._id : null,
            munshi: logistics.munshiId
                ? `${logistics.munshiId.firstName} ${logistics.munshiId.lastName}`
                : null,
            driverId: logistics.driverId ? logistics.driverId._id : null,
            driver: logistics.driverId
                ? `${logistics.driverId.firstName} ${logistics.driverId.lastName}`
                : null,
            driverMobile: logistics.driverId ? logistics.driverId.mobileNo : null,
            vehicleNumber: logistics.vehicleId ? logistics.vehicleId.vehicleNumber : null,
            teamName: logistics.teamName || null,
            assignmentStatus: logistics.assignmentStatus || null,
        } : null;

        // Join packing report details if logistics exists
        const Packing = require('../execution/packing.model');
        const packing = logistics ? await Packing.findOne({ assignmentId: logistics._id }).lean() : null;

        // Shape flat response exactly as per frontend View Details contract
        const e = enquiry.toObject();
        if (req.user.role === 'Operational Manager') {
            delete e.purchaseRate;
        }

        let displayStatus = e.status;
        if (e.status === 'ASSIGNED' && e.purchaseRate != null) {
            displayStatus = 'RATE_FIXED';
        }

        res.status(200).json({
            ...e,
            status: displayStatus,
            farmerName: `${e.farmerFirstName} ${e.farmerLastName}`,
            mobile: e.farmerMobile,
            boxCount: e.estimatedBoxes || null,
            rate: req.user.role === 'Operational Manager' ? null : (e.purchaseRate || null),
            company: e.companyId ? e.companyId.companyName : null,
            fieldOwner: e.fieldOwnerId ? {
                name: `${e.fieldOwnerId.firstName} ${e.fieldOwnerId.lastName}`,
                mobile: e.fieldOwnerId.mobileNo,
            } : null,
            fieldSelector: inspection && inspection.selectorId ? {
                name: `${inspection.selectorId.firstName} ${inspection.selectorId.lastName}`,
                mobile: inspection.selectorId.mobileNo || null,
                bikeNumber: inspection.selectorId.bikeNumber || null,
                remarks: inspection.remarks || null,
            } : null,
            logistics: logisticsData,
            inspection: inspection || null,
            rejectReason: (e.status === 'REJECTED' && inspection) ? (inspection.generalNotes || null) : null,
            packingDetails: packing || null,
            packingPhotos: packing ? packing.photos : [],
        });
    } catch (error) {
        console.error('Error fetching enquiry by ID:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error while fetching enquiry' });
    }
};

// @desc    Admin reschedules a missed inspection
// @route   PATCH /api/enquiries/reschedule/:id
// @access  Private (Admin)
const rescheduleEnquiry = async (req, res) => {
    try {
        const { scheduledDate, scheduledTime } = req.body;

        if (!scheduledDate) {
            return res.status(400).json({ message: 'scheduledDate is required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (!['PENDING', 'SELECTED'].includes(enquiry.status)) {
            return res.status(400).json({
                message: `Cannot reschedule an enquiry with status '${enquiry.status}'`,
            });
        }

        const before = { scheduledDate: enquiry.scheduledDate, scheduledTime: enquiry.scheduledTime };
        enquiry.scheduledDate = new Date(scheduledDate);
        enquiry.scheduledTime = scheduledTime || null;
        // Reset the 24-hour edit window so FO/Admin can edit again after admin reschedule
        enquiry.editableUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await enquiry.save();

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Admin rescheduled inspection for Enquiry ${enquiry.enquiryId}`,
            before,
            { scheduledDate: enquiry.scheduledDate, scheduledTime: enquiry.scheduledTime }
        );

        res.json({ message: 'Inspection rescheduled successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Admin / Field Owner fixes the purchase rate for a selected plot
// @route   PATCH /api/enquiries/fix-rate/:id
// @access  Private (Admin, Field Owner)
const fixRate = async (req, res) => {
    try {
        const { companyId, purchaseRate, packingType, estimatedBoxes, remarks } = req.body;

        if (!companyId || !purchaseRate) {
            return res.status(400).json({ message: 'companyId and purchaseRate are required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // Global Shared Pool: any Field Owner can fix the rate on any enquiry — no ownership guard

        if (!['SELECTED', 'REJECTED'].includes(enquiry.status)) {
            return res.status(400).json({
                message: `Rate can only be fixed for enquiries with status 'SELECTED' or 'REJECTED'. Current status: '${enquiry.status}'`,
            });
        }

        // Validate company exists
        const Company = require('../master-data/company.model');
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ message: 'Company not found with the provided ID' });
        }

        const before = {
            companyId: enquiry.companyId,
            purchaseRate: enquiry.purchaseRate,
            packingType: enquiry.packingType,
            estimatedBoxes: enquiry.estimatedBoxes,
            status: enquiry.status,
        };

        enquiry.companyId = companyId;
        enquiry.purchaseRate = purchaseRate;
        enquiry.remarks = remarks || '';
        enquiry.status = 'RATE_FIXED';
        // Record which FO actually closed the deal (Global Shared Pool model)
        enquiry.rateFixedBy = req.user._id;

        // Optional planning fields — set if provided, leave existing value if not
        if (packingType) enquiry.packingType = packingType;
        if (estimatedBoxes) enquiry.estimatedBoxes = estimatedBoxes;

        await enquiry.save();

        // Flow 2 — In-app: notify all Operational Managers, Admins, and the Field Owner
        const rateMsg = `${enquiry.farmerFirstName} ${enquiry.farmerLastName}, ${enquiry.location} rate fixed.`;
        await broadcastToRole('Admin', 'RATE_FIXED', rateMsg, enquiry._id, 'Enquiry');
        await broadcastToRole('Operational Manager', 'RATE_FIXED', rateMsg, enquiry._id, 'Enquiry');
        if (enquiry.fieldOwnerId) {
            await createNotification(
                enquiry.fieldOwnerId,
                'RATE_FIXED',
                rateMsg,
                enquiry._id,
                'Enquiry'
            );
        }

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Rate fixed at ₹${purchaseRate} for Enquiry ${enquiry.enquiryId}`,
            before,
            { companyId, purchaseRate, packingType, estimatedBoxes, status: 'RATE_FIXED' }
        );

        res.json({ message: 'Rate fixed successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID: ${error.path}` });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Field Owner reschedules a SELECTED enquiry
// @route   PUT /api/enquiries/:id/reschedule
// @access  Protected (Field Owner, Admin)
const foRescheduleEnquiry = async (req, res) => {
    try {
        const { rescheduleDate, reason, assignedSelectorId } = req.body;

        if (!rescheduleDate || !reason) {
            return res.status(400).json({ message: 'rescheduleDate and reason are required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (!['SELECTED', 'REJECTED'].includes(enquiry.status)) {
            return res.status(400).json({
                message: `Only 'SELECTED' or 'REJECTED' enquiries can be rescheduled. Current status: '${enquiry.status}'`,
            });
        }

        const before = { status: enquiry.status, rescheduleDate: enquiry.rescheduleDate, assignedSelectorId: enquiry.assignedSelectorId, scheduledDate: enquiry.scheduledDate };

        // Record the history
        enquiry.rescheduleHistory.push({
            rescheduleDate: new Date(rescheduleDate),
            reason: reason,
            rescheduledBy: req.user._id,
        });

        // Reset the 24-hour edit window so FO/Admin can edit again after reschedule
        enquiry.editableUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

        let selectorChanged = false;
        let newSelectorId = null;

        if (assignedSelectorId && assignedSelectorId !== 'null' && assignedSelectorId !== '') {
            const User = require('../users/user.model');
            const selector = await User.findOne({ _id: assignedSelectorId, role: 'Field Selector' });
            if (!selector) {
                return res.status(404).json({ message: 'Selector not found or invalid role' });
            }
            enquiry.status = 'ASSIGNED';
            enquiry.assignedSelectorId = assignedSelectorId;
            enquiry.scheduledDate = new Date(rescheduleDate);
            enquiry.rescheduleDate = null;
            newSelectorId = assignedSelectorId;
            selectorChanged = true;
        } else {
            enquiry.status = 'RESCHEDULED';
            enquiry.rescheduleDate = new Date(rescheduleDate);
            enquiry.assignedSelectorId = null;
            enquiry.scheduledDate = null;
        }

        await enquiry.save();

        // If a new selector was assigned during reschedule, trigger notifications
        if (selectorChanged && newSelectorId) {
            const User = require('../users/user.model');
            const newSelector = await User.findById(newSelectorId).select('firstName lastName mobileNo');
            if (newSelector) {
                const selectorFullName = `${newSelector.firstName} ${newSelector.lastName}`;
                // Flow 1b — WhatsApp: notify farmer + new selector
                NotificationService.sendVisitScheduled(enquiry.farmerMobile, selectorFullName, newSelector.mobileNo);
                NotificationService.sendSelectorAssigned(newSelector.mobileNo, enquiry.farmerFirstName, enquiry.farmerLastName, enquiry.location, enquiry.enquiryId);
            }
            // Flow 2 — In-app notification
            const selectorMsg = `Field Selector assigned for farmer ${enquiry.farmerFirstName} ${enquiry.farmerLastName} at ${enquiry.location}.`;
            await createNotification(
                newSelectorId,
                'FIELD_SELECTOR_ASSIGNED',
                selectorMsg,
                enquiry._id,
                'Enquiry'
            );
            if (enquiry.fieldOwnerId) {
                await createNotification(
                    enquiry.fieldOwnerId,
                    'FIELD_SELECTOR_ASSIGNED',
                    selectorMsg,
                    enquiry._id,
                    'Enquiry'
                );
            }
        }

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Field Owner rescheduled Enquiry ${enquiry.enquiryId}`,
            before,
            { status: enquiry.status, rescheduleDate: enquiry.rescheduleDate, assignedSelectorId: enquiry.assignedSelectorId, scheduledDate: enquiry.scheduledDate }
        );

        res.json({ message: 'Enquiry rescheduled successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID format for field: ${error.path}` });
        }
        console.error('Error rescheduling enquiry:', error);
        res.status(500).json({ message: 'Server error while rescheduling enquiry', error: error.message });
    }
};

// @desc    SLA automation – reset ASSIGNED enquiries not visited within 24 hours
// @route   POST /api/enquiries/run-sla-check
// @access  Private (Admin, Field Owner)
const runSlaTimeoutCheck = async (req, res) => {
    try {
        const { resetCount, affectedEnquiryIds } = await checkAndResetExpiredEnquiries();

        return res.status(200).json({
            message: resetCount === 0
                ? 'SLA check complete. No expired assignments found.'
                : `SLA check complete. ${resetCount} enquiry/enquiries reset to PENDING.`,
            resetCount,
            affectedEnquiryIds,
        });
    } catch (error) {
        console.error('Error running SLA timeout check:', error);
        res.status(500).json({ message: 'Server error during SLA check', error: error.message });
    }
};

// @desc    Get all enquiries that missed their 24-hour SLA (missed plots report)
// @route   GET /api/enquiries/reports/missed
// @access  Private (Admin, Field Owner)
const getMissedPlots = async (req, res) => {
    try {
        const missedEnquiries = await Enquiry.find({
            'missedAssignments.0': { $exists: true },
        })
            .sort({ updatedAt: -1 })
            .populate('missedAssignments.selectorId', 'firstName lastName mobileNo bikeNumber')
            .populate('fieldOwnerId', 'firstName lastName mobileNo')
            .populate('generation', 'name');

        res.status(200).json({
            total: missedEnquiries.length,
            data: missedEnquiries,
        });
    } catch (error) {
        console.error('Error fetching missed plots report:', error);
        res.status(500).json({ message: 'Server error while fetching missed plots report' });
    }
};
// @desc    Get enquiry history for a specific farmer
// @route   GET /api/enquiries/farmer-history
// @access  Private (Admin, Field Owner)
// @query   ?farmerMobile=9999999999 OR ?farmerName=Ramesh
const getFarmerEnquiryHistory = async (req, res) => {
    try {
        const { farmerMobile, farmerName, page = 1, limit = 20, fieldOwnerId, assignedSelectorId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        if (!farmerMobile && !farmerName && !fieldOwnerId && !assignedSelectorId) {
            return res.status(400).json({ message: 'Provide at least farmerMobile, farmerName, fieldOwnerId, or assignedSelectorId as a query param' });
        }

        // History includes: COMPLETED (successful harvest), REJECTED (selector rejected the plot)
        const query = { status: { $in: ['COMPLETED', 'REJECTED', 'SELECTED', 'RATE_FIXED'] } };

        if (farmerMobile) {
            query.farmerMobile = farmerMobile.trim();
        } else if (farmerName) {
            const regex = new RegExp(farmerName.trim(), 'i');
            query.$or = [
                { farmerFirstName: regex },
                { farmerLastName: regex },
            ];
        }

        if (fieldOwnerId) {
            query.fieldOwnerId = fieldOwnerId;
        }

        if (assignedSelectorId) {
            query.assignedSelectorId = assignedSelectorId;
        }

        const [enquiries, total] = await Promise.all([
            Enquiry.find(query)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .select('enquiryId farmerFirstName farmerLastName farmerMobile status location updatedAt purchaseRate assignedSelectorId fieldOwnerId companyId')
                .populate('fieldOwnerId', 'firstName lastName')
                .populate('assignedSelectorId', 'firstName lastName')
                .lean(),
            Enquiry.countDocuments(query),
        ]);

        // For REJECTED enquiries, pull the rejection reason from the linked Inspection record
        const Inspection = require('../inspections/inspection.model');
        const data = await Promise.all(
            enquiries.map(async (enq) => {
                const entry = {
                    _id: enq._id,             // MongoDB ObjectId — use this to call /api/enquiries/:id
                    enquiryId: enq.enquiryId,
                    date: enq.updatedAt,
                    farmerName: `${enq.farmerFirstName} ${enq.farmerLastName}`.trim(),
                    mobileNo: enq.farmerMobile,
                    location: enq.location,
                    fieldStatus: enq.status,  // 'COMPLETED' | 'REJECTED' | 'SELECTED' | etc
                    purchaseRate: enq.purchaseRate || null,
                    fieldOwnerName: enq.fieldOwnerId ? `${enq.fieldOwnerId.firstName} ${enq.fieldOwnerId.lastName}` : null,
                    fieldSelectorName: enq.assignedSelectorId ? `${enq.assignedSelectorId.firstName} ${enq.assignedSelectorId.lastName}` : null,
                };

                if (enq.status === 'REJECTED') {
                    const inspection = await Inspection.findOne({ enquiryId: enq._id })
                        .select('generalNotes decision')
                        .lean();
                    entry.rejectionReason = inspection?.generalNotes || null;
                }

                return entry;
            })
        );

        res.status(200).json({
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            data,
        });
    } catch (error) {
        console.error('Error fetching farmer enquiry history:', error);
        res.status(500).json({ message: 'Server error while fetching farmer enquiry history' });
    }
};

// @desc    Field Owner marks a rejected plot as End of Life (status = CANCELLED)
// @route   PATCH /api/enquiries/:id/eol
// @access  Private (Field Owner, Admin)
const eolEnquiry = async (req, res) => {
    try {
        const { remark } = req.body;

        if (!remark) {
            return res.status(400).json({ message: 'remark is required' });
        }

        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (!['REJECTED', 'SELECTED', 'RESCHEDULED'].includes(enquiry.status)) {
            return res.status(400).json({
                message: `Deal can only be closed for enquiries in 'REJECTED', 'SELECTED', or 'RESCHEDULED' status. Current status: '${enquiry.status}'`,
            });
        }

        const before = { status: enquiry.status, remarks: enquiry.remarks, assignedSelectorId: enquiry.assignedSelectorId };

        enquiry.status = 'CANCELLED';
        enquiry.remarks = remark;
        enquiry.assignedSelectorId = null;

        await enquiry.save();

        // Flow 1 — WhatsApp: commercial rejection notification
        NotificationService.sendDealCancelled(enquiry.farmerMobile, enquiry.farmerFirstName);

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Field Owner marked Enquiry ${enquiry.enquiryId} as End of Life (CANCELLED)`,
            before,
            { status: 'CANCELLED', remarks: remark, assignedSelectorId: null }
        );

        res.json({ message: 'Plot marked as End of Life (CANCELLED) successfully', enquiry });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ message: `Invalid ID: ${error.path}` });
        }
        console.error('Error closing deal (EOL):', error);
        res.status(500).json({ message: 'Server error while closing deal', error: error.message });
    }
};

// @desc    Admin final approval of an enquiry
// @route   POST /api/enquiries/:id/final-approve
// @access  Protected (Admin only)
const finalApproveEnquiry = async (req, res) => {
    try {
        const { weight } = req.body;
        const enquiry = await Enquiry.findById(req.params.id);
        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (enquiry.status !== 'PENDING_ADMIN_APPROVAL') {
            return res.status(400).json({
                message: `Cannot approve enquiry with status: ${enquiry.status}. Enquiry must be in PENDING_ADMIN_APPROVAL status.`
            });
        }

        const before = { status: enquiry.status, actualWeight: enquiry.actualWeight };
        enquiry.status = 'COMPLETED';
        if (weight !== undefined && weight !== null) {
            enquiry.actualWeight = Number(weight);
        }
        await enquiry.save();

        // Flow 2 — In-app: notify Field Owner (their plot harvest is fully done)
        if (enquiry.fieldOwnerId) {
            await createNotification(
                enquiry.fieldOwnerId,
                'TRIP_COMPLETED',
                `Harvest for farmer ${enquiry.farmerFirstName} ${enquiry.farmerLastName} at ${enquiry.location} has been completed and approved. Enquiry: ${enquiry.enquiryId}.`,
                enquiry._id,
                'Enquiry'
            );
        }

        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Admin marked final approval for Enquiry ${enquiry.enquiryId}`,
            before,
            { status: 'COMPLETED', actualWeight: enquiry.actualWeight }
        );

        res.status(200).json({
            message: 'Enquiry final approved successfully. Status is now COMPLETED.',
            enquiry
        });
    } catch (error) {
        console.error('Error in finalApproveEnquiry:', error);
        res.status(500).json({ message: 'Server error while marking final approval' });
    }
};

// @desc    Field Owner or Admin reassigns a Field Selector before work starts
// @route   PUT /api/enquiries/:id/reassign-selector
// @access  Private (Field Owner, Admin)
const reassignSelector = async (req, res) => {
    try {
        const { assignedSelectorId } = req.body;
        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        // 1. Enforce ownership for Field Owner
        if (req.user.role !== 'Admin' && enquiry.fieldOwnerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to edit this enquiry' });
        }

        // 2. Enforce "before work starts" (status must be PENDING or ASSIGNED)
        if (!['PENDING', 'ASSIGNED'].includes(enquiry.status)) {
            return res.status(400).json({
                message: `Cannot reassign selector once enquiry is in '${enquiry.status}' status.`
            });
        }

        // 3. Validate new selector if provided
        let selector = null;
        let sanitizedSelectorId = assignedSelectorId;
        if (
            assignedSelectorId === null ||
            assignedSelectorId === 'null' ||
            assignedSelectorId === 'undefined' ||
            (typeof assignedSelectorId === 'string' && assignedSelectorId.trim() === '')
        ) {
            sanitizedSelectorId = null;
        }

        if (sanitizedSelectorId) {
            if (typeof sanitizedSelectorId === 'string' && mongoose.Types.ObjectId.isValid(sanitizedSelectorId)) {
                selector = await User.findById(sanitizedSelectorId);
                if (!selector) {
                    return res.status(404).json({ message: 'Assigned Selector not found with the provided ID' });
                }
                if (selector.role !== 'Field Selector') {
                    return res.status(400).json({ message: 'Invalid Role: Assigned user must be a Field Selector' });
                }
            } else {
                return res.status(400).json({ message: 'Invalid ID format for Assigned Selector' });
            }
        }

        const before = { assignedSelectorId: enquiry.assignedSelectorId, status: enquiry.status };

        // 4. Update Enquiry
        enquiry.assignedSelectorId = selector ? sanitizedSelectorId : null;
        enquiry.status = selector ? 'ASSIGNED' : 'PENDING';
        await enquiry.save();

        // 5. Send notifications if a new selector was assigned
        if (selector) {
            const selectorFullName = `${selector.firstName} ${selector.lastName}`;
            const farmerName = `${enquiry.farmerFirstName} ${enquiry.farmerLastName}`;
            const location = enquiry.location;

            // WhatsApp alerts
            NotificationService.sendVisitScheduled(enquiry.farmerMobile, selectorFullName, selector.mobileNo);
            NotificationService.sendSelectorAssigned(selector.mobileNo, enquiry.farmerFirstName, enquiry.farmerLastName, enquiry.location, enquiry.enquiryId);

            // In-app notifications
            const selectorMsg = `Field Selector assigned for farmer ${farmerName} at ${location}.`;
            await createNotification(sanitizedSelectorId, 'FIELD_SELECTOR_ASSIGNED', selectorMsg, enquiry._id, 'Enquiry');
            await createNotification(enquiry.fieldOwnerId, 'FIELD_SELECTOR_ASSIGNED', selectorMsg, enquiry._id, 'Enquiry');
        }

        // 6. Audit Logging
        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Selector reassigned for Enquiry ${enquiry.enquiryId}`,
            before,
            { assignedSelectorId: enquiry.assignedSelectorId, status: enquiry.status }
        );

        res.status(200).json({
            message: 'Selector reassigned successfully',
            enquiry
        });
    } catch (error) {
        console.error('Error in reassignSelector:', error);
        res.status(500).json({ message: 'Server error while reassigning selector' });
    }
};

// @desc    Edit a fixed rate plot
// @route   PUT /api/enquiries/:id/fixed-plot
// @access  Private (Admin, Operational Manager)
const editFixedPlot = async (req, res) => {
    try {
        const { purchaseRate, companyId, packingType, estimatedBoxes, remarks } = req.body;
        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (enquiry.status !== 'RATE_FIXED' && !(enquiry.status === 'ASSIGNED' && enquiry.purchaseRate != null)) {
            return res.status(400).json({ message: 'Can only edit rate on rate-fixed plots.' });
        }

        // Validate company exists if provided
        if (companyId) {
            const Company = require('../master-data/company.model');
            const company = await Company.findById(companyId);
            if (!company) {
                return res.status(404).json({ message: 'Company not found with the provided ID' });
            }
            enquiry.companyId = companyId;
        }

        const before = {
            purchaseRate: enquiry.purchaseRate,
            companyId: enquiry.companyId,
            packingType: enquiry.packingType,
            estimatedBoxes: enquiry.estimatedBoxes,
            remarks: enquiry.remarks
        };

        if (purchaseRate !== undefined) enquiry.purchaseRate = Number(purchaseRate);
        if (packingType !== undefined) enquiry.packingType = packingType;
        if (estimatedBoxes !== undefined) enquiry.estimatedBoxes = Number(estimatedBoxes);
        if (remarks !== undefined) enquiry.remarks = remarks;

        await enquiry.save();

        // Audit Logging
        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Fixed plot rate details updated for Enquiry ${enquiry.enquiryId}`,
            before,
            {
                purchaseRate: enquiry.purchaseRate,
                companyId: enquiry.companyId,
                packingType: enquiry.packingType,
                estimatedBoxes: enquiry.estimatedBoxes,
                remarks: enquiry.remarks
            }
        );

        res.status(200).json({
            message: 'Fixed plot updated successfully',
            enquiry
        });
    } catch (error) {
        console.error('Error in editFixedPlot:', error);
        res.status(500).json({ message: 'Server error while editing fixed plot' });
    }
};

// @desc    Delete/Reset a fixed rate plot (returns it to SELECTED)
// @route   DELETE /api/enquiries/:id/fixed-plot
// @access  Private (Admin, Operational Manager)
const deleteFixedPlot = async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        if (enquiry.status !== 'RATE_FIXED' && !(enquiry.status === 'ASSIGNED' && enquiry.purchaseRate != null)) {
            return res.status(400).json({ message: 'Can only delete rate on rate-fixed plots.' });
        }

        // Prevent delete if logistics assignment exists
        const Logistics = require('../logistics/logistics.model');
        const logisticsExists = await Logistics.findOne({ enquiryId: enquiry._id });
        if (logisticsExists) {
            return res.status(400).json({
                message: 'Cannot reset fixed rate. A logistics assignment already exists for this plot. Delete/Cancel the logistics assignment first.'
            });
        }

        const before = {
            status: enquiry.status,
            purchaseRate: enquiry.purchaseRate,
            companyId: enquiry.companyId,
            rateFixedBy: enquiry.rateFixedBy
        };

        enquiry.status = 'SELECTED';
        enquiry.purchaseRate = undefined;
        enquiry.companyId = undefined;
        enquiry.rateFixedBy = undefined;

        await enquiry.save();

        // Audit Logging
        await logSystemAction(
            req.user._id,
            'UPDATE',
            'Enquiries',
            enquiry._id,
            `Fixed plot rate reset back to SELECTED status for Enquiry ${enquiry.enquiryId}`,
            before,
            {
                status: enquiry.status,
                purchaseRate: enquiry.purchaseRate,
                companyId: enquiry.companyId,
                rateFixedBy: enquiry.rateFixedBy
            }
        );

        res.status(200).json({
            message: 'Fixed plot rate deleted and reset back to SELECTED status successfully',
            enquiry
        });
    } catch (error) {
        console.error('Error in deleteFixedPlot:', error);
        res.status(500).json({ message: 'Server error while deleting fixed plot' });
    }
};

module.exports = {
    createEnquiry,
    getEnquiries,
    updateEnquiry,
    getEnquiryById,
    rescheduleEnquiry,
    fixRate,
    foRescheduleEnquiry,
    runSlaTimeoutCheck,
    getMissedPlots,
    getFarmerEnquiryHistory,
    eolEnquiry,
    finalApproveEnquiry,
    reassignSelector,
    editFixedPlot,
    deleteFixedPlot,
};
