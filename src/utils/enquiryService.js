const Enquiry = require('../modules/enquiries/enquiry.model');
const { logSystemAction } = require('./auditLogger');

/**
 * Core SLA reset logic – independent of HTTP req/res.
 * Finds all ASSIGNED enquiries older than 24 hours,
 * records the missed selector, and resets them to PENDING.
 *
 * @returns {{ resetCount: number, affectedEnquiryIds: string[] }}
 */
const checkAndResetExpiredEnquiries = async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expiredEnquiries = await Enquiry.find({
        status: 'ASSIGNED',
        updatedAt: { $lt: cutoff },
    });

    if (expiredEnquiries.length === 0) {
        return { resetCount: 0, affectedEnquiryIds: [] };
    }

    const affectedEnquiryIds = [];

    for (const enquiry of expiredEnquiries) {
        enquiry.missedAssignments.push({ selectorId: enquiry.assignedSelectorId });
        enquiry.status = 'PENDING';
        enquiry.assignedSelectorId = null;
        await enquiry.save();
        affectedEnquiryIds.push(enquiry._id.toString());
    }

    // Log with a system-level user ID (null = system-initiated)
    await logSystemAction(
        null,
        'UPDATE',
        'Enquiries',
        null,
        `[SLA Cron] Reset ${affectedEnquiryIds.length} expired ASSIGNED enquiry/enquiries back to PENDING`
    );

    return { resetCount: affectedEnquiryIds.length, affectedEnquiryIds };
};

module.exports = { checkAndResetExpiredEnquiries };
