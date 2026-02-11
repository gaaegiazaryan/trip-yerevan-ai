# Admin — Agency Verification

## Overview

Managers can list, inspect, and verify travel agencies through the admin panel.
Agencies must be APPROVED before they can receive RFQs and submit offers.

## Backend API

All endpoints require `AuthGuard` + `RolesGuard` with `MANAGER` or `ADMIN` role.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/agencies` | List agencies (paginated, filterable) |
| GET | `/admin/agencies/:id` | Agency detail with members and stats |
| POST | `/admin/agencies/:id/verify` | Approve, reject, or block an agency |
| POST | `/admin/agencies/:id/trust-badge` | Toggle trust badge |

### Query Parameters (GET list)

| Param | Type | Description |
|-------|------|-------------|
| `status` | AgencyStatus enum | Filter by status (PENDING, APPROVED, etc.) |
| `q` | string | Search by name, email, or phone |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |

### Request Bodies

**POST /verify:**
```json
{
  "action": "APPROVE" | "REJECT" | "BLOCK",
  "reason": "optional string"
}
```

**POST /trust-badge:**
```json
{
  "enabled": true | false
}
```

### Response Shape

All responses use the standard `ApiResponse<T>` wrapper:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

## Data Model

### AgencyStatus enum
- `PENDING` — Newly registered, awaiting manager review
- `APPROVED` — Verified and active, can receive RFQs
- `REJECTED` — Manager rejected the application
- `SUSPENDED` — Temporarily disabled
- `BLOCKED` — Permanently blocked by manager

### Agency fields (verification-related)
| Field | Type | Description |
|-------|------|-------------|
| `status` | AgencyStatus | Current verification status |
| `verifiedAt` | DateTime? | When the last verification action occurred |
| `verifiedByUserId` | UUID? | Manager who performed the action |
| `rejectionReason` | String? | Reason for rejection or block |
| `trustBadge` | Boolean | Whether agency has the trusted badge |

### Migration
`20260211100000_add_agency_rejection_reason_and_trust_badge`
- Adds `rejectionReason TEXT` (nullable)
- Adds `trustBadge BOOLEAN DEFAULT false`

**Decision: existing agencies remain as-is.** The `AgencyStatus` field already defaults
to PENDING for new agencies. Existing APPROVED agencies keep their status. No data
backfill needed — `rejectionReason` is nullable and `trustBadge` defaults to false.

## Frontend

### Route
`/agencies` — linked in the top navigation bar between Queue and Calendar.

### Components
- `AgenciesPage.vue` — Main page with filters (status, search) and table
- `AgencyTable.vue` — Widget displaying agency list with name, status, stats, regions
- `AgencyDetailDrawer.vue` — Slide-out drawer with full agency info, members list,
  verification actions (Approve/Reject/Block), trust badge toggle, and confirmation dialog

### Pinia Store
`useAgencyStore` — manages list, detail, filters, loading, error state.
Actions: `fetchAgencies`, `fetchAgencyById`, `verifyAgency`, `setTrustBadge`,
`setPage`, `setPageSize`, `setFilters`, `resetFilters`.

### Shared UI
- `StatusBadge` updated to support `type="agency"` with proper color/label maps
- `AgencyStatus` enum + labels/colors added to `shared/lib/enums.ts`

## Files

### New
```
apps/backend/prisma/migrations/20260211100000_.../migration.sql
apps/backend/src/modules/admin/dto/admin-agencies.dto.ts
apps/backend/src/modules/admin/admin-agencies.controller.ts
apps/backend/src/modules/admin/__tests__/admin-agencies.controller.spec.ts
apps/admin/src/entities/agency/types.ts
apps/admin/src/entities/agency/api.ts
apps/admin/src/entities/agency/store.ts
apps/admin/src/entities/agency/index.ts
apps/admin/src/widgets/agency-table/AgencyTable.vue
apps/admin/src/widgets/agency-table/index.ts
apps/admin/src/pages/agencies/AgenciesPage.vue
apps/admin/src/pages/agencies/AgencyDetailDrawer.vue
apps/admin/src/pages/agencies/index.ts
docs/admin/agencies.md
```

### Modified
```
apps/backend/prisma/schema.prisma              — added rejectionReason, trustBadge
apps/backend/src/modules/admin/admin.service.ts — added agency methods
apps/backend/src/modules/admin/admin.module.ts  — registered controller
apps/admin/src/shared/lib/enums.ts              — added AgencyStatus enum + maps
apps/admin/src/shared/ui/StatusBadge.vue        — added agency type support
apps/admin/src/app/router/index.ts              — added /agencies route
apps/admin/src/app/App.vue                      — added Agencies nav link
```
