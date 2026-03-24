const cron = require('node-cron');
const { checkAndResetExpiredEnquiries } = require('../utils/enquiryService');

/**
 * SLA Timeout Cron Job
 * Runs at the top of every hour (minute 0 of every hour).
 * Finds ASSIGNED enquiries that haven't been visited in 24 hours,
 * logs the missed selector into `missedAssignments`, and resets them to PENDING.
 */
cron.schedule('0 * * * *', async () => {
    console.log(`[SLA Cron] ⏰ Running SLA timeout check at ${new Date().toISOString()}`);

    try {
        const { resetCount, affectedEnquiryIds } = await checkAndResetExpiredEnquiries();

        if (resetCount === 0) {
            console.log('[SLA Cron] ✅ No expired assignments found. All clear.');
        } else {
            console.log(`[SLA Cron] 🔄 Reset ${resetCount} enquiry/enquiries to PENDING.`);
            console.log('[SLA Cron] Affected IDs:', affectedEnquiryIds);
        }
    } catch (error) {
        console.error('[SLA Cron] ❌ Error during SLA timeout check:', error.message);
    }
});

console.log('[SLA Cron] ✅ SLA timeout cron job scheduled (runs every hour at :00).');
