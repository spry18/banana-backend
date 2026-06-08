# Banana Transport System Architecture & Feature Report

Welcome to the comprehensive system documentation for the **Banana Transport Platform**. This document serves as a guide for clients, stakeholders, and developers to understand the platform's multi-layered architecture, system workflows, role capabilities, and integration points.

---

## 1. Centralized Control & Mobile Apps Overview

The platform is designed to manage the end-to-end banana sourcing, quality inspection, purchasing, and transport logistics workflow. The system comprises **1 Centralized Web Admin Portal** and **6 Role-Specific Mobile Applications** built on a single, secure backend API.

```
                  +--------------------------------+
                  |    Central Admin Web Portal    |
                  +---------------+----------------+
                                  |
                                  v
+---------------------------------+---------------------------------+
|                                                                   |
|                       Node.js & Express API                       |
|                   MongoDB Atlas (Database Layer)                  |
|                                                                   |
+--+---------------+---------------+----------------+-------------+-+
   |               |               |                |             |
   v               v               v                v             v
+--+---+       +---+---+       +---+---+        +---+---+     +---+---+
|  FO  |       |  FS   |       |  OM   |        |Munshi |     |Driver |
| App  |       | App   |       | App   |        | App   |     | Apps  |
+------+       +-------+       +-------+        +-------+     +-------+
```

### System Interfaces:
1. **Admin Web Portal**: Central management, control tower, audit log monitor, master data setups, and dashboard metrics.
2. **Field Owner (FO) Mobile App**: Used by field agents representing farm areas to register and track farmer enquiries.
3. **Field Selector (FS) Mobile App**: Used by quality inspectors to physically visit farms, inspect crops, and submit details.
4. **Operational Manager (OM) Mobile App**: Used to negotiate rates, fix deals, and orchestrate logistics (dispatch crew/vehicles).
5. **Munshi Mobile App**: Used by supervisor-level crew members at the farm to manage harvest and submit packing logs.
6. **Eicher Driver Mobile App**: Used by Eicher truck drivers for route transit updates, fuel advances, and trip submissions.
7. **Pickup Driver Mobile App**: Used by secondary pickup vehicle drivers who transport produce from farm segments to Eicher trucks.

---

## 2. Role-Based Feature Matrix

### A. Field Owner (FO) App
The Field Owner is the primary point of contact for farmers. They manage enquiries and select selectors.
* **Dashboard KPIs**: Bounded by 24-hour cycle (IST) except cumulative unassigned:
  * Total enquiries, Selected, Rejected, Fixed Rate, Missed, Future Selection, and Rescheduled counts.
  * Daily, Weekly, and Monthly counts of `SELECTED` and `REJECTED` plots.
  * Lifetime unassigned plots count.
* **Enquiry Management**: Create and update enquiries (bypasses 24-hour lock if status is `PENDING`).
* **Selector Assignment**: Assign and schedule visits for Field Selectors.
* **Rescheduling**: Reschedule rejected or crop inspection visits.
* **OM Metrics Feed**: New pipeline metrics API showing all active Operational Managers along with counts of their unassigned, assigned, and completed workload.

### B. Field Selector (FS) App
The Field Selector is the crop quality inspector who evaluates crops directly at the farm.
* **Inspection Submissions**: Submit physical inspections for assigned crop areas:
  * Input minimum/maximum boxes, crop recovery percentage, crop size category, and quality notes.
  * Transition enquiry status to `SELECTED` (approved crop) or `REJECTED` (unfit crop).
* **Worklist Feed**: Receive active inspection jobs with in-app notifications and WhatsApp alerts.

### C. Operational Manager (OM) App
The Operational Manager is responsible for commercial closure and dispatch logistics.
* **Dashboard KPIs**: Monitor fixed plots ready for harvest, teams assigned, and pending reviews.
* **Enquiry Rate Fixing**: Lock purchasing rate, select buyer company, estimate box quantity, and transition crop status to `RATE_FIXED`.
* **Logistics Assignments**: Dispatch crew to rate-fixed farms. Select Munshi, Eicher Driver, and Pickup Driver (auto-resolves vehicle from driver profiles).
* **Team Reassignment**: Instantly update assigned crew (`PUT /change-team`) to handle logistics delays.
* **Execution Approvals**: Review merged reports (Trip + Packing) and selectively approve or reject components (Munshi's packing, Eicher's trip, or Pickup's trip) with feedback.

### D. Munshi App
The Munshi is the harvest crew supervisor.
* **Start Day / End Day**: Submit morning/evening odometer readings (with photos) to calculate daily mileage.
* **Odometer Mileage Validation**: Validates that ending kilometers are greater than starting kilometers.
* **Start Harvesting Notification**: Click toggle on app to set `isHarvesting: true` and instantly trigger in-app alerts to OM and FO (no external SMS/WhatsApp).
* **Packing Reports**: Submit box-level harvest count breakdowns, wastage, and packing line photos. Transition assignment to `COMPLETED` for OM review.
* **Rejection Resubmission**: View rejection remarks and edit/resubmit rejected packing reports.
* **Overslow / Vehicle Addition**: Request additional/extra vehicles (`add-vehicle`) to handle crop overflow.

### E. Eicher & Pickup Driver Apps
Drivers manage the physical logistics of the crop transport.
* **Odometer Logs**: Submit morning and evening odometer readings with photos.
* **Route Transits**: Log start-route, mid-route, and destination arrivals.
* **Toll & Expenses**: Log toll slips, load slips, and weight slips.
* **Diesel/Petrol Advance**: Receive advance payouts via the OM (which sends automatic WhatsApp slips to drivers).

### F. Admin Web Portal
The ultimate control tower with absolute system authority.
* **Dashboard Control Tower**: 24-hour IST cycle stats feed for active, completed, and pending visits.
* **User Management**: Register and manage system users (activate/deactivate system access).
* **Master Data Management**: Manage standard dropdown options (crop generations, buyer companies, vehicle categories, crop brands).
* **SLA Timeouts**: System cron automatically cancels selector assignments if they fail to perform inspections within 24 hours.

---

## 3. End-to-End Crop Sourcing & Logistics Workflow

```
[FO App] Create Enquiry (PENDING)
       |
       v (FO App: Assign Selector)
[FS App] Visit & Inspect Plot (ASSIGNED)
       |
       +---> [REJECTED] ---> (Back to PENDING or RESCHEDULED)
       |
       +---> [SELECTED] ---> (Ready for Purchase)
              |
              v (OM/Admin: Lock Rate)
       [RATE_FIXED]
              |
              v (OM App: Assign Crew & Logistics)
       [ASSIGNED] (Logistics PENDING)
              |
              v (Munshi App: Toggle Start Harvest)
       [HARVESTING IN PROGRESS]
              |
              v (Munshi App: Submit Packing Logs)
       [Logistics COMPLETED] (Awaiting OM Review)
              |
              v (OM App: Review Logs)
              +---> [REJECTED] ---> (Munshi Resubmit)
              |
              +---> [APPROVED]
                     |
                     v
       [Enquiry COMPLETED] (Locked for Finance Payout)
```

1. **Sourcing (FO)**: Field Owner creates an enquiry for a farmer's crop.
2. **Inspection (FS)**: Field Selector is assigned. They visit the farm, check crop quality, and select/reject it.
3. **Closing (OM)**: Operational Manager locks the rate (`RATE_FIXED`) with the buyer company.
4. **Logistics (OM)**: OM dispatches Munshi + Drivers.
5. **Harvest (Munshi)**: Munshi starts harvest (notifies OM & FO) and logs packed boxes.
6. **Delivery (Driver)**: Drivers transport crop to the company depot and submit fuel/trip receipts.
7. **Approval (OM)**: OM reviews execution records. Once approved, the Enquiry is closed as `COMPLETED`.

---

## 4. Key Integrations & System Features

* **AWS S3 Image Store**: Integrates secure image storage for odometer logs, toll slips, and packing line photos.
* **Pinnacle WhatsApp Automation**: Sends automated templates directly to farmers (enquiry receipt, schedule confirmation, final packing metrics) and drivers (payout receipts).
* **SLA Timeout Cron**: Protects scheduling pipeline by auto-canceling selector assignments exceeding 24 hours.
* **IST Timezone Alignment**: Restricts metrics to local timezone offsets (IST, UTC+5:30) for precision-reporting.
* **Deep Audit Logger**: Logs every database update, status change, and user session activity.
