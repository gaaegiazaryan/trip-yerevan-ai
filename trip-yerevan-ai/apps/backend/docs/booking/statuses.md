# Booking Statuses

## Status Lifecycle

| # | Status                        | Description                                    | Terminal |
|---|-------------------------------|------------------------------------------------|----------|
| 1 | CREATED                       | Booking created from accepted offer            | No       |
| 2 | AWAITING_AGENCY_CONFIRMATION  | Sent to agency, awaiting confirm/reject        | No       |
| 3 | AGENCY_CONFIRMED              | Agency confirmed, awaiting manager verification| No       |
| 4 | MANAGER_VERIFIED              | Manager verified deal details                  | No       |
| 5 | MEETING_SCHEDULED             | Meeting phase (proposals/scheduling)           | No       |
| 6 | PAYMENT_PENDING               | Meeting completed, awaiting payment            | No       |
| 7 | PAID                          | Payment received                               | No       |
| 8 | IN_PROGRESS                   | Trip is underway                               | No       |
| 9 | COMPLETED                     | Trip completed successfully                    | Yes      |
|10 | CANCELLED                     | Cancelled by any party                         | Yes      |
|11 | EXPIRED                       | Agency did not respond in time (24h)           | Yes      |
|12 | REJECTED_BY_AGENCY            | Agency explicitly rejected the booking         | Yes      |

## Valid Transitions

```
CREATED -> AWAITING_AGENCY_CONFIRMATION
AWAITING_AGENCY_CONFIRMATION -> AGENCY_CONFIRMED | REJECTED_BY_AGENCY | EXPIRED | CANCELLED
AGENCY_CONFIRMED -> MANAGER_VERIFIED | CANCELLED
MANAGER_VERIFIED -> MEETING_SCHEDULED | CANCELLED
MEETING_SCHEDULED -> PAYMENT_PENDING | CANCELLED
PAYMENT_PENDING -> PAID | CANCELLED
PAID -> IN_PROGRESS | CANCELLED
IN_PROGRESS -> COMPLETED | CANCELLED
COMPLETED -> (terminal)
CANCELLED -> (terminal)
EXPIRED -> (terminal)
REJECTED_BY_AGENCY -> (terminal)
```

## Kanban Pipeline Columns

The Pipeline/Kanban view shows the 8 active (non-terminal) statuses as columns:

1. Created
2. Awaiting Agency
3. Agency Confirmed
4. Verified
5. Meeting Phase
6. Payment Pending
7. Paid
8. In Progress

Terminal statuses (Completed, Cancelled, Expired, Rejected) are hidden from the pipeline.

## Auto-Transitions

- **Verify** (AGENCY_CONFIRMED -> MANAGER_VERIFIED): auto-chains to MEETING_SCHEDULED
- **Expiration**: AWAITING_AGENCY_CONFIRMATION expires to EXPIRED after 24h via BullMQ job
- **Meeting Complete**: triggers MEETING_SCHEDULED -> PAYMENT_PENDING

## Timestamp Fields

| Target Status      | Timestamp Field    |
|-------------------|--------------------|
| AGENCY_CONFIRMED  | confirmedAt        |
| MANAGER_VERIFIED  | managerVerifiedAt  |
| PAID              | paidAt             |
| CANCELLED         | cancelledAt        |
| EXPIRED           | expiredAt          |
