# Manager Admin Panel v2 — Implementation Plan

## Baseline (Prompt 1 — this prompt)

- Verified clean repo state on `feat/manager-admin-v2` branch
- Prisma: 17 migrations applied, schema up to date
- Backend: 645 tests passing, tsc clean
- Frontend: vue-tsc clean, vite build clean
- 4 admin controllers, 11 endpoints, 6 Vue routes

## Prompt 2 — Agency Management CRUD

- Backend: `AdminAgenciesController` with GET list, GET detail, PATCH update status, GET stats
- Frontend: `/agencies` page with table (name, status, offers count, bookings count, revenue)
- Agency detail drawer/page with status actions (Approve, Suspend, Block)
- Filter by AgencyStatus, search by name

## Prompt 3 — User Management & Activity Log

- Backend: `AdminUsersController` with GET list, GET detail, PATCH role, PATCH status
- Frontend: `/users` page with table (name, role, status, travel requests count, last active)
- User detail page with booking history, role change, block/unblock
- Search by name/phone/telegramId

## Prompt 4 — Travel Request Pipeline View

- Backend: `AdminTravelRequestsController` with GET list, GET detail, GET distribution status
- Frontend: `/travel-requests` page with Kanban or table view
- Status pipeline: DRAFT → SUBMITTED → DISTRIBUTING → OFFERS_RECEIVED → BOOKED → EXPIRED
- Show distribution stats per request (agencies contacted, responded, offers received)

## Prompt 5 — Notification Center & Activity Feed

- Backend: `AdminNotificationsController` for real-time activity stream
- Server-Sent Events (SSE) or polling for live updates
- Frontend: notification bell in header + `/activity` feed page
- Events: new booking, agency confirmed, payment received, meeting completed

## Prompt 6 — Settings & Configuration Panel

- Backend: `AdminSettingsController` for system configuration
- Frontend: `/settings` page with sections:
  - Distribution settings (max agencies per RFQ, timeout duration)
  - Offer settings (expiry duration, auto-expire toggle)
  - Meeting settings (default meeting duration, reminder intervals)
- Audit log of setting changes

## Prompt 7 — Dashboard Polish & E2E Smoke Tests

- Responsive layout fixes for all pages
- Loading skeletons for all data-fetching states
- Error boundary components with retry
- E2E smoke tests (Playwright or Cypress) for critical flows:
  - Login → Queue → Verify booking
  - Agency list → Change status
  - Analytics dashboard loads with data
- Performance: lazy-load heavy chunks (ECharts, Calendar)
