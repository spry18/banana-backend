# Billing Module — Page-to-API Mapping Report

> **Scope**: All files under `src/features/billing/` (pages + components).
> **Architectural Constraint**: Backend must live in a **completely isolated directory** with its own routes, controllers, and models — zero modification to any existing backend code.

---

## 1. BillingDashboard.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `BillingDashboard.jsx` | Page Load — fetch KPI summary cards | `GET /api/billing/dashboard/summary?date=YYYY-MM-DD` | **Res**: `{ totalBoxesToday, totalSalesValue, companyOutstanding, farmerPayable }` |
| `BillingDashboard.jsx` | Page Load — fetch today's company sales table | `GET /api/billing/dashboard/sales-by-company?date=YYYY-MM-DD` | **Res**: `[{ company, boxes, rate, amount, status }]` |
| `BillingDashboard.jsx` | Page Load — fetch farmers overdue 25+ days | `GET /api/billing/dashboard/overdue-farmers?minDays=25` | **Res**: `[{ farmerName, daysOverdue, outstandingAmount, initial }]` |
| `BillingDashboard.jsx` | Date picker change — reload all dashboard data | `GET /api/billing/dashboard/summary?date=YYYY-MM-DD` | Same as page load (query param date changes) |
| `BillingDashboard.jsx` | Page Load — bar chart: boxes harvested last 7 days | `GET /api/billing/dashboard/harvest-chart?range=7d` | **Res**: `[{ day, boxCount }]` |
| `BillingDashboard.jsx` | Page Load — pie chart: outstanding by company | `GET /api/billing/dashboard/outstanding-chart` | **Res**: `[{ company, outstandingAmount }]` |
| `BillingDashboard.jsx` | Click "See all" → navigates to FarmerBilling | _Navigation only — no API call_ | — |

---

## 2. FarmerBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `FarmerBilling.jsx` | Page Load (Billing tab) — fetch farmer billing list | `GET /api/billing/farmer/bills?date=YYYY-MM-DD&search=&status=` | **Res**: `[{ date, farmer, contact, location, company, rate, packingType, boxes, weight, amount, status, sentDate }]` |
| `FarmerBilling.jsx` | Page Load (Billing tab) — fetch KPI summary cards | `GET /api/billing/farmer/summary` | **Res**: `{ farmersToday, payableTotal, overdue25Days, overdueLakhAmount, paidThisWeek, paidFarmersCount }` |
| `FarmerBilling.jsx` | Search input change | `GET /api/billing/farmer/bills?search=<query>` | **Res**: filtered `[FarmerBillRecord]` |
| `FarmerBilling.jsx` | Date filter change | `GET /api/billing/farmer/bills?date=YYYY-MM-DD` | **Res**: filtered `[FarmerBillRecord]` |
| `FarmerBilling.jsx` | Filter button (status filter) | `GET /api/billing/farmer/bills?status=PENDING\|SENT` | **Res**: filtered `[FarmerBillRecord]` |
| `FarmerBilling.jsx` | Edit icon click (status ≠ SENT) → opens `RecordFarmerPayment` | _Navigation with state — triggers GET on destination page_ | State passed: `{ farmerName, outstanding, boxes, weight }` |
| `FarmerBilling.jsx` | Eye icon click — view bill detail | `GET /api/billing/farmer/bills/:billId` | **Res**: Full bill record |
| `FarmerBilling.jsx` | Download icon click — download PDF invoice | `GET /api/billing/farmer/bills/:billId/pdf` | **Res**: PDF file stream |
| `FarmerBilling.jsx` | Share icon click — share bill | `POST /api/billing/farmer/bills/:billId/share` | **Req**: `{ medium: "whatsapp"\|"email", recipientContact }` |
| `FarmerBilling.jsx` | Wallet icon → navigate to payment-records page | _Navigation with state_ | State: `{ farmerName, outstanding }` |
| `FarmerBilling.jsx` | Payments tab load — fetch payment history | `GET /api/billing/farmer/payments?search=` | **Res**: `[{ date, bankName, beneficiary, accNo, submittedDate, dayCount, isCompleted }]` |
| `FarmerBilling.jsx` | Payments tab load — fetch payment KPI cards | `GET /api/billing/farmer/payments/summary` | **Res**: `{ totalPaid, totalPending, paidThisWeek, paymentsProcessedCount }` |
| `FarmerBilling.jsx` | Eye icon on payment row — view payment detail | `GET /api/billing/farmer/payments/:paymentId` | **Res**: Full payment record |
| `FarmerBilling.jsx` | History tab load | `GET /api/billing/farmer/history?page=1&limit=20` | **Res**: Paginated history records |

---

## 3. RecordFarmerPayment.jsx (farmer/record-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `RecordFarmerPayment.jsx` | Page Load — pre-fill from navigation state | _Client-side only (state from router)_ | — |
| `RecordFarmerPayment.jsx` | Submit Bill button → opens PaymentReceiptModal | `POST /api/billing/farmer/bills` | **Req**: `{ farmerName, vehicleNo, boxes, grossWeight, wastage, netWeight, danda, remainingWeight, rate, transport, initialAmount, totalAmount, netPayable, date, note }` / **Res**: `{ billId, status: "created" }` |

---

## 4. FarmerRecordPayment.jsx (billing/farmer/payment-records)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `FarmerRecordPayment.jsx` | Page Load — pre-fill from navigation state | _Client-side only_ | — |
| `FarmerRecordPayment.jsx` | Save Payment button | `POST /api/billing/farmer/payments` | **Req**: `{ farmerName, date, amountPaid, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 5. CompanyBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `CompanyBilling.jsx` | Page Load (Billing tab) — fetch company billing list | `GET /api/billing/company/bills?date=&search=&status=` | **Res**: `[{ date, farmer, contact, location, vehicle, company, rate, packingType, boxes, weight, amount, status }]` |
| `CompanyBilling.jsx` | Page Load (Billing tab) — fetch KPI cards | `GET /api/billing/company/summary` | **Res**: `{ todayVehicles, billedValue, billsGenerated, paymentReceived, outstanding, outstandingCompanies }` |
| `CompanyBilling.jsx` | Search/Filter/Date change | `GET /api/billing/company/bills?search=&date=&status=` | **Res**: filtered `[CompanyBillRecord]` |
| `CompanyBilling.jsx` | Edit icon → navigate to new bill form | _Navigation only_ | — |
| `CompanyBilling.jsx` | Eye icon — view bill detail | `GET /api/billing/company/bills/:billId` | **Res**: Full bill record |
| `CompanyBilling.jsx` | Download icon | `GET /api/billing/company/bills/:billId/pdf` | **Res**: PDF file stream |
| `CompanyBilling.jsx` | Share icon | `POST /api/billing/company/bills/:billId/share` | **Req**: `{ medium, recipientContact }` |
| `CompanyBilling.jsx` | Link (Club) icon → opens Club Bills modal | _Client-side modal open_ | — |
| `CompanyBilling.jsx` | Club Bills modal: "Fetch Details" button | `GET /api/billing/company/bills/club?vehicle1=<no>&vehicle2=<no>` | **Res**: `{ list: [BillRecord, BillRecord], totalBoxes, totalWeight, totalWastage }` |
| `CompanyBilling.jsx` | Club Bills modal: "Generate Bill" button | `POST /api/billing/company/bills/club` | **Req**: `{ vehicleNos: [v1, v2], companyId }` / **Res**: `{ clubBillId, status: "generated" }` |
| `CompanyBilling.jsx` | Payments tab: "Record Payment" button → navigate | _Navigation only_ | — |
| `CompanyBilling.jsx` | Payments tab load — Company Wise Outstanding table | `GET /api/billing/company/outstanding` | **Res**: `[{ company, totalBill, received, outstanding }]` |
| `CompanyBilling.jsx` | Payments tab load — Payments Received table | `GET /api/billing/company/payments?search=` | **Res**: `[{ date, company, txId, receivedIn, amount, paymentMode, status }]` |
| `CompanyBilling.jsx` | Edit icon on payment row | `GET /api/billing/company/payments/:paymentId` | **Res**: Full payment record |
| `CompanyBilling.jsx` | Eye icon on payment row | `GET /api/billing/company/payments/:paymentId` | **Res**: Full payment record |
| `CompanyBilling.jsx` | Outstanding table: Delete icon | `DELETE /api/billing/company/outstanding/:id` | **Res**: `{ status: "deleted" }` |
| `CompanyBilling.jsx` | Outstanding table: Download icon | `GET /api/billing/company/outstanding/:id/pdf` | **Res**: PDF file |
| `CompanyBilling.jsx` | History tab: "Export History" button | `GET /api/billing/company/history/export?format=csv` | **Res**: CSV/XLSX file stream |
| `CompanyBilling.jsx` | History tab load | `GET /api/billing/company/history?page=1&limit=20` | **Res**: Paginated bill history |

---

## 6. CompanyRecordPayment.jsx (billing/record-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `CompanyRecordPayment.jsx` | Page Load — populate Company dropdown | `GET /api/master/companies` | **Res**: `[{ id, name }]` |
| `CompanyRecordPayment.jsx` | Save Payment button | `POST /api/billing/company/payments` | **Req**: `{ date, companyId, transactionId, amount, mode, receivedBankName, receivedCompanyName, remark }` / **Res**: `{ paymentId, status: "saved" }` |

---

## 7. EicherBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `EicherBilling.jsx` | Page Load (Billing tab) — fetch Eicher trip list | `GET /api/billing/eicher/trips?filter=Weekly&date=` | **Res**: `[{ date, vehicle, route, km, toll, hault, diesel, net }]` |
| `EicherBilling.jsx` | Page Load (Billing tab) — fetch KPI summary cards | `GET /api/billing/eicher/summary?filter=Weekly` | **Res**: `{ tripsToday, totalDistance, dieselAdvance, payable }` |
| `EicherBilling.jsx` | Search/Filter/Date/Period change | `GET /api/billing/eicher/trips?search=&filter=Daily\|Weekly\|Monthly&date=` | Filtered `[EicherTrip]` |
| `EicherBilling.jsx` | Eye icon — view trip detail | `GET /api/billing/eicher/trips/:tripId` | **Res**: Full trip record |
| `EicherBilling.jsx` | Edit icon — edit trip | `PATCH /api/billing/eicher/trips/:tripId` | **Req**: updatable fields / **Res**: updated record |
| `EicherBilling.jsx` | Payments tab load — Eicher Wise aggregated table | `GET /api/billing/eicher/payment-summary` | **Res**: `[{ vehicle, trips, km, diesel, toll, lineCancel, hault, totalBill, paid, pending }]` |
| `EicherBilling.jsx` | Payments tab load — Recent payment history | `GET /api/billing/eicher/payments/history` | **Res**: `[{ date, vehicle, amount, bank }]` |
| `EicherBilling.jsx` | Wallet icon on aggregated row → navigate to pay form | _Navigation with state: `{ vehicleNo, pendingAmount }`_ | — |

---

## 8. PayEicherForm.jsx (billing/eicher-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PayEicherForm.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `PayEicherForm.jsx` | Save Payment button | `POST /api/billing/eicher/payments` | **Req**: `{ vehicleNo, date, amountPaid, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 9. MunshiBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `MunshiBilling.jsx` | Page Load (Billing tab) — daily ledger table | `GET /api/billing/munshi/ledger?date=&search=` | **Res**: `[{ date, farmer, munshi, company, boxes, vehicleNo, amount }]` |
| `MunshiBilling.jsx` | Page Load (Billing tab) — KPI summary cards | `GET /api/billing/munshi/summary` | **Res**: `{ totalMunshi, payableBalance, boxesHandled, paidThisWeek }` |
| `MunshiBilling.jsx` | Search/Filter/Date change | `GET /api/billing/munshi/ledger?search=&date=` | Filtered list |
| `MunshiBilling.jsx` | Eye icon on ledger row — view detail | `GET /api/billing/munshi/ledger/:entryId` | **Res**: Full entry record |
| `MunshiBilling.jsx` | Edit icon on ledger row | `PATCH /api/billing/munshi/ledger/:entryId` | **Req**: updatable fields / **Res**: updated record |
| `MunshiBilling.jsx` | Payments tab load — Munshi Wise aggregated table | `GET /api/billing/munshi/payment-summary` | **Res**: `[{ munshi, totalBill, paid, pending }]` |
| `MunshiBilling.jsx` | Payments tab load — Recent payment history | `GET /api/billing/munshi/payments/history` | **Res**: `[{ date, munshi, amount, bank, remark }]` |
| `MunshiBilling.jsx` | Wallet icon → navigate to pay Munshi form | _Navigation with state: `{ munshiName, pendingAmount }`_ | — |

---

## 10. PayMunshiForm.jsx (billing/munshi-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PayMunshiForm.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `PayMunshiForm.jsx` | Save Payment button | `POST /api/billing/munshi/payments` | **Req**: `{ munshiName, date, amountPaid, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 11. KharchiBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `KharchiBilling.jsx` | Page Load (Billing tab) — kharchi expenses table (non-approved) | `GET /api/billing/kharchi/expenses?status=pending&type=Small,Big&filter=Weekly` | **Res**: `[{ date, type, item, payTo, purchased, team, amount, status }]` |
| `KharchiBilling.jsx` | Page Load (Billing tab) — KPI summary cards | `GET /api/billing/kharchi/summary` | **Res**: `{ todayKharchi, smallKharchiTotal, bigKharchiTotal, shortTermTotal, longTermTotal }` |
| `KharchiBilling.jsx` | Search/Period filter/Date change | `GET /api/billing/kharchi/expenses?search=&filter=Daily\|Weekly\|Monthly&date=` | Filtered list |
| `KharchiBilling.jsx` | Eye icon → view KharchiDetails panel | `GET /api/billing/kharchi/expenses/:expenseId` | **Res**: Full expense record |
| `KharchiBilling.jsx` | KharchiDetails: Approve button | `PATCH /api/billing/kharchi/expenses/:expenseId/approve` | **Res**: `{ status: "Approved" }` |
| `KharchiBilling.jsx` | KharchiDetails: Reject button | `PATCH /api/billing/kharchi/expenses/:expenseId/reject` | **Res**: `{ status: "Rejected" }` |
| `KharchiBilling.jsx` | Small Kharchi (<₹1000): Wallet icon (inline record payment) | `POST /api/billing/kharchi/payments` | **Req**: `{ expenseId, type: "small" }` / **Res**: `{ paymentId }` |
| `KharchiBilling.jsx` | Payments tab load — approved Big Kharchi table | `GET /api/billing/kharchi/expenses?status=Approved&type=Big` | **Res**: Approved big kharchi records |
| `KharchiBilling.jsx` | Wallet icon on Payments tab → navigate to pay form | _Navigation with state: `{ data: row }`_ | — |

---

## 12. RecordKharchiPaymentForm.jsx (billing/kharchi-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `RecordKharchiPaymentForm.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `RecordKharchiPaymentForm.jsx` | Save Payment button | `POST /api/billing/kharchi/payments` | **Req**: `{ expenseId, date, term, nature, totalAmount, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 13. PickupBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PickupBilling.jsx` | Page Load (Billing tab) — pickup trip list | `GET /api/billing/pickup/trips?date=&search=` | **Res**: `[{ date, vehicle, driver, route1, route2, km, fuel, toll, amount }]` |
| `PickupBilling.jsx` | Page Load (Billing tab) — KPI summary cards | `GET /api/billing/pickup/summary` | **Res**: `{ tripsToday, totalDistance, dieselAdvance, payable }` |
| `PickupBilling.jsx` | Search/Filter/Date change | `GET /api/billing/pickup/trips?search=&date=` | Filtered list |
| `PickupBilling.jsx` | Eye icon — view trip detail | `GET /api/billing/pickup/trips/:tripId` | **Res**: Full record |
| `PickupBilling.jsx` | Edit icon — edit trip | `PATCH /api/billing/pickup/trips/:tripId` | **Req**: updatable fields / **Res**: updated record |
| `PickupBilling.jsx` | Wallet icon (trip row) — record payment inline | `POST /api/billing/pickup/payments` | **Req**: `{ tripId, amount }` |
| `PickupBilling.jsx` | Payments tab load — Pickup Wise aggregated table | `GET /api/billing/pickup/payment-summary` | **Res**: `[{ vehicle, km, diesel, toll, totalBill, paid, pending }]` |
| `PickupBilling.jsx` | Payments tab load — Recent payment history | `GET /api/billing/pickup/payments/history` | **Res**: `[{ date, vehicle, amount, bank }]` |
| `PickupBilling.jsx` | Wallet icon on aggregated row → navigate to pay form | _Navigation with state: `{ vehicleNo, pendingAmount }`_ | — |

---

## 14. PayPickupForm.jsx (billing/pickup-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PayPickupForm.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `PayPickupForm.jsx` | Save Payment button | `POST /api/billing/pickup/payments` | **Req**: `{ vehicleNo, date, amountPaid, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 15. ColdStorageBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `ColdStorageBilling.jsx` | Page Load (Billing tab) — storage entries table | `GET /api/billing/cold-storage/entries?month=YYYY-MM&date=` | **Res**: `[{ date, storage, company, amount, kgBoxes }]` |
| `ColdStorageBilling.jsx` | Page Load (Billing tab) — KPI summary cards | `GET /api/billing/cold-storage/summary?month=YYYY-MM` | **Res**: `{ totalContainerShifts, totalAmount }` |
| `ColdStorageBilling.jsx` | Month picker / Date change | `GET /api/billing/cold-storage/entries?month=YYYY-MM&date=` | Filtered list |
| `ColdStorageBilling.jsx` | "Add Entry" button → navigate to AddColdStorageEntry | _Navigation only_ | — |
| `ColdStorageBilling.jsx` | Eye icon on entry row | `GET /api/billing/cold-storage/entries/:entryId` | **Res**: Full entry record |
| `ColdStorageBilling.jsx` | Edit icon on entry row | `PATCH /api/billing/cold-storage/entries/:entryId` | **Req**: updatable fields / **Res**: updated record |
| `ColdStorageBilling.jsx` | Payments tab load — payment cycles table | `GET /api/billing/cold-storage/payment-cycles` | **Res**: `[{ storage, cycle, amount, containers, payDate }]` |
| `ColdStorageBilling.jsx` | Wallet icon → navigate to record payment form | _Navigation with state: `{ rowData: { amount, containers } }`_ | — |

---

## 16. AddColdStorageEntry.jsx (billing/add-cold-storage)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `AddColdStorageEntry.jsx` | "Add Container" button — submit form | `POST /api/billing/cold-storage/entries` | **Req**: `{ date, coldStorageName, vehicleNo, receiptNo, containerNo, companyName, brandName, kgBoxes, total4h5h6h, total7h8h, time, amount }` / **Res**: `{ entryId, status: "created" }` |

---

## 17. RecordColdStoragePayment.jsx (billing/record-cold-storage-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `RecordColdStoragePayment.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `RecordColdStoragePayment.jsx` | Page Load — populate Bank dropdown | `GET /api/master/banks` | **Res**: `[{ id, name }]` |
| `RecordColdStoragePayment.jsx` | Save Payment button | `POST /api/billing/cold-storage/payments` | **Req**: `{ date, totalAmount, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 18. PackingMaterialBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PackingMaterialBilling.jsx` | Page Load (Billing tab) — procurement list | `GET /api/billing/packing-material/procurements?date=&search=` | **Res**: `[{ date, companyName, supplier, amount, vehicleNo }]` |
| `PackingMaterialBilling.jsx` | Page Load (Billing tab) — KPI summary card | `GET /api/billing/packing-material/summary` | **Res**: `{ totalPurchase }` |
| `PackingMaterialBilling.jsx` | "Add Procurement" button → navigate | _Navigation only_ | — |
| `PackingMaterialBilling.jsx` | Eye icon — view record | `GET /api/billing/packing-material/procurements/:id` | **Res**: Full record |
| `PackingMaterialBilling.jsx` | Edit icon — edit record | `PATCH /api/billing/packing-material/procurements/:id` | **Req**: updatable fields / **Res**: updated record |
| `PackingMaterialBilling.jsx` | Payments tab load — vendor wise pending table | `GET /api/billing/packing-material/vendor-summary` | **Res**: `[{ vendorName, totalAmount, paidAmount, pendingAmount }]` |
| `PackingMaterialBilling.jsx` | Wallet icon → navigate to payment form | _Navigation with state: `{ vendorName, pendingAmount }`_ | — |

---

## 19. AddProcurementForm.jsx (billing/add-procurement)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `AddProcurementForm.jsx` | "Add Procurement" button — submit form | `POST /api/billing/packing-material/procurements` | **Req**: `{ date, billNo, companyName, vehicleNo, amount, billPhotoUrl }` / **Res**: `{ procurementId, status: "created" }` |
| `AddProcurementForm.jsx` | Upload Bill Photo action | `POST /api/billing/packing-material/procurements/upload-bill` | **Req**: `multipart/form-data { file }` / **Res**: `{ fileUrl }` |

---

## 20. RecordPackingMaterialPayment.jsx (billing/packing-material-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `RecordPackingMaterialPayment.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `RecordPackingMaterialPayment.jsx` | Save Payment button | `POST /api/billing/packing-material/payments` | **Req**: `{ date, vendorName, amount, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 21. PetrolDieselBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PetrolDieselBilling.jsx` | Page Load (Billing tab) — fuel entries table | `GET /api/billing/fuel/entries?filter=Weekly&date=` | **Res**: `[{ date, vehicle, pump, fuel, rate, amount, remark }]` |
| `PetrolDieselBilling.jsx` | Page Load (Billing tab) — KPI summary cards | `GET /api/billing/fuel/summary?filter=Weekly` | **Res**: `{ todayAggregated, todayPetrol, todayDiesel, monthSpend, vehicleCount }` |
| `PetrolDieselBilling.jsx` | Search/Period filter/Date change | `GET /api/billing/fuel/entries?search=&filter=Daily\|Weekly\|15Days&date=` | Filtered list |
| `PetrolDieselBilling.jsx` | "Add Fuel" button | `POST /api/billing/fuel/entries` | **Req**: `{ date, vehicleNo, pumpName, fuelType, rate, amount, remark }` / **Res**: `{ entryId }` |
| `PetrolDieselBilling.jsx` | Eye icon | `GET /api/billing/fuel/entries/:entryId` | **Res**: Full record |
| `PetrolDieselBilling.jsx` | Edit icon | `PATCH /api/billing/fuel/entries/:entryId` | **Req**: updatable fields / **Res**: updated record |
| `PetrolDieselBilling.jsx` | Payments tab load — pump wise cycle data | `GET /api/billing/fuel/pump-summary` | **Res**: `[{ pumpName, cycle, total, petrol, diesel }]` |
| `PetrolDieselBilling.jsx` | Payments tab load — Recent payment history | `GET /api/billing/fuel/payments/history` | **Res**: `[{ date, cycle, amount, bank }]` |
| `PetrolDieselBilling.jsx` | Wallet icon → navigate to pay fuel form | _Navigation with state: `{ pumpName, totalPending, paymentCycle }`_ | — |

---

## 22. PayFuelForm.jsx (billing/fuel-payment)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PayFuelForm.jsx` | Page Load — pre-fill from state | _Client-side only_ | — |
| `PayFuelForm.jsx` | Save Payment button | `POST /api/billing/fuel/payments` | **Req**: `{ pumpName, paymentCycle, date, totalAmount, bankName, beneficiaryName, accountNo, remark }` / **Res**: `{ paymentId, status: "recorded" }` |

---

## 23. CommissionAgentBilling.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `CommissionAgentBilling.jsx` | Page Load (Billing tab) — agent list | `GET /api/billing/commission-agent/agents?date=&search=` | **Res**: `[{ agent, harvest, structure, business, commission }]` |
| `CommissionAgentBilling.jsx` | Page Load — KPI summary cards | `GET /api/billing/commission-agent/summary` | **Res**: `{ activeAgents, businessViaAgents, commissionDue, paidThisMonth, agentsPaid }` |
| `CommissionAgentBilling.jsx` | "Add Agent" button | `POST /api/billing/commission-agent/agents` | **Req**: `{ agentName, harvestType, commissionStructure, commissionValue }` / **Res**: `{ agentId }` |
| `CommissionAgentBilling.jsx` | Search/Filter/Date change | `GET /api/billing/commission-agent/agents?search=&date=` | Filtered list |
| `CommissionAgentBilling.jsx` | Eye icon — view agent detail | `GET /api/billing/commission-agent/agents/:agentId` | **Res**: Full agent record |
| `CommissionAgentBilling.jsx` | Edit icon — edit agent | `PATCH /api/billing/commission-agent/agents/:agentId` | **Req**: updatable fields / **Res**: updated record |
| `CommissionAgentBilling.jsx` | Wallet icon — record commission payment | `POST /api/billing/commission-agent/payments` | **Req**: `{ agentId, date, amount, bankName, beneficiaryName, accountNo, remark }` |

---

## 24. SalaryProfiles.jsx

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `SalaryProfiles.jsx` | Page Load (Payroll tab) — employee list | `GET /api/billing/salary/employees?search=` | **Res**: `[{ id, name, role, salary, status }]` |
| `SalaryProfiles.jsx` | Page Load — KPI summary cards | `GET /api/billing/salary/summary` | **Res**: `{ totalEmployees, monthlyPayroll, paidThisMonth, paidStaffCount, pending, pendingStaffCount }` |
| `SalaryProfiles.jsx` | "Add profile" button | `POST /api/billing/salary/employees` | **Req**: `{ name, role, monthlySalary, joiningDate, commission, petrolAllowance, maintenanceAllowance, bankAccount }` / **Res**: `{ employeeId }` |
| `SalaryProfiles.jsx` | Search input change | `GET /api/billing/salary/employees?search=<query>` | Filtered employee list |
| `SalaryProfiles.jsx` | Eye icon → view employee profile detail | `GET /api/billing/salary/employees/:employeeId` | **Res**: Full employee profile including recent payments, total payable, commissions etc. |
| `SalaryProfiles.jsx` | "Edit profile" button (in detail panel) | `PATCH /api/billing/salary/employees/:employeeId` | **Req**: updatable fields / **Res**: updated profile |
| `SalaryProfiles.jsx` | "Pay this month" button | `POST /api/billing/salary/payroll` | **Req**: `{ employeeId, month: "YYYY-MM", salaryAmount, commissionAmount, totalPayable, bankName }` / **Res**: `{ payrollId, status: "paid" }` |
| `SalaryProfiles.jsx` | History tab load | `GET /api/billing/salary/payroll/history?employeeId=&page=1` | **Res**: Paginated payroll records |

---

## 25. PaymentReceiptModal.jsx (shared component)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `PaymentReceiptModal.jsx` | Modal opens after bill submission — fetch receipt | `GET /api/billing/farmer/bills/:billId/receipt` | **Res**: `{ billId, farmerName, date, netPayable, invoiceNo, qrPaymentData }` |
| `PaymentReceiptModal.jsx` | Download receipt PDF | `GET /api/billing/farmer/bills/:billId/receipt/pdf` | **Res**: PDF file stream |
| `PaymentReceiptModal.jsx` | Share receipt (WhatsApp/Print) | `POST /api/billing/farmer/bills/:billId/receipt/share` | **Req**: `{ medium, contact }` |

---

## 26. Invoice Components (`components/invoice/`)

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| `InvoiceModal.jsx` | Modal opens — fetch invoice data | `GET /api/billing/company/bills/:billId/invoice` | **Res**: Full invoice object (company info, bill-to, dispatch details, line items, bank details, totals) |
| `InvoiceModal.jsx` | Download invoice PDF | `GET /api/billing/company/bills/:billId/invoice/pdf` | **Res**: PDF file stream |
| `InvoiceModal.jsx` | Share invoice | `POST /api/billing/company/bills/:billId/invoice/share` | **Req**: `{ medium, contact }` |

---

## Shared / Cross-Cutting APIs

| Frontend Page File | User Action / Event | Recommended API Method & Route | Data Required (Req Body / Response) |
| :--- | :--- | :--- | :--- |
| All pages with Bank dropdowns | Page Load — populate bank dropdown | `GET /api/master/banks` | **Res**: `[{ id, name }]` |
| All pages with Company dropdowns | Page Load — populate company dropdown | `GET /api/master/companies` | **Res**: `[{ id, name }]` |
| All pages with Vehicle selectors | Page Load — populate vehicle list | `GET /api/master/vehicles` | **Res**: `[{ vehicleNo, type, driverName }]` |
| All pages with search+filter | Any search/filter event | Respective `GET` endpoint with `?search=&status=&date=&page=&limit=` | Standard paginated list response |
