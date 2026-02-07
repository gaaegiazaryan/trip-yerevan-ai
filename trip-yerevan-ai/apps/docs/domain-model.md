# Domain Model — Trip Yerevan AI

## 1. Bounded Contexts

| Context | Module | Responsibility |
|---|---|---|
| Identity & Access | `users` | Authentication, profiles, language preferences |
| Agency Management | `agencies` | Agency onboarding, verification, agent roles |
| Travel Requests | `travel-requests` | RFQ creation, structured data, lifecycle |
| Offers | `offers` | Agency quotes, pricing, comparison |
| Negotiation | `proxy-chat` | Anonymized user-agency communication |
| Bookings | `bookings` | Confirmed deals, payment tracking |
| AI Conversation | `ai` | NLU parsing, clarification flow, matching |
| Telegram Interface | `telegram` | Bot I/O adapter — no domain logic |

---

## 2. Aggregate Roots

| Aggregate Root | Module | Owns |
|---|---|---|
| `User` | users | — |
| `Agency` | agencies | `AgencyAgent` |
| `TravelRequest` | travel-requests | `TravelerGroup`, `ParsedTravelData` |
| `Offer` | offers | `OfferItem` |
| `ProxyChat` | proxy-chat | `ProxyChatMessage` |
| `Booking` | bookings | `BookingStatusHistory` |
| `AIConversation` | ai | `AIMessage` |

---

## 3. Entities & Attributes

### User (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| telegramId | BigInt | Unique, not null |
| firstName | String | Not null |
| lastName | String | Nullable |
| phone | String | Nullable |
| preferredLanguage | Enum(RU, AM, EN) | Default: RU |
| role | Enum(TRAVELER, ADMIN) | Default: TRAVELER |
| status | Enum(ACTIVE, BLOCKED) | Default: ACTIVE |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Agency (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| name | String | Not null, unique |
| description | String | Nullable |
| contactEmail | String | Not null |
| contactPhone | String | Not null |
| telegramChatId | BigInt | Nullable |
| status | Enum(PENDING, VERIFIED, SUSPENDED, BLOCKED) | Default: PENDING |
| specializations | String[] | e.g. ["beach", "ski", "excursion"] |
| regions | String[] | e.g. ["europe", "asia", "middle_east"] |
| rating | Decimal | Default: 0, range 0-5 |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### AgencyAgent (Child of Agency)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| agencyId | UUID | FK -> Agency |
| userId | UUID | FK -> User |
| role | Enum(OWNER, MANAGER, AGENT) | Not null |
| status | Enum(ACTIVE, INACTIVE) | Default: ACTIVE |
| createdAt | DateTime | Auto |

**Invariants:**
- Each Agency must have exactly one OWNER
- AgencyAgent.userId must reference a unique user per agency

### TravelRequest (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| userId | UUID | FK -> User |
| status | Enum (see lifecycle) | Default: DRAFT |
| rawText | String | Original user message(s) |
| language | Enum(RU, AM, EN) | Detected from input |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |
| expiresAt | DateTime | Auto, configurable TTL |

### ParsedTravelData (Value Object, embedded in TravelRequest)

| Attribute | Type | Constraints |
|---|---|---|
| destination | String | Not null after parsing |
| departureCity | String | Default: "Yerevan" |
| departureDate | Date | Not null, must be future |
| returnDate | Date | Nullable (one-way allowed) |
| tripType | Enum(PACKAGE, FLIGHT_ONLY, HOTEL_ONLY, EXCURSION, CUSTOM) | Not null |
| adults | Int | Min: 1 |
| children | Int | Default: 0 |
| infants | Int | Default: 0 |
| budgetMin | Decimal | Nullable |
| budgetMax | Decimal | Nullable |
| currency | Enum(AMD, USD, EUR, RUB) | Default: USD |
| preferences | String[] | e.g. ["all_inclusive", "direct_flight"] |
| notes | String | Nullable |

### TravelerGroup (Value Object, embedded in TravelRequest)

| Attribute | Type | Constraints |
|---|---|---|
| adults | Int | Min: 1 |
| children | Int | Default: 0 |
| childrenAges | Int[] | Required if children > 0 |
| infants | Int | Default: 0 |

### Offer (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| travelRequestId | UUID | FK -> TravelRequest |
| agencyId | UUID | FK -> Agency |
| agentId | UUID | FK -> AgencyAgent |
| status | Enum (see lifecycle) | Default: DRAFT |
| totalPrice | Decimal | Not null, > 0 |
| currency | Enum(AMD, USD, EUR, RUB) | Not null |
| description | String | Not null |
| validUntil | DateTime | Not null, must be future |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### OfferItem (Child of Offer)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| offerId | UUID | FK -> Offer |
| type | Enum(FLIGHT, HOTEL, TRANSFER, INSURANCE, EXCURSION, OTHER) | Not null |
| title | String | Not null |
| description | String | Nullable |
| price | Decimal | Not null, >= 0 |
| currency | Enum(AMD, USD, EUR, RUB) | Not null |

### ProxyChat (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| travelRequestId | UUID | FK -> TravelRequest |
| userId | UUID | FK -> User |
| agencyId | UUID | FK -> Agency |
| status | Enum(ACTIVE, CLOSED, ARCHIVED) | Default: ACTIVE |
| createdAt | DateTime | Auto |
| closedAt | DateTime | Nullable |

**Invariants:**
- One active ProxyChat per (userId, agencyId, travelRequestId) triple
- Cannot create ProxyChat unless Offer exists for this agency + request

### ProxyChatMessage (Child of ProxyChat)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| proxyChatId | UUID | FK -> ProxyChat |
| senderType | Enum(USER, AGENCY, SYSTEM) | Not null |
| senderId | UUID | FK -> User or AgencyAgent |
| content | String | Not null, max 4000 chars |
| createdAt | DateTime | Auto |
| readAt | DateTime | Nullable |

### Booking (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| travelRequestId | UUID | FK -> TravelRequest |
| offerId | UUID | FK -> Offer |
| userId | UUID | FK -> User |
| agencyId | UUID | FK -> Agency |
| status | Enum (see lifecycle) | Default: PENDING_CONFIRMATION |
| totalPrice | Decimal | Snapshot from Offer |
| currency | Enum(AMD, USD, EUR, RUB) | Snapshot from Offer |
| confirmedAt | DateTime | Nullable |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### BookingStatusHistory (Child of Booking)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| bookingId | UUID | FK -> Booking |
| fromStatus | Enum | Not null |
| toStatus | Enum | Not null |
| changedBy | UUID | FK -> User |
| reason | String | Nullable |
| createdAt | DateTime | Auto |

### AIConversation (Aggregate Root)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| userId | UUID | FK -> User |
| travelRequestId | UUID | FK -> TravelRequest, nullable until RFQ created |
| status | Enum(ACTIVE, COMPLETED, ABANDONED, FAILED) | Default: ACTIVE |
| model | Enum(CLAUDE, OPENAI) | Not null |
| tokensUsed | Int | Default: 0 |
| createdAt | DateTime | Auto |
| completedAt | DateTime | Nullable |

### AIMessage (Child of AIConversation)

| Attribute | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| conversationId | UUID | FK -> AIConversation |
| role | Enum(USER, ASSISTANT, SYSTEM) | Not null |
| content | String | Not null |
| tokens | Int | Nullable |
| createdAt | DateTime | Auto |

---

## 4. Entity Relationships

```
User 1──* TravelRequest
User 1──* Booking
User 1──* ProxyChat
User 1──* AIConversation
User 1──1 AgencyAgent (optional)

Agency 1──* AgencyAgent
Agency 1──* Offer
Agency 1──* ProxyChat
Agency 1──* Booking

TravelRequest 1──* Offer
TravelRequest 1──* ProxyChat
TravelRequest 1──1 Booking (at most one active)
TravelRequest 1──1 AIConversation
TravelRequest 1──1 ParsedTravelData (embedded)
TravelRequest 1──1 TravelerGroup (embedded)

Offer 1──* OfferItem
Offer 1──1 Booking (optional)

ProxyChat 1──* ProxyChatMessage

Booking 1──* BookingStatusHistory

AIConversation 1──* AIMessage
```

---

## 5. Lifecycle States

### TravelRequest Lifecycle

```
DRAFT → COLLECTING_INFO → READY → DISTRIBUTED → OFFERS_RECEIVED → IN_NEGOTIATION → BOOKED → COMPLETED
                                                                                   ↘ CANCELLED
                                                                   ↗ EXPIRED
```

| State | Description |
|---|---|
| DRAFT | Created, AI conversation not started |
| COLLECTING_INFO | AI is clarifying details with user |
| READY | All required fields parsed, awaiting distribution |
| DISTRIBUTED | Sent to matching agencies |
| OFFERS_RECEIVED | At least one offer submitted |
| IN_NEGOTIATION | User opened proxy chat with agency |
| BOOKED | Offer accepted, booking confirmed |
| COMPLETED | Trip finished |
| CANCELLED | Cancelled by user or system |
| EXPIRED | No activity within TTL |

### Offer Lifecycle

```
DRAFT → SUBMITTED → VIEWED → ACCEPTED → BOOKED
                           → REJECTED
                           → EXPIRED
         → WITHDRAWN
```

| State | Description |
|---|---|
| DRAFT | Agency preparing offer |
| SUBMITTED | Sent to platform, visible to user |
| VIEWED | User opened/read the offer |
| ACCEPTED | User chose this offer |
| REJECTED | User declined |
| BOOKED | Booking created from this offer |
| WITHDRAWN | Agency retracted |
| EXPIRED | Past validUntil date |

### Booking Lifecycle

```
PENDING_CONFIRMATION → CONFIRMED → PAID → COMPLETED
                                        → CANCELLED
                     → REJECTED
```

| State | Description |
|---|---|
| PENDING_CONFIRMATION | Awaiting agency confirmation |
| CONFIRMED | Agency confirmed the booking |
| PAID | Payment received/verified |
| COMPLETED | Trip completed |
| CANCELLED | Cancelled by either party |
| REJECTED | Agency rejected the booking |

### Agency Lifecycle

```
PENDING → VERIFIED → SUSPENDED → VERIFIED
                   → BLOCKED
```

### ProxyChat Lifecycle

```
ACTIVE → CLOSED → ARCHIVED
```

### AIConversation Lifecycle

```
ACTIVE → COMPLETED (all data collected)
       → ABANDONED (user stopped responding)
       → FAILED (AI error)
```

---

## 6. Domain Events

### Users Context

| Event | Trigger | Consumers |
|---|---|---|
| `UserRegistered` | First /start in bot | ai, agencies |
| `UserBlocked` | Admin action | travel-requests, proxy-chat |
| `UserLanguageChanged` | User preference update | telegram |

### Travel Requests Context

| Event | Trigger | Consumers |
|---|---|---|
| `TravelRequestCreated` | AI completes data collection | ai |
| `TravelRequestReady` | All required fields populated | travel-requests |
| `TravelRequestDistributed` | Sent to matching agencies | offers, agencies |
| `TravelRequestExpired` | TTL exceeded with no booking | offers, proxy-chat |
| `TravelRequestCancelled` | User cancels | offers, proxy-chat, bookings |

### Offers Context

| Event | Trigger | Consumers |
|---|---|---|
| `OfferSubmitted` | Agency submits offer | travel-requests, telegram |
| `OfferViewed` | User opens offer | offers (analytics) |
| `OfferAccepted` | User accepts offer | bookings, proxy-chat |
| `OfferRejected` | User rejects offer | agencies |
| `OfferWithdrawn` | Agency retracts offer | travel-requests, telegram |
| `OfferExpired` | Past validUntil | travel-requests |

### Bookings Context

| Event | Trigger | Consumers |
|---|---|---|
| `BookingCreated` | Offer accepted | agencies, telegram |
| `BookingConfirmed` | Agency confirms | users, telegram |
| `BookingCancelled` | Either party cancels | offers, telegram |
| `BookingCompleted` | Trip date passed + confirmation | agencies (rating) |

### Proxy Chat Context

| Event | Trigger | Consumers |
|---|---|---|
| `ProxyChatOpened` | User initiates chat with agency | telegram |
| `ProxyChatMessageSent` | New message in chat | telegram |
| `ProxyChatClosed` | Booking completed or cancelled | — |

### AI Context

| Event | Trigger | Consumers |
|---|---|---|
| `AIConversationStarted` | User sends first message | telegram |
| `AIConversationCompleted` | All data collected | travel-requests |
| `AIConversationAbandoned` | Timeout, no user response | travel-requests |
| `AIParsingFailed` | Model error | telegram (retry/fallback) |

### Agency Context

| Event | Trigger | Consumers |
|---|---|---|
| `AgencyRegistered` | New registration | admin notification |
| `AgencyVerified` | Admin approves | telegram, travel-requests |
| `AgencySuspended` | Admin action | offers, proxy-chat |

---

## 7. Invariants & Validation Rules

### User
- `telegramId` must be unique across all users
- Blocked users cannot create travel requests or send messages
- `preferredLanguage` must be one of: RU, AM, EN

### Agency
- Only VERIFIED agencies receive RFQ distributions
- Agency name must be unique
- Cannot submit offers while SUSPENDED or BLOCKED
- Must have at least one AgencyAgent with role OWNER

### TravelRequest
- `departureDate` must be in the future at creation time
- `returnDate` must be after `departureDate` if provided
- `adults` >= 1 (at least one adult traveler)
- `childrenAges` array length must equal `children` count
- Cannot transition to DISTRIBUTED without all required ParsedTravelData fields
- Only one active (non-terminal) request per user at a time
- Terminal states: BOOKED, COMPLETED, CANCELLED, EXPIRED

### Offer
- `totalPrice` must be > 0
- `validUntil` must be in the future at submission
- Sum of OfferItem prices should not exceed totalPrice
- One offer per agency per travel request
- Cannot submit offer for EXPIRED or CANCELLED request
- Only agency's own agents can submit/withdraw offers

### Booking
- Only one active booking per TravelRequest
- Can only create booking from an ACCEPTED offer
- Price and currency are snapshotted from offer at creation (immutable)
- Only CONFIRMED bookings can transition to PAID
- Cancellation requires a reason

### ProxyChat
- Cannot open proxy chat unless an offer exists for this (user, agency, request)
- Max message length: 4000 characters
- Cannot send messages in CLOSED or ARCHIVED chats
- System messages cannot be sent by users or agencies

### AIConversation
- One active conversation per user at a time
- Conversation must reach COMPLETED before TravelRequest moves to READY
- Token usage must be tracked per conversation

---

## 8. Module Boundaries & Dependencies

```
┌─────────────────────────────────────────────────────┐
│                   telegram (adapter)                 │
│           No domain logic. Delegates only.           │
└──────┬──────────┬───────────┬──────────┬────────────┘
       │          │           │          │
       ▼          ▼           ▼          ▼
┌──────────┐ ┌────────┐ ┌─────────┐ ┌──────────┐
│  users   │ │   ai   │ │ proxy-  │ │ travel-  │
│          │ │        │ │  chat   │ │ requests │
└──────────┘ └───┬────┘ └────┬────┘ └────┬─────┘
                 │           │           │
                 ▼           │           ▼
            ┌─────────┐     │     ┌──────────┐
            │ travel-  │◄───┘     │  offers  │
            │ requests │          └────┬─────┘
            └─────────┘               │
                                      ▼
                                ┌──────────┐
                                │ bookings │
                                └──────────┘
                                      │
                                      ▼
                                ┌──────────┐
                                │ agencies │
                                └──────────┘
```

### Allowed Dependencies (direction of dependency)

| Module | Can depend on |
|---|---|
| `telegram` | users, ai, travel-requests, offers, proxy-chat, bookings |
| `ai` | users, travel-requests |
| `travel-requests` | users |
| `offers` | travel-requests, agencies |
| `proxy-chat` | users, agencies, travel-requests, offers |
| `bookings` | travel-requests, offers, users, agencies |
| `agencies` | users |
| `users` | — (no domain dependencies) |

### Communication Rules

- **Synchronous** (direct service calls): within same module, or for simple reads across modules
- **Asynchronous** (BullMQ events): for cross-module side effects (notifications, state transitions triggered by other modules)
- **telegram module** consumes domain events to send bot messages — never the reverse
- Modules communicate through **public service interfaces**, never by accessing each other's repositories directly

---

## 9. Business Workflows

### W1: Travel Request Submission

```
1. User sends message to bot
2. telegram module forwards to ai module
3. AI starts/continues conversation
4.   Loop: AI asks clarifying questions ↔ user responds
5. AI marks conversation COMPLETED, emits AIConversationCompleted
6. travel-requests creates TravelRequest with ParsedTravelData
7. TravelRequest transitions DRAFT → READY
8. System matches request to agencies by (regions, specializations)
9. BullMQ job distributes RFQ to matched agencies
10. TravelRequest transitions READY → DISTRIBUTED
11. Agencies notified via Telegram
```

### W2: Offer Submission

```
1. Agency agent receives RFQ notification
2. Agent creates Offer with OfferItems via web or bot
3. Offer validated (price > 0, validUntil future, one per agency)
4. Offer transitions DRAFT → SUBMITTED
5. OfferSubmitted event emitted
6. User notified via Telegram with offer summary
7. TravelRequest transitions to OFFERS_RECEIVED (if first offer)
```

### W3: Offer Comparison & Acceptance

```
1. User views offers in bot (inline keyboard or web link)
2. Each viewed offer transitions SUBMITTED → VIEWED
3. User selects preferred offer
4. Selected offer transitions VIEWED → ACCEPTED
5. All other offers for this request transition to REJECTED
6. OfferAccepted event emitted
7. System creates Booking with PENDING_CONFIRMATION status
```

### W4: Proxy Chat Negotiation

```
1. User taps "Chat with agency" on an offer
2. System verifies offer exists for this (user, agency, request)
3. ProxyChat created with ACTIVE status
4. User sends message → ProxyChatMessage(senderType=USER)
5. Agency agent receives message via Telegram (anonymized)
6. Agent replies → ProxyChatMessage(senderType=AGENCY)
7. Loop continues until booking or chat closed
8. TravelRequest transitions to IN_NEGOTIATION
```

### W5: Booking Confirmation

```
1. BookingCreated event → agency notified
2. Agency reviews and confirms → PENDING_CONFIRMATION → CONFIRMED
3. BookingConfirmed event → user notified
4. Payment handled (off-platform or future integration)
5. Booking transitions CONFIRMED → PAID
6. After trip date: PAID → COMPLETED
7. BookingCompleted event → prompt user for rating
```

### W6: Expiration & Cleanup (BullMQ scheduled)

```
1. Scheduled job checks TravelRequest.expiresAt
2. Requests past TTL with no booking → EXPIRED
3. TravelRequestExpired event emitted
4. All related SUBMITTED/VIEWED offers → EXPIRED
5. Active ProxyChats → CLOSED
6. User notified: "Your request has expired. Start a new one?"
```

### W7: Agency Onboarding

```
1. Agency submits registration (web form or admin invite)
2. Agency created with PENDING status
3. AgencyRegistered event → admin notified
4. Admin reviews and verifies → PENDING → VERIFIED
5. AgencyVerified event → agency starts receiving RFQs
```
