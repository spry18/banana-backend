const cron = require('node-cron');
const Enquiry = require('../modules/enquiries/enquiry.model');

// ─────────────────────────────────────────────────────────────────────────────
// Missed Plots Cron Job
//
// Runs every day at 6:00 PM IST (12:30 UTC on a UTC server).
// Timezone env var: CRON_MISSED_PLOTS_TIME (default: '30 12 * * *' = 6 PM IST on UTC)
//
// Logic:
//   - Find all PENDING enquiries where:
//       • assignedSelectorId is set (selector was assigned but didn't visit)
//       • scheduledDate < now (the visit window has passed)
//   - For each: push selector into missedAssignments[], clear assignedSelectorId
//   - Status remains PENDING — only assignment is cleared
//
// NOTE: Already COMPLETED, CLOSED, CANCELLED, SELECTED, REJECTED, RATE_FIXED
// enquiries are excluded automatically because we filter by status === 'PENDING'.
// ─────────────────────────────────────────────────────────────────────────────

const CRON_TIME = process.env.CRON_MISSED_PLOTS_TIME || '30 12 * * *';
// ^ Default: 30 12 * * * = 12:30 UTC = 18:00 IST
// If your server runs in IST timezone, change env to: '0 18 * * *'

async function runMissedPlotsCheck() {
    const now = new Date();
    console.log(`[MissedPlots Cron] ⏰ Running at ${now.toISOString()}`);

    try {
        // Find PENDING plots assigned to a selector whose scheduled visit has passed
        const missed = await Enquiry.find({
            status: 'PENDING',
            assignedSelectorId: { $ne: null, $exists: true },
            scheduledDate: { $lt: now },
        }).select('_id enquiryId assignedSelectorId missedAssignments');

        if (!missed.length) {
            console.log('[MissedPlots Cron] ✅ No missed plots found. All clear.');
            return { count: 0, ids: [] };
        }

        const bulkOps = missed.map((enq) => ({
            updateOne: {
                filter: { _id: enq._id },
                update: {
                    $push: {
                        missedAssignments: {
                            selectorId: enq.assignedSelectorId,
                            missedAt:   now,
                        },
                    },
                    $set: { assignedSelectorId: null },
                    // NOTE: status stays 'PENDING' — do NOT change status here
                },
            },
        }));

        const result = await Enquiry.bulkWrite(bulkOps);

        const affectedIds = missed.map((e) => e.enquiryId);
        console.log(`[MissedPlots Cron] 🔴 Marked ${result.modifiedCount} plot(s) as missed.`);
        console.log('[MissedPlots Cron] Affected Enquiry IDs:', affectedIds);

        return { count: result.modifiedCount, ids: affectedIds };
    } catch (error) {
        console.error('[MissedPlots Cron] ❌ Error during missed plots check:', error.message);
        throw error;
    }
}

// Schedule the cron
cron.schedule(CRON_TIME, runMissedPlotsCheck);

console.log(`[MissedPlots Cron] ✅ Scheduled with pattern: "${CRON_TIME}" (6:00 PM IST daily).`);

// Export for manual trigger (e.g. test route or admin endpoint)
module.exports = { runMissedPlotsCheck };
