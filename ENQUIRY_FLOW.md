# Enquiry and Logistics Status Lifecycle Flow

This document details the complete state machine, API endpoints, role permissions, and notification flows for enquiries in the Banana Backend.



## 1. Enquiry Status Flow Diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING : Created (FO or Admin)
    PENDING --> ASSIGNED : Field Selector Assigned (PUT /enquiries/:id)
    ASSIGNED --> PENDING : 24h SLA Timeout (Cron/SLA Check)
    ASSIGNED --> SELECTED : Selector Approves Plot (POST /inspections)
    ASSIGNED --> REJECTED : Selector Rejects Plot (POST /inspections)
    
    SELECTED --> RATE_FIXED : Deal Closed / Rate Locked (PATCH /fix-rate/:id)
    SELECTED --> RESCHEDULED : FO Requests Reschedule (PUT /:id/reschedule)
    
    RESCHEDULED --> ASSIGNED : Re-assigned Selector
    
    RATE_FIXED --> ASSIGNED_LOGISTICS : Logistics Team Assigned (POST /logistics/assign)
    
    state ASSIGNED_LOGISTICS {
        [*] --> LOGISTICS_PENDING
        LOGISTICS_PENDING --> LOGISTICS_COMPLETED : Munshi Submits Packing (POST /munshi/packing/:id)
        LOGISTICS_COMPLETED --> LOGISTICS_REJECTED : OM Rejects Packing (PATCH /reject-packing/:id)
        LOGISTICS_REJECTED --> LOGISTICS_PENDING : Resubmission
        LOGISTICS_COMPLETED --> LOGISTICS_APPROVED : OM Approves Packing (PATCH /approve-packing/:id)
    }

    LOGISTICS_APPROVED --> COMPLETED : Auto Cascaded by DB
    COMPLETED --> [*]

## 2. Phase-by-Phase Enquiry Lifecycle

### Phase A: Enquiry Creation & Assignment
1. **Creation**:
   * **Endpoint**: `POST /api/enquiries`
   * **Role**: `Admin`, `Field Owner`
   * **Initial Status**: `PENDING`
   * **Behavior**:
     * If created with an `assignedSelectorId`, notifications trigger immediately, and the status shifts to `ASSIGNED` when updated.
     * Generates a 24-hour edit guard (`editableUntil` timestamp) during which the fields are modifiable.

2. **Manual Selector Assignment**:
   * **Endpoint**: `PUT /api/enquiries/:id`
   * **Role**: `Admin`, `Field Owner`
   * **Status Transition**: `PENDING` $\rightarrow$ `ASSIGNED` (triggered when `assignedSelectorId` is provided/changed).
   * **Notifications**: 
     * WhatsApp alerts are sent to both the farmer and the assigned selector.
     * In-app notification is sent to the Field Selector.

3. **SLA Timeout (Reversion to Pending)**:
   * **Endpoint**: `POST /api/enquiries/run-sla-check` (also runs hourly via background Cron Job).
   * **Role**: System Cron / `Admin` / `Field Owner`
   * **Status Transition**: `ASSIGNED` $\rightarrow$ `PENDING`
   * **Behavior**: If the selector does not inspect the plot within 24 hours of assignment, the selector is unlinked (`assignedSelectorId` set to `null`), the event is added to the `missedAssignments` array, and the status resets to `PENDING` for re-assignment.

---

### Phase B: Field Inspection
1. **Submit Inspection**:
   * **Endpoint**: `POST /api/inspections`
   * **Role**: `Field Selector`, `Admin`
   * **Status Transition**:
     * If decision is `SELECTED` (UI) $\rightarrow$ Enquiry status becomes `SELECTED`.
     * If decision is `REJECTED` (UI) $\rightarrow$ Enquiry status becomes `REJECTED`.
   * **Notifications**: 
     * WhatsApp notification sent to the farmer with the decision.
     * In-app notifications sent to the original Field Owner and broadcasted to all Admins.

---

### Phase C: Deal Closing (Rate Fixing / Rescheduling)
1. **Fix Rate (Purchase Agreement)**:
   * **Endpoint**: `PATCH /api/enquiries/fix-rate/:id`
   * **Role**: `Field Owner`, `Admin`
   * **Status Transition**: `SELECTED` $\rightarrow$ `RATE_FIXED`
   * **Inputs**: `companyId` (Buyer Company), `purchaseRate` (Rate Fixed), `packingType`, `estimatedBoxes`, `remarks`.
   * **Notifications**: Broadcast sent in-app to Operational Managers and Admins indicating the plot is ready for harvest logistics.

2. **Field Owner Reschedule**:
   * **Endpoint**: `PUT /api/enquiries/:id/reschedule`
   * **Role**: `Field Owner`, `Admin`
   * **Status Transition**: `SELECTED` $\rightarrow$ `RESCHEDULED`
   * **Behavior**: Clears `assignedSelectorId`, updates `rescheduleDate`, and logs the reason in the `rescheduleHistory` array. Resetting allows new selector assignment to begin the cycle again.

3. **Admin Reschedule (Missed Inspection)**:
   * **Endpoint**: `PATCH /api/enquiries/reschedule/:id`
   * **Role**: `Admin`
   * **Status Transition**: Updates scheduling parameters and unlocks the 24-hour edit window (`editableUntil` set to `now + 24 hours`).

---

### Phase D: Logistics & Harvesting Execution
1. **Assign Logistics**:
   * **Endpoint**: `POST /api/logistics/assign`
   * **Role**: `Admin`, `Operational Manager`
   * **Status Transition**: Enquiry status `RATE_FIXED` $\rightarrow$ `ASSIGNED`
   * **Behavior**: Creates a corresponding `Logistics` assignment document with status `PENDING`. Resolves the driver's vehicle from their profile.
   * **Notifications**: WhatsApp notifications sent to the Munshi and Driver. In-app alerts sent to the Munshi, Driver, and original Field Owner.

2. **Munshi Packing Submission**:
   * **Endpoint**: `POST /api/munshi/packing/:assignmentId`
   * **Role**: `Munshi`
   * **Status Transition**: Logistics assignment status `PENDING` $\rightarrow$ `COMPLETED` (Parent Enquiry remains in `ASSIGNED` status).

3. **OM Approval (Harvest Finalization)**:
   * **Endpoint**: `PATCH /api/operational-manager/approve-packing/:assignmentId`
   * **Role**: `Admin`, `Operational Manager`
   * **Status Transitions**:
     * Packing report status $\rightarrow$ `APPROVED`
     * Logistics assignment status $\rightarrow$ `APPROVED`
     * **Parent Enquiry status $\rightarrow$ `COMPLETED`** (Auto-updated in database)
   * **Notifications**: Cascades final deals and confirms harvest completions.

4. **OM Rejection**:
   * **Endpoint**: `PATCH /api/operational-manager/reject-packing/:assignmentId`
   * **Role**: `Admin`, `Operational Manager`
   * **Status Transitions**:
     * Packing report status $\rightarrow$ `REJECTED`
     * Logistics assignment status $\rightarrow$ `REJECTED` (Parent Enquiry remains `ASSIGNED` awaiting correction).
