/**
 * Resolves a date string or keyword ('today', 'yesterday') to a 24-hour range
 * in Indian Standard Time (IST, UTC+5:30), returned as UTC Date objects.
 *
 * @param {string} [dateQuery] - 'today', 'yesterday', or 'YYYY-MM-DD'
 * @returns {{ startOfDay: Date, endOfDay: Date }}
 */
const getIstDayRange = (dateQuery) => {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const nowUtc = new Date();

    let year, month, day;

    if (dateQuery === 'today' || !dateQuery) {
        const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MS);
        year = nowIst.getUTCFullYear();
        month = nowIst.getUTCMonth();
        day = nowIst.getUTCDate();
    } else if (dateQuery === 'yesterday') {
        const yesterdayIst = new Date(nowUtc.getTime() + IST_OFFSET_MS - 24 * 60 * 60 * 1000);
        year = yesterdayIst.getUTCFullYear();
        month = yesterdayIst.getUTCMonth();
        day = yesterdayIst.getUTCDate();
    } else {
        // Assume format is YYYY-MM-DD
        const parts = String(dateQuery).split('-');
        if (parts.length === 3) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1; // 0-indexed
            day = parseInt(parts[2], 10);
        } else {
            // Fallback: try parsing direct Date
            const parsed = new Date(dateQuery);
            if (!isNaN(parsed.getTime())) {
                const parsedIst = new Date(parsed.getTime() + IST_OFFSET_MS);
                year = parsedIst.getUTCFullYear();
                month = parsedIst.getUTCMonth();
                day = parsedIst.getUTCDate();
            } else {
                // Default to today if invalid
                const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MS);
                year = nowIst.getUTCFullYear();
                month = nowIst.getUTCMonth();
                day = nowIst.getUTCDate();
            }
        }
    }

    // Construct start and end of that calendar day in IST (expressed as UTC Date objects)
    const startOfIstDayFake = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const startOfDay = new Date(startOfIstDayFake.getTime() - IST_OFFSET_MS);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return { startOfDay, endOfDay };
};

module.exports = { getIstDayRange };
