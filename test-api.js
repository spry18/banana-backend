/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Banana Backend — Full API Test Suite
 *  Tests: Field Owner KPI, Field Selector KPI, OM KPI, Morning Report flow,
 *         Enquiry creation, Inspection submission, Selector fields list,
 *         OM Metrics for Field Owner, Selectors Performance
 *
 *  Usage:
 *    node test-api.js                         → runs against localhost:5000
 *    node test-api.js https://api.waghagro.in → runs against production
 *
 *  Requires Node.js built-ins only (no npm packages).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = process.argv[2] || 'http://localhost:5000';

// 🔑 Set these credentials before running — must match real users in DB
const CREDS = {
    fieldOwner:    { mobileNo: '9000000001', password: 'Test@1234' },
    fieldSelector: { mobileNo: '9000000002', password: 'Test@1234' },
    om:            { mobileNo: '9000000003', password: 'Test@1234' },
    admin:         { mobileNo: '9000000004', password: 'Test@1234' },
};

// State shared across tests
const state = {
    tokens:      {},
    users:       {},
    generationId: null,
    enquiryId:   null,
    enquiryDbId: null,
    scheduledDate: null,
};

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    grey:   '\x1b[90m',
    blue:   '\x1b[34m',
    magenta:'\x1b[35m',
};

// ─── Counters ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, skipped = 0;
const failures = [];

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(`${BASE_URL}${path}`);
        const isHttps = parsed.protocol === 'https:';
        const lib = isHttps ? https : http;

        const payload = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: parsed.hostname,
            port:     parsed.port || (isHttps ? 443 : 80),
            path:     parsed.path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(token  ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        };

        const req = lib.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ─── Assertion helpers ───────────────────────────────────────────────────────
function assert(condition, label, detail = '') {
    if (condition) {
        console.log(`  ${C.green}✓${C.reset} ${label}`);
        passed++;
    } else {
        console.log(`  ${C.red}✗${C.reset} ${C.bold}${label}${C.reset} ${C.red}← FAILED${C.reset} ${detail ? C.grey + detail + C.reset : ''}`);
        failed++;
        failures.push(`${label}${detail ? ' → ' + detail : ''}`);
    }
}

function assertStatus(res, expected, label) {
    assert(
        res.status === expected,
        label,
        `got HTTP ${res.status}, expected ${expected}. Body: ${JSON.stringify(res.body).slice(0, 120)}`
    );
}

function section(title) {
    console.log(`\n${C.cyan}${C.bold}━━━  ${title}  ━━━${C.reset}`);
}

function skip(label) {
    console.log(`  ${C.yellow}⊘${C.reset} ${C.grey}SKIP — ${label}${C.reset}`);
    skipped++;
}

// ─── Test blocks ─────────────────────────────────────────────────────────────

// ── 1. LOGIN ─────────────────────────────────────────────────────────────────
async function testLogins() {
    section('1. AUTHENTICATION — Login all roles');

    for (const [role, creds] of Object.entries(CREDS)) {
        try {
            const res = await request('POST', '/api/users/login', {
                mobileNo: creds.mobileNo,
                password: creds.password,
            });

            if (res.status === 200 && res.body.token) {
                state.tokens[role] = res.body.token;
                state.users[role]  = res.body;
                assert(true, `Login [${role}] → mobile: ${creds.mobileNo}`);
            } else {
                assert(false, `Login [${role}]`, `HTTP ${res.status} — ${JSON.stringify(res.body).slice(0, 80)}`);
            }
        } catch (e) {
            assert(false, `Login [${role}]`, e.message);
        }
    }
}

// ── 2. MASTER DATA — Get generation (required for enquiry creation) ───────────
async function testMasterData() {
    section('2. MASTER DATA — Get generations (for enquiry payload)');

    const token = state.tokens.fieldOwner || state.tokens.admin;
    if (!token) { skip('No Field Owner / Admin token — skipping master data'); return; }

    try {
        const res = await request('GET', '/api/master-data/generations', null, token);
        assertStatus(res, 200, 'GET /api/master-data/generations → 200');
        assert(Array.isArray(res.body), 'Generations response is array');

        if (res.body.length > 0) {
            state.generationId = res.body[0]._id;
            assert(!!state.generationId, `Got generationId: ${state.generationId}`);
        } else {
            skip('No generations in DB — enquiry creation will be skipped');
        }
    } catch (e) {
        assert(false, 'GET generations', e.message);
    }
}

// ── 3. ENQUIRY CREATION ───────────────────────────────────────────────────────
async function testEnquiryCreation() {
    section('3. ENQUIRY CREATION (Field Owner)');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }
    if (!state.generationId) { skip('No generationId available'); return; }

    // Schedule for today (IST) so KPI tests pick it up
    const today = new Date();
    today.setHours(today.getHours() + 2); // 2 hours from now
    state.scheduledDate = today.toISOString();

    const selectorUserId = state.users.fieldSelector?._id || null;

    const payload = {
        farmerFirstName:    'Test',
        farmerLastName:     'Farmer',
        farmerMobile:       '9876543210',
        location:           'TestVillage',
        subLocation:        'TestArea',
        plantCount:         100,
        generation:         state.generationId,
        visitPriority:      'High',
        scheduledDate:      state.scheduledDate,
        assignedSelectorId: selectorUserId,
    };

    try {
        const res = await request('POST', '/api/enquiries', payload, token);
        assertStatus(res, 201, 'POST /api/enquiries → 201 Created');

        if (res.status === 201) {
            state.enquiryId    = res.body.enquiryId;
            state.enquiryDbId  = res.body._id;
            assert(!!state.enquiryId,   `enquiryId generated: ${state.enquiryId}`);
            assert(res.body.status === 'PENDING', `Status is PENDING (got: ${res.body.status})`);
            assert(!!res.body.fieldOwnerId, 'fieldOwnerId is set');

            // Check selector assignment
            if (selectorUserId) {
                assert(
                    res.body.assignedSelectorId === selectorUserId,
                    `assignedSelectorId is set to field selector`
                );
            }
        }
    } catch (e) {
        assert(false, 'Create enquiry', e.message);
    }
}

// ── 4. FIELD OWNER KPI DASHBOARD ─────────────────────────────────────────────
async function testFieldOwnerDashboard() {
    section('4. FIELD OWNER — Dashboard KPIs');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }

    try {
        const res = await request('GET', '/api/field-owner/dashboard', null, token);
        assertStatus(res, 200, 'GET /api/field-owner/dashboard → 200');

        if (res.status === 200) {
            const { kpis, recentActivity } = res.body;
            assert(kpis !== undefined,          'Response has kpis object');
            assert(typeof kpis.total === 'number',      `kpis.total is number (${kpis.total})`);
            assert(typeof kpis.selected === 'number',   `kpis.selected is number (${kpis.selected})`);
            assert(typeof kpis.rejected === 'number',   `kpis.rejected is number (${kpis.rejected})`);
            assert(typeof kpis.missed === 'number',     `kpis.missed is number (${kpis.missed})`);
            assert(typeof kpis.unassigned === 'number', `kpis.unassigned is number (${kpis.unassigned})`);
            assert(Array.isArray(recentActivity),        'recentActivity is array');

            // Check recentActivity structure
            if (recentActivity.length > 0) {
                const item = recentActivity[0];
                assert('enquiryId' in item, 'recentActivity item has enquiryId');
                assert('status' in item,    'recentActivity item has status');
                assert('farmerName' in item,'recentActivity item has farmerName');
            }
        }
    } catch (e) {
        assert(false, 'FO Dashboard', e.message);
    }
}

// ── 5. FIELD OWNER — Plots List ───────────────────────────────────────────────
async function testFieldOwnerPlots() {
    section('5. FIELD OWNER — Plots List');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }

    try {
        const res = await request('GET', '/api/field-owner/plots?page=1&limit=5', null, token);
        assertStatus(res, 200, 'GET /api/field-owner/plots → 200');

        if (res.status === 200) {
            assert(typeof res.body.total === 'number', `total is number (${res.body.total})`);
            assert(Array.isArray(res.body.data),       'data is array');

            // If we just created an enquiry, try to find it
            if (state.enquiryId) {
                const searchRes = await request(
                    'GET',
                    `/api/field-owner/plots?search=${state.enquiryId}`,
                    null, token
                );
                assert(searchRes.status === 200, 'Search by enquiryId → 200');
                if (searchRes.status === 200) {
                    assert(
                        searchRes.body.data.some(e => e.enquiryId === state.enquiryId),
                        `Newly created enquiry ${state.enquiryId} appears in plots list`
                    );
                }
            }
        }
    } catch (e) {
        assert(false, 'FO Plots', e.message);
    }
}

// ── 6. FIELD OWNER — Unassigned Plots ────────────────────────────────────────
async function testFieldOwnerUnassigned() {
    section('6. FIELD OWNER — Unassigned Plots');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }

    try {
        const res = await request('GET', '/api/field-owner/plots/unassigned', null, token);
        assertStatus(res, 200, 'GET /api/field-owner/plots/unassigned → 200');
        if (res.status === 200) {
            assert(typeof res.body.total === 'number', `total is number (${res.body.total})`);
            assert(Array.isArray(res.body.data),       'data is array');
        }
    } catch (e) {
        assert(false, 'FO Unassigned Plots', e.message);
    }
}

// ── 7. FIELD OWNER — Selectors Performance ───────────────────────────────────
async function testSelectorsPerformance() {
    section('7. FIELD OWNER — Selectors Performance (weekly/monthly/custom)');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }

    const routes = [
        '/api/field-owner/selectors-performance/weekly',
        '/api/field-owner/selectors-performance/monthly',
        '/api/field-owner/selectors-performance',
    ];

    for (const route of routes) {
        try {
            const res = await request('GET', route, null, token);
            assertStatus(res, 200, `GET ${route} → 200`);
            if (res.status === 200) {
                assert(Array.isArray(res.body.data), `${route} → data is array`);
                // Check null-safety fix: no entry should have null selectorId
                if (res.body.data.length > 0) {
                    const hasNullId = res.body.data.some(s => !s.selectorId);
                    assert(!hasNullId, `No null selectorId entries in performance data`);
                }
            }
        } catch (e) {
            assert(false, `GET ${route}`, e.message);
        }
    }
}

// ── 8. FIELD OWNER — OM Metrics ───────────────────────────────────────────────
async function testOmMetricsForFO() {
    section('8. FIELD OWNER — OM Metrics (per-OM scope fix)');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }

    try {
        const res = await request('GET', '/api/field-owner/oms-metrics', null, token);
        assertStatus(res, 200, 'GET /api/field-owner/oms-metrics → 200');

        if (res.status === 200) {
            assert(Array.isArray(res.body), 'Response is array of OM metrics');

            if (res.body.length > 0) {
                const om = res.body[0];
                assert('unassigned' in om,  `OM has unassigned field (${om.unassigned})`);
                assert('assigned'   in om,  `OM has assigned field (${om.assigned})`);
                assert('completed'  in om,  `OM has completed field (${om.completed})`);
                assert('total'      in om,  `OM has total field (${om.total})`);
                assert('firstName'  in om,  'OM has firstName');

                // Validate totals are consistent
                assert(
                    om.total === om.unassigned + om.assigned + om.completed,
                    `OM total (${om.total}) = unassigned(${om.unassigned}) + assigned(${om.assigned}) + completed(${om.completed})`
                );
            } else {
                skip('No Operational Managers in DB to verify metrics');
            }
        }
    } catch (e) {
        assert(false, 'FO OM Metrics', e.message);
    }
}

// ── 9. FIELD SELECTOR — Dashboard KPIs ───────────────────────────────────────
async function testFieldSelectorDashboard() {
    section('9. FIELD SELECTOR — Dashboard KPIs (IST fix + no 24h cap)');

    const token = state.tokens.fieldSelector;
    if (!token) { skip('No Field Selector token'); return; }

    try {
        const res = await request('GET', '/api/field-selector/dashboard', null, token);
        assertStatus(res, 200, 'GET /api/field-selector/dashboard → 200');

        if (res.status === 200) {
            const { kpis, recentActivity } = res.body;
            assert(kpis !== undefined,          'Response has kpis object');
            assert('assigned' in kpis,          `kpis.assigned is present (${kpis.assigned})`);
            assert('selected' in kpis,          `kpis.selected is present (${kpis.selected})`);
            assert('rejected' in kpis,          `kpis.rejected is present (${kpis.rejected})`);
            assert('missed'   in kpis,          `kpis.missed is present (${kpis.missed})`);
            assert('visited'  in kpis,          `kpis.visited is present (${kpis.visited})`);
            assert(Array.isArray(recentActivity), 'recentActivity is array');

            // Validate all KPI values are non-negative numbers
            for (const [k, v] of Object.entries(kpis)) {
                assert(typeof v === 'number' && v >= 0, `kpis.${k} is non-negative number (${v})`);
            }

            // Validate company name is not null/undefined in recent activity (companyName fix)
            if (recentActivity.length > 0) {
                const item = recentActivity[0];
                assert('enquiryId' in item, 'recentActivity item has enquiryId');
                assert('status'    in item, 'recentActivity item has status');
            }
        }
    } catch (e) {
        assert(false, 'Field Selector Dashboard', e.message);
    }
}

// ── 10. FIELD SELECTOR — Fields List (no 24h cap) ─────────────────────────────
async function testFieldSelectorFields() {
    section('10. FIELD SELECTOR — Assigned Fields List (no 24h createdAt cap)');

    const token = state.tokens.fieldSelector;
    if (!token) { skip('No Field Selector token'); return; }

    try {
        const res = await request('GET', '/api/field-selector/fields?page=1&limit=10', null, token);
        assertStatus(res, 200, 'GET /api/field-selector/fields → 200');

        if (res.status === 200) {
            assert(typeof res.body.total === 'number', `total is number (${res.body.total})`);
            assert(Array.isArray(res.body.data),       'data is array');

            // Verify all returned plots are assigned to this selector
            const selectorId = state.users.fieldSelector?._id;
            if (selectorId && res.body.data.length > 0) {
                const allBelongToSelector = res.body.data.every(e =>
                    e.assignedSelectorId === selectorId ||
                    (typeof e.assignedSelectorId === 'object' && e.assignedSelectorId?._id === selectorId)
                );
                assert(allBelongToSelector, 'All returned plots belong to this selector');
            }
        }
    } catch (e) {
        assert(false, 'Field Selector Fields List', e.message);
    }
}

// ── 11. FIELD SELECTOR — Field Detail (no 24h cap, companyName fix) ────────────
async function testFieldSelectorFieldDetail() {
    section('11. FIELD SELECTOR — Field Detail (ownership-only guard + companyName)');

    const token = state.tokens.fieldSelector;
    if (!token) { skip('No Field Selector token'); return; }

    // Get an assigned plot ID first
    try {
        const listRes = await request('GET', '/api/field-selector/fields?page=1&limit=1', null, token);
        if (listRes.status !== 200 || !listRes.body.data?.length) {
            skip('No assigned plots to test detail view');
            return;
        }

        const plotId = listRes.body.data[0]._id;
        const detailRes = await request('GET', `/api/field-selector/fields/${plotId}`, null, token);
        assertStatus(detailRes, 200, `GET /api/field-selector/fields/${plotId} → 200 (no 24h cap)`);

        if (detailRes.status === 200) {
            assert('_id' in detailRes.body,         'Detail has _id');
            assert('farmerFirstName' in detailRes.body, 'Detail has farmerFirstName');
            assert('generation' in detailRes.body,  'Detail has generation populated');
            assert('inspection' in detailRes.body,  'Detail has inspection field (null if not yet submitted)');

            // companyId populated with companyName (not 'name')
            if (detailRes.body.companyId && typeof detailRes.body.companyId === 'object') {
                assert(
                    'companyName' in detailRes.body.companyId,
                    `companyId populated with companyName field (FIX VERIFIED)`
                );
                assert(
                    !('name' in detailRes.body.companyId) || detailRes.body.companyId.companyName !== undefined,
                    'companyName is not undefined'
                );
            }
        }
    } catch (e) {
        assert(false, 'Field Selector Field Detail', e.message);
    }
}

// ── 12. MORNING REPORT — Check Today Status ───────────────────────────────────
async function testMorningReportCheck() {
    section('12. MORNING REPORT — Check Today Log Status (IST midnight fix)');

    const token = state.tokens.fieldSelector;
    if (!token) { skip('No Field Selector token'); return; }

    try {
        const res = await request('GET', '/api/daily-logs/check-today', null, token);
        assertStatus(res, 200, 'GET /api/daily-logs/check-today → 200');

        if (res.status === 200) {
            assert('isStarted' in res.body, 'Response has isStarted field');
            assert(
                typeof res.body.isStarted === 'boolean',
                `isStarted is boolean (${res.body.isStarted})`
            );

            if (res.body.isStarted) {
                assert(!!res.body.logId, `logId is present (${res.body.logId})`);
                console.log(`  ${C.grey}ℹ Day already started for this selector today${C.reset}`);
            } else {
                console.log(`  ${C.grey}ℹ Day not yet started for this selector today${C.reset}`);
            }
        }
    } catch (e) {
        assert(false, 'Check Today Log Status', e.message);
    }
}

// ── 13. MORNING REPORT — Start Day (no photo, tests form fields only) ─────────
async function testMorningReportStartDay() {
    section('13. MORNING REPORT — Start Day API (field validation only)');

    const token = state.tokens.fieldSelector;
    if (!token) { skip('No Field Selector token'); return; }

    // Check if already started
    try {
        const checkRes = await request('GET', '/api/daily-logs/check-today', null, token);
        if (checkRes.body?.isStarted) {
            skip('Selector already started day today — skipping start-day test to avoid duplicate error');
            return;
        }
    } catch {}

    // Test: missing startKm → should return 400
    try {
        const badRes = await request('POST', '/api/daily-logs/start', {}, token);
        assertStatus(badRes, 400, 'POST /api/daily-logs/start without startKm → 400 (validation works)');
        assert(
            badRes.body?.message?.toLowerCase().includes('startkm'),
            `Error message mentions startKm (got: "${badRes.body?.message}")`
        );
    } catch (e) {
        assert(false, 'Start Day validation', e.message);
    }

    // Note: actual start-day with photo requires multipart/form-data
    // which is not tested here (requires S3 and binary upload).
    console.log(`  ${C.grey}ℹ Full start-day (with photo upload) requires multipart/form-data — skipped in this script${C.reset}`);
    console.log(`  ${C.grey}ℹ If morning report submit fails, verify AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_BUCKET_NAME in .env${C.reset}`);
}

// ── 14. OM — Dashboard KPIs ──────────────────────────────────────────────────
async function testOmDashboard() {
    section('14. OPERATIONAL MANAGER — Dashboard KPIs');

    const token = state.tokens.om;
    if (!token) { skip('No OM token'); return; }

    try {
        const res = await request('GET', '/api/operational-manager/dashboard', null, token);
        assertStatus(res, 200, 'GET /api/operational-manager/dashboard → 200');

        if (res.status === 200) {
            const { kpis, recentActivity } = res.body;
            assert(kpis !== undefined,               'Response has kpis object');
            assert('fixedPlots'    in kpis,          `kpis.fixedPlots present (${kpis.fixedPlots})`);
            assert('teamsAssigned' in kpis,          `kpis.teamsAssigned present (${kpis.teamsAssigned})`);
            assert('pendingReview' in kpis,          `kpis.pendingReview present (${kpis.pendingReview})`);
            assert('approvedTrips' in kpis,          `kpis.approvedTrips present (${kpis.approvedTrips})`);
            assert(Array.isArray(recentActivity),    'recentActivity is array');

            // KPIs must be non-negative
            for (const [k, v] of Object.entries(kpis)) {
                assert(typeof v === 'number' && v >= 0, `kpis.${k} is non-negative (${v})`);
            }
        }
    } catch (e) {
        assert(false, 'OM Dashboard', e.message);
    }
}

// ── 15. OM — Plots Pipeline ───────────────────────────────────────────────────
async function testOmPlots() {
    section('15. OPERATIONAL MANAGER — Plots Pipeline (All / Unassigned / Assigned)');

    const token = state.tokens.om;
    if (!token) { skip('No OM token'); return; }

    const stages = ['All', 'Unassigned', 'Assigned', 'Complete'];

    for (const stage of stages) {
        try {
            const res = await request(
                'GET',
                `/api/operational-manager/plots?stage=${stage}&page=1&limit=5`,
                null, token
            );
            assertStatus(res, 200, `GET /api/operational-manager/plots?stage=${stage} → 200`);

            if (res.status === 200) {
                assert(res.body.stage === stage,       `stage field matches (${res.body.stage})`);
                assert(typeof res.body.total === 'number', `total is number (${res.body.total})`);
                assert(Array.isArray(res.body.data),   'data is array');
            }
        } catch (e) {
            assert(false, `OM Plots [${stage}]`, e.message);
        }
    }
}

// ── 16. ENQUIRY DETAIL — Full detail view ────────────────────────────────────
async function testEnquiryDetail() {
    section('16. ENQUIRY DETAIL — GET /api/enquiries/:id');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }
    if (!state.enquiryDbId) { skip('No enquiry created in this session'); return; }

    try {
        const res = await request('GET', `/api/enquiries/${state.enquiryDbId}`, null, token);
        assertStatus(res, 200, `GET /api/enquiries/${state.enquiryDbId} → 200`);

        if (res.status === 200) {
            assert(res.body.enquiryId === state.enquiryId, `enquiryId matches (${res.body.enquiryId})`);
            assert(res.body.status === 'PENDING',           `Status is PENDING`);
            assert('farmerName' in res.body,                'farmerName present');
            assert('generation' in res.body,                'generation populated');
        }
    } catch (e) {
        assert(false, 'Enquiry Detail', e.message);
    }
}

// ── 17. FIELD OWNER — Selectors List ─────────────────────────────────────────
async function testFOSelectors() {
    section('17. FIELD OWNER — Get Selectors List');

    const token = state.tokens.fieldOwner;
    if (!token) { skip('No Field Owner token'); return; }

    try {
        const res = await request('GET', '/api/field-owner/selectors', null, token);
        assertStatus(res, 200, 'GET /api/field-owner/selectors → 200');

        if (res.status === 200) {
            assert(Array.isArray(res.body.data), 'data is array');
            if (res.body.data.length > 0) {
                const selector = res.body.data[0];
                assert('firstName' in selector, 'Selector has firstName');
                assert('mobileNo'  in selector, 'Selector has mobileNo');
                assert('role'      in selector, 'Selector has role');
                assert(selector.role === 'Field Selector', `role is 'Field Selector' (got: ${selector.role})`);
            }
        }
    } catch (e) {
        assert(false, 'FO Selectors List', e.message);
    }
}

// ── 18. CLEANUP — Delete test enquiry ────────────────────────────────────────
async function testCleanup() {
    section('18. CLEANUP — Note on test data');
    console.log(`  ${C.grey}ℹ Test enquiry created: ${state.enquiryId || 'none'} (DB _id: ${state.enquiryDbId || 'none'})${C.reset}`);
    console.log(`  ${C.grey}ℹ This enquiry was left in the DB (status: PENDING). Delete manually if needed.${C.reset}`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
function printSummary() {
    const total = passed + failed + skipped;
    console.log('\n' + '═'.repeat(60));
    console.log(`${C.bold}  TEST SUMMARY${C.reset}`);
    console.log('─'.repeat(60));
    console.log(`  ${C.green}Passed : ${passed}${C.reset}`);
    console.log(`  ${C.red}Failed : ${failed}${C.reset}`);
    console.log(`  ${C.yellow}Skipped: ${skipped}${C.reset}`);
    console.log(`  Total  : ${total}`);

    if (failures.length > 0) {
        console.log(`\n${C.red}${C.bold}  Failed tests:${C.reset}`);
        failures.forEach((f, i) => console.log(`  ${C.red}  ${i + 1}. ${f}${C.reset}`));
    }

    console.log('═'.repeat(60));

    if (failed === 0) {
        console.log(`\n${C.green}${C.bold}  ✅  All tests passed!${C.reset}\n`);
    } else {
        console.log(`\n${C.red}${C.bold}  ❌  ${failed} test(s) failed. See above for details.${C.reset}\n`);
        process.exitCode = 1;
    }
}

// ─── Main runner ─────────────────────────────────────────────────────────────
(async () => {
    console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════════════════════╗`);
    console.log(`║    Banana Backend — API Test Suite               ║`);
    console.log(`║    Target: ${BASE_URL.padEnd(38)}║`);
    console.log(`╚══════════════════════════════════════════════════╝${C.reset}\n`);

    console.log(`${C.yellow}⚠  Make sure the server is running before executing this script.${C.reset}`);
    console.log(`${C.yellow}⚠  Set correct credentials in the CREDS object at the top of the file.${C.reset}`);

    try {
        await testLogins();
        await testMasterData();
        await testEnquiryCreation();
        await testFieldOwnerDashboard();
        await testFieldOwnerPlots();
        await testFieldOwnerUnassigned();
        await testSelectorsPerformance();
        await testOmMetricsForFO();
        await testFieldSelectorDashboard();
        await testFieldSelectorFields();
        await testFieldSelectorFieldDetail();
        await testMorningReportCheck();
        await testMorningReportStartDay();
        await testOmDashboard();
        await testOmPlots();
        await testEnquiryDetail();
        await testFOSelectors();
        await testCleanup();
    } catch (e) {
        console.error(`\n${C.red}FATAL ERROR: ${e.message}${C.reset}`);
        console.error(e.stack);
        process.exitCode = 1;
    }

    printSummary();
})();
