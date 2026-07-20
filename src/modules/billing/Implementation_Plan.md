# Billing Module — Approved Implementation Plan
> **Status**: ✅ APPROVED — Implementation in progress.
> **API Mapping Reference**: `billing_api_mapping_report.md` (saved to repo root)
> **Architectural Boundary**: Every file lives exclusively inside `src/modules/billing/`.
> **Legacy files modified**: `server.js` — 1 line only.

---

## Approved Architectural Constraints

1. **STRICT ISOLATION & ZERO-TOUCH POLICY**: No modifications to any existing legacy files or folders (except one-line router registration in server.js). All logic is contained entirely within `src/modules/billing/`.
2. **POSTMAN INTEGRATION**: `src/modules/billing/postman/Billing_Module.postman_collection.json` — fully parameterized Postman collection for all controllers.
3. **HYBRID HANDLING**:
   - Invoices and receipts: Generated via PDFKit → saved to S3 under `billing-uploads/` → S3 URL stored in DB → URL returned to client.
   - CSV/Excel data: Streamed directly via ExcelJS.
   - Access control: `Admin` role only, via read-only import of existing `auth.middleware.js`.

---

## Directory Tree

```
src/modules/billing/
├── Implementation_Plan.md          ← This file
├── billing.router.js               ← Master router
├── shared/
│   ├── billing.asyncHandler.js
│   ├── billing.upload.js           ← Multer-S3 + programmatic uploadBufferToS3()
│   ├── billing.pdf.js              ← PDFKit generators → S3 upload → URL stored in DB
│   └── billing.notify.js           ← Firebase Admin push notifications
├── master/
│   ├── billingMaster.controller.js ← GET banks (static), companies, vehicles (read-only model imports)
│   └── billingMaster.routes.js
├── dashboard/
│   ├── dashboard.controller.js
│   └── dashboard.routes.js
├── farmer-billing/
│   ├── farmerBill.model.js
│   ├── farmerBill.controller.js
│   └── farmerBill.routes.js
├── farmer-payment/
│   ├── farmerPayment.model.js
│   ├── farmerPayment.controller.js
│   └── farmerPayment.routes.js
├── company-billing/
│   ├── companyBill.model.js
│   ├── companyBill.controller.js
│   └── companyBill.routes.js
├── company-payment/
│   ├── companyPayment.model.js
│   ├── companyPayment.controller.js
│   └── companyPayment.routes.js
├── eicher/
│   ├── eicherTrip.model.js
│   ├── eicherPayment.model.js
│   ├── eicher.controller.js
│   └── eicher.routes.js
├── munshi/
│   ├── munshiLedger.model.js
│   ├── munshiPayment.model.js
│   ├── munshi.controller.js
│   └── munshi.routes.js
├── kharchi/
│   ├── kharchi.model.js
│   ├── kharchiPayment.model.js
│   ├── kharchi.controller.js
│   └── kharchi.routes.js
├── pickup/
│   ├── pickupTrip.model.js
│   ├── pickupPayment.model.js
│   ├── pickup.controller.js
│   └── pickup.routes.js
├── cold-storage/
│   ├── coldStorageEntry.model.js
│   ├── coldStoragePayment.model.js
│   ├── coldStorage.controller.js
│   └── coldStorage.routes.js
├── packing-material/
│   ├── packingProcurement.model.js
│   ├── packingPayment.model.js
│   ├── packingMaterial.controller.js
│   └── packingMaterial.routes.js
├── fuel/
│   ├── fuelEntry.model.js
│   ├── fuelPayment.model.js
│   ├── fuel.controller.js
│   └── fuel.routes.js
├── commission-agent/
│   ├── commissionAgent.model.js
│   ├── commissionPayment.model.js
│   ├── commissionAgent.controller.js
│   └── commissionAgent.routes.js
├── salary/
│   ├── employee.model.js
│   ├── payroll.model.js
│   ├── salary.controller.js
│   └── salary.routes.js
└── postman/
    └── Billing_Module.postman_collection.json
```

---

## Controller Groups

| # | Controller | Endpoints |
|---|---|---|
| 1 | `dashboard.controller.js` | 5 aggregation endpoints |
| 2 | `farmerBill.controller.js` | CRUD + PDF + share + history |
| 3 | `farmerPayment.controller.js` | CRUD + summary |
| 4 | `companyBill.controller.js` | CRUD + club bills + outstanding + export |
| 5 | `companyPayment.controller.js` | CRUD |
| 6 | `eicher.controller.js` | Trips + payment summary + payments |
| 7 | `munshi.controller.js` | Ledger + payment summary + payments |
| 8 | `kharchi.controller.js` | Expenses + approve/reject + payments |
| 9 | `pickup.controller.js` | Trips + payment summary + payments |
| 10 | `coldStorage.controller.js` | Entries + payment cycles + payments |
| 11 | `packingMaterial.controller.js` | Procurements + vendor summary + payments + upload |
| 12 | `fuel.controller.js` | Fuel entries + pump summary + payments |
| 13 | `commissionAgent.controller.js` | Agents CRUD + commission payments |
| 14 | `salary.controller.js` | Employees CRUD + payroll |
| 15 | `billingMaster.controller.js` | Banks (static) + Companies + Vehicles (read-only) |

---

## MongoDB Collections (14 new)

| Collection | Key Indexes |
|---|---|
| `farmer_bills` | `{ date:-1 }`, `{ status:1 }`, `{ farmerName:1, date:-1 }`, `{ status:1, sentDate:1 }` |
| `farmer_payments` | `{ date:-1 }`, `{ farmerBillRef:1 }`, `{ isCompleted:1 }` |
| `company_bills` | `{ date:-1 }`, `{ company:1, date:-1 }`, `{ status:1 }`, `{ vehicleNo:1 }`, `{ invoiceNo:1 }` |
| `company_payments` | `{ date:-1 }`, `{ companyName:1 }`, `{ transactionId:1 }` |
| `eicher_trips` | `{ date:-1 }`, `{ vehicleNo:1, date:-1 }` |
| `eicher_payments` | `{ date:-1 }`, `{ vehicleNo:1 }` |
| `munshi_ledger` | `{ date:-1 }`, `{ munshiName:1, date:-1 }` |
| `munshi_payments` | `{ date:-1 }`, `{ munshiName:1 }` |
| `kharchi_expenses` | `{ date:-1 }`, `{ status:1, type:1 }`, `{ term:1 }` |
| `kharchi_payments` | `{ date:-1 }`, `{ expenseRef:1 }` |
| `pickup_trips` | `{ date:-1 }`, `{ vehicleNo:1, date:-1 }` |
| `pickup_payments` | `{ date:-1 }`, `{ vehicleNo:1 }` |
| `cold_storage_entries` | `{ date:-1 }`, `{ coldStorageName:1, date:-1 }` |
| `cold_storage_payments` | `{ date:-1 }`, `{ coldStorageName:1 }` |
| `packing_procurements` | `{ date:-1 }`, `{ supplier:1 }` |
| `packing_payments` | `{ date:-1 }`, `{ vendorName:1 }` |
| `fuel_entries` | `{ date:-1 }`, `{ pumpName:1, paymentCycle:1 }`, `{ vehicleNo:1, date:-1 }` |
| `fuel_payments` | `{ date:-1 }`, `{ pumpName:1 }` |
| `commission_agents` | `{ isActive:1 }` |
| `commission_payments` | `{ date:-1 }`, `{ agentRef:1 }` |
| `billing_employees` | `{ isActive:1 }`, `{ role:1 }` |
| `billing_payroll` | `{ employeeRef:1, month:-1 }`, `{ month:-1 }`, `{ status:1 }` |

---

## Technical Solutions

### File Uploads
- Isolated `billing.upload.js` with its own multer-S3 instance
- S3 key prefix: `billing-uploads/packing/` for bill photos
- Exports `billingUpload` (multer middleware) and `uploadBufferToS3(buffer, key, contentType)` (programmatic)

### PDF Generation & Storage
- PDFKit generates PDF into buffer
- `uploadBufferToS3` pushes to S3 under `billing-uploads/invoices/` or `billing-uploads/receipts/`
- S3 URL stored in DB (`pdfUrl` / `receiptUrl` / `invoiceUrl` field)
- Subsequent requests return cached URL without re-generating

### Sharing
- Firebase Admin `messaging().send()` for push notifications
- WhatsApp via Pinnacle API (future hook in `billing.notify.js`)

### Shared Master Data
- `Company` model: read-only import from `../../master-data/company.model`
- `Vehicle` model: read-only import from `../../master-data/vehicle.model`
- Banks: Static config list in `billingMaster.controller.js`

### Auth
- All routes: `protect` + `authorize('Admin')` via read-only import of `../../middlewares/auth.middleware`

---

## server.js Change (ONLY change to legacy file)

```js
// Add AFTER existing routes, BEFORE error handlers:
app.use('/api/billing', require('./src/modules/billing/billing.router'));
```

---

## npm Packages Required
**ZERO new packages** — all dependencies already in `package.json`:
- `pdfkit` ✅ | `multer` + `multer-s3` ✅ | `@aws-sdk/client-s3` ✅ | `firebase-admin` ✅ | `exceljs` ✅
