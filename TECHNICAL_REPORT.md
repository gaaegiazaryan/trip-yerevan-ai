# Technical Architecture Report

**Date:** 2026-02-08
**Repository:** `trip-yerevan-ai`
**Branch:** `main`
**Commit:** `0e37bb3`
**Previous Report Commit:** `628cb2b` (2026-02-08)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Backend Architecture](#3-backend-architecture)
4. [Database Architecture](#4-database-architecture)
5. [AI Layer](#5-ai-layer)
6. [Telegram Bot Architecture](#6-telegram-bot-architecture)
7. [RFQ Business Flow](#7-rfq-business-flow)
8. [Security Model](#8-security-model)
9. [External Integrations](#9-external-integrations)
10. [Deployment & Infrastructure](#10-deployment--infrastructure)
11. [Known Limitations & Technical Debt](#11-known-limitations--technical-debt)
12. [Suggested Improvements](#12-suggested-improvements)
13. [Change Log](#13-change-log)
14. [Architecture Risk Radar](#14-architecture-risk-radar)
15. [Domain Events Map](#15-domain-events-map)
16. [AI Cost & Performance Analysis](#16-ai-cost--performance-analysis)
17. [Scaling Strategy](#17-scaling-strategy)
18. [Production Readiness Score](#18-production-readiness-score)

---

## 1. Project Overview

### Purpose

Trip Yerevan AI is a Telegram-based travel RFQ (Request for Quote) platform that connects Armenian travelers with local travel agencies through a conversational AI interface. Users describe their travel plans in natural language via Telegram, the system uses LLMs to parse the request into structured data, and then distributes the structured RFQ to matching travel agencies who compete with offers.

### Business Domain

- Travel marketplace connecting end-users with licensed travel agencies in Armenia
- Multi-language support: Russian (primary), Armenian, English
- Anonymous proxy communication between travelers and agencies
- Competitive multi-agency bidding on each travel request
- Full booking lifecycle from request through confirmation

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Telegram Bot API                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ (grammY polling)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       NestJS Application                            │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │               telegram (adapter module — ZERO logic)          │  │
│  │   /start  /agency  /review_agencies  text  callbacks          │  │
│  └──┬──────┬─────────┬──────────┬─────────┬──────────────────┘  │
│     │      │         │          │         │                      │
│     ▼      ▼         ▼          ▼         ▼                      │
│  ┌──────┐┌────┐┌──────────┐┌────────┐┌──────────────────┐       │
│  │users ││ ai ││ agencies ││ offers ││  distribution     │       │
│  │      ││    ││          ││        ││                   │       │
│  └──────┘└─┬──┘└──────────┘└────────┘└───────┬──────────┘       │
│            │                                  │                   │
│            ▼                                  ▼                   │
│  ┌─────────────────┐  ┌────────┐  ┌────────────────────┐        │
│  │ travel-requests  │  │bookings│  │   proxy-chat       │        │
│  └─────────────────┘  └────────┘  └────────────────────┘        │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                  Infrastructure Layer                      │   │
│  │   PrismaModule (global) │ QueueModule │ LoggerModule       │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────┬────────────────────┘
               │                              │
               ▼                              ▼
        ┌──────────┐                   ┌──────────┐
        │PostgreSQL│                   │  Redis   │
        │  (Neon)  │                   │ (BullMQ) │
        └──────────┘                   └──────────┘
```

### Target Users

| Role | Description |
|------|-------------|
| **Traveler** | Armenian travelers (primarily Russian and Armenian speaking) who want to find travel deals without contacting agencies individually |
| **Agency** | Local travel agencies operating in Armenia who want a structured pipeline of qualified travel requests |
| **Manager** | Platform staff who review and approve/reject agency applications |
| **Admin** | Platform operators who manage agency verification, user moderation, and system monitoring |

---

## 2. Technology Stack

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| **NestJS** | 11.x | Application framework — modules, DI, lifecycle hooks, validation pipes |
| **TypeScript** | 5.7+ | Language — strict mode with `strictNullChecks`, `noImplicitAny`, `strictBindCallApply` |
| **Express** | 5.x (via `@nestjs/platform-express`) | HTTP server |
| **class-validator** | 0.14.1 | DTO input validation with decorators |
| **class-transformer** | 0.5.1 | DTO transformation |
| **rxjs** | 7.8.1 | Reactive streams (NestJS internal) |

### Database

| Technology | Version | Purpose |
|-----------|---------|---------|
| **PostgreSQL** | (via Neon) | Primary database — hosted on Neon serverless PostgreSQL with pooled connections |
| **Prisma** | 6.x | ORM — schema management, migrations, type-safe queries |
| **Redis** | (via ioredis 5.4) | Job queue backend for BullMQ |

### AI / LLM Integrations

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Anthropic SDK** | 0.73.0 | Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) — primary AI provider |
| **OpenAI SDK** | 6.18.0 | GPT-4.1 — secondary AI provider |
| **Mock AI Provider** | (custom) | Regex-based parser — development fallback when no API keys are configured |

### Infrastructure

| Technology | Version | Purpose |
|-----------|---------|---------|
| **BullMQ** | 5.x | Async job queue for RFQ distribution |
| **@nestjs/bullmq** | 11.x | NestJS integration for BullMQ |
| **@nestjs/config** | 4.x | Environment variable management |

### Bot / External Services

| Technology | Version | Purpose |
|-----------|---------|---------|
| **grammY** | 1.39.3 | Telegram Bot API framework |
| **Neon PostgreSQL** | (cloud) | Managed serverless PostgreSQL |

### Development Tools

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Jest** | 30.2.0 | Testing framework (161 tests across 14 spec files) |
| **ts-jest** | 29.4.6 | TypeScript transformer for Jest |
| **ts-node** | 10.9.2 | TypeScript runtime execution |
| **NestJS CLI** | 11.x | Code generation and build tooling |
| **Prisma CLI** | 6.x | Schema management, migrations, studio |

### Planned But Not Yet Implemented

| Technology | Purpose |
|-----------|---------|
| **Nuxt 4** | Frontend web application |
| **Shared types package** | Cross-app TypeScript types (`packages/shared-types/`) |
| **Shared utils package** | Cross-app utility functions (`packages/shared-utils/`) |

---

## 3. Backend Architecture

### Overall Design

The project follows a **modular monolith** architecture. All domain logic resides within a single NestJS application, organized into isolated modules with clear boundaries and dependency rules. Modules communicate through direct service injection within the same process. Async processing uses BullMQ job queues backed by Redis.

### Source Structure

```
apps/backend/src/
├── main.ts                                # Application bootstrap
├── app.module.ts                          # Root module — imports all modules
│
├── common/                                # Shared cross-cutting concerns
│   ├── decorators/
│   │   └── current-user.decorator.ts      # @CurrentUser() parameter decorator
│   ├── dto/
│   │   └── pagination.dto.ts              # PaginationDto with page/limit/skip
│   ├── exceptions/
│   │   └── domain.exception.ts            # DomainException, DraftValidationException,
│   │                                      # DraftConversionException, InfrastructureException
│   └── guards/
│       └── auth.guard.ts                  # AuthGuard (checks request.user exists)
│
├── infra/                                 # Infrastructure layer
│   ├── prisma/
│   │   ├── prisma.module.ts               # Global Prisma module
│   │   └── prisma.service.ts              # PrismaClient with retry (3 attempts, 2s delay)
│   ├── queue/
│   │   └── queue.module.ts                # BullMQ + Redis configuration
│   └── logger/
│       ├── logger.module.ts
│       └── logger.service.ts              # Wraps NestJS ConsoleLogger
│
└── modules/                               # Domain feature modules
    ├── health/
    ├── users/
    ├── agencies/
    ├── travel-requests/
    ├── offers/
    ├── bookings/
    ├── proxy-chat/
    ├── distribution/
    ├── ai/
    └── telegram/
```

### Modules

#### Users Module

- **Responsibility:** User identity management, Telegram identity mapping, language preferences
- **Public API:** `UsersService` (exported)
- **Internal Services:** `UsersService`
- **Key Methods:** `findByTelegramId()`, `findById()`, `findOrCreateByTelegram()`, `create()`, `update()`
- **Controller:** `GET /api/users/:id`
- **Inter-module Dependencies:** None (leaf module)

#### Agencies Module

- **Responsibility:** Agency profiles, application workflow, approval/rejection, agent management
- **Public API:** `AgenciesService`, `AgencyApplicationService` (both exported)
- **Internal Services:**
  - `AgenciesService` — CRUD operations, `findApproved()`, `findMatchingAgencies()`, `isActiveAgent(telegramId)` (checks if user is an active agency agent)
  - `AgencyApplicationService` — In-memory wizard for agency registration (5 steps: NAME → PHONE → SPECIALIZATIONS → COUNTRIES → CONFIRM), application review flow (approve/reject with reason)
- **Controller:** `GET /api/agencies` (list approved), `GET /api/agencies/:id`
- **Inter-module Dependencies:** None (uses PrismaService directly)
- **State:** In-memory `Map<chatId, AgencyWizardState>` for wizard, `Map<chatId, {applicationId, reviewerUserId}>` for pending rejection reasons

#### Travel Requests Module

- **Responsibility:** RFQ creation, lifecycle management, expiration queries
- **Public API:** `TravelRequestsService` (exported)
- **Internal Services:** `TravelRequestsService`
- **Key Methods:** `findById()`, `findByUserId()`, `findActiveByUserId()`, `create()`, `updateStatus()`, `findExpired()`
- **Controller:** `GET /api/travel-requests/:id`, `GET /api/travel-requests/user/:userId`
- **Inter-module Dependencies:** None

#### Offers Module

- **Responsibility:** Agency quotes with itemized pricing, offer wizard for Telegram-based submission
- **Public API:** `OffersService`, `OfferWizardService` (both exported)
- **Internal Services:**
  - `OffersService` — CRUD, `findByTravelRequestId()` (sorted by price), `rejectAllExcept()`
  - `OfferWizardService` — In-memory wizard for offer submission (5 steps: PRICE → CURRENCY → VALID_UNTIL → NOTE → CONFIRM), agent resolution with auto-bootstrap, atomic offer creation + distribution status update in transaction
- **Controller:** `GET /api/offers/:id`, `GET /api/offers/travel-request/:travelRequestId`
- **Inter-module Dependencies:** Uses PrismaService directly
- **State:** In-memory `Map<chatId, OfferWizardState>` for wizard

#### Bookings Module

- **Responsibility:** Booking confirmation, status tracking with full audit history
- **Public API:** `BookingsService` (exported)
- **Internal Services:** `BookingsService`
- **Key Methods:** `findById()`, `findByUserId()`, `create()`, `updateStatus()` (auto-creates `BookingStatusHistory`)
- **Controller:** `GET /api/bookings/:id`, `GET /api/bookings/user/:userId`
- **Inter-module Dependencies:** None

#### Proxy Chat Module

- **Responsibility:** Anonymized messaging between travelers and agencies
- **Public API:** `ProxyChatService` (exported)
- **Internal Services:** `ProxyChatService`
- **Key Methods:** `findById()`, `findByParticipants()`, `create()`, `sendMessage()`, `close()`
- **Controller:** `GET /api/proxy-chats/:id`
- **Inter-module Dependencies:** None

#### Distribution Module

- **Responsibility:** RFQ matching and delivery to agencies via BullMQ
- **Public API:** `RfqDistributionService` (exported)
- **Internal Services:**
  - `RfqDistributionService` — Orchestrates matching + record creation + job enqueueing + status updates
  - `AgencyMatchingService` — Multi-factor scoring (region +3, specialization +2, rating +0-1), filters by `AgencyStatus.APPROVED`, requires `telegramChatId` + active `AgencyAgent`, excludes traveler's own chatId (self-delivery prevention)
  - `RfqNotificationBuilder` — Builds structured notification payload + Telegram Markdown message
  - `RfqDistributionProcessor` — BullMQ job handler: sends RFQ message to agency Telegram chat with "Submit Offer" / "Reject" buttons
- **Queue:** `rfq-distribution` with `deliver-rfq` jobs (3 retries, exponential backoff)
- **Inter-module Dependencies:** `TelegramModule` (forwardRef), uses `TelegramService.sendRfqToAgency()`

#### AI Module

- **Responsibility:** AI conversation engine, NLU parsing, slot filling, draft management, travel request creation
- **Public API:** `AiService`, `AiEngineService` (both exported)
- **Internal Services:** 12 services + 3 AI providers
  - `AiEngineService` — Main orchestrator (~564 lines)
  - `AiParsingService` — JSON extraction + normalization from LLM responses
  - `ConversationStateService` — Deterministic state machine transitions
  - `SlotFillingService` — Slot completion tracking, next-slot priority
  - `DraftMergeService` — Confidence-based field merging
  - `ResponseGeneratorService` — Text response + keyboard builder
  - `ClarificationService` — Question generation + draft summaries
  - `LanguageService` — Unicode detection (Armenian, Cyrillic, Latin), template interpolation
  - `SlotEditDetectionService` — Field edit detection with synonym matching
  - `DraftToRequestService` — Draft → TravelRequest conversion in transaction, triggers distribution
  - `DraftValidationService` — Business rule validation before conversion
  - `FeedbackService` — ML feedback signal recording (corrections, abandonments)
- **AI Providers:**
  - `AnthropicProvider` — Claude Sonnet 4.5, temp=0.2, max_tokens=2048
  - `OpenAiProvider` — GPT-4.1, temp=0.2, json_object response format
  - `MockAiProvider` — Regex-based parser for development
  - `aiProviderFactory` — Priority: Anthropic > OpenAI > Mock
- **Inter-module Dependencies:** `DistributionModule` (forwardRef), `UsersModule`, `TravelRequestsModule`

#### Telegram Module

- **Responsibility:** Telegram bot I/O adapter — ZERO business logic. Routes messages to domain services.
- **Public API:** `TelegramService` (exported)
- **Internal Services:**
  - `TelegramService` — `sendMessage()`, `sendInlineKeyboard()`, `sendErrorMessage()`, `sendOfferNotification()`, `sendRfqToAgency()`
  - `TelegramUpdate` — All handler registrations (commands, text, callbacks)
  - `TelegramRateLimiter` — Per-user rate limiting (5 msgs / 5 seconds)
- **Inter-module Dependencies:** `UsersModule`, `AiModule`, `OffersModule`, `AgenciesModule`

#### Health Module

- **Responsibility:** System liveness check
- **Controller:** `GET /api/health` → returns `{ status, service, uptime, timestamp, database: { status } }`
- **Inter-module Dependencies:** PrismaModule (infrastructure)

### Design Patterns

| Pattern | Where Used |
|---------|-----------|
| **Modular Monolith** | Entire application — domain modules with clear boundaries |
| **Clean Architecture** | Controllers (thin) → Services (business logic) → Prisma (data access) |
| **Dependency Injection** | NestJS IoC container manages all service instantiation |
| **Factory Pattern** | `aiProviderFactory` selects AI provider based on available API keys |
| **State Machine** | `ConversationStateService` — deterministic conversation state transitions |
| **Strategy Pattern** | AI providers implement `AIProviderInterface`; selected at runtime |
| **Builder Pattern** | `RfqNotificationBuilder` constructs notification payloads from travel requests |
| **Template Method** | `BaseAiProvider` defines retry logic; subclasses implement `callApiInternal` |
| **Value Objects** | `TravelDraft`, `TravelDraftField<T>` with confidence and source metadata |
| **Wizard Pattern** | `OfferWizardService` and `AgencyApplicationService` — multi-step in-memory state machines for Telegram-driven forms |
| **forwardRef** | Circular dependency resolution: `AiModule ↔ DistributionModule ↔ TelegramModule` |

### Module Dependency Matrix

| Module | Can Depend On |
|--------|---------------|
| `users` | _(no domain deps)_ |
| `agencies` | _(no domain deps)_ |
| `travel-requests` | _(no domain deps)_ |
| `offers` | _(no domain deps — uses PrismaService directly)_ |
| `bookings` | _(no domain deps)_ |
| `proxy-chat` | _(no domain deps)_ |
| `ai` | `users`, `travel-requests`, `distribution` (forwardRef) |
| `distribution` | `telegram` (forwardRef) |
| `telegram` | `users`, `ai`, `offers`, `agencies` |
| `health` | `prisma` (infra) |

---

## 4. Database Architecture

### Prisma Schema Overview

- **File:** `prisma/schema.prisma` (529 lines)
- **Database:** PostgreSQL (Neon serverless)
- **Models:** 15
- **Enums:** 19
- **Migrations:** 4

### Entity-Relationship Diagram

```
User 1──* TravelRequest
User 1──* Booking
User 1──* ProxyChat
User 1──* AIConversation
User 1──1 AgencyAgent (optional — if user is also an agency agent)
User 1──* AgencyApplication (as reviewer, "ApplicationReviewer")
User 1──* Agency (as verifier, "AgencyVerifier")

Agency 1──* AgencyAgent
Agency 1──* Offer
Agency 1──* ProxyChat
Agency 1──* Booking
Agency 1──* RfqDistribution

TravelRequest 1──* Offer
TravelRequest 1──* ProxyChat
TravelRequest 1──1 Booking (at most one)
TravelRequest 1──1 AIConversation (at most one)
TravelRequest 1──* RfqDistribution

Offer 1──* OfferItem
Offer 1──1 Booking (optional)

ProxyChat 1──* ProxyChatMessage
Booking 1──* BookingStatusHistory
AIConversation 1──* AIMessage
AIConversation 1──* AIFeedbackSignal

AgencyApplication *──1 User (optional reviewer)
```

### Models

#### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| telegramId | BigInt | Unique, not null |
| firstName | String | Not null |
| lastName | String | Nullable |
| phone | String | Nullable |
| preferredLanguage | Language (RU/AM/EN) | Default: RU |
| role | UserRole (TRAVELER/MANAGER/ADMIN) | Default: TRAVELER |
| status | UserStatus (ACTIVE/BLOCKED) | Default: ACTIVE |
| createdAt, updatedAt | DateTime | Auto |

**Relations:** `agencyAgent?`, `travelRequests[]`, `bookings[]`, `proxyChats[]`, `aiConversations[]`, `bookingHistory[]`, `reviewedApplications[]` (as "ApplicationReviewer"), `verifiedAgencies[]` (as "AgencyVerifier")

#### `agencies`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | String | Unique, not null |
| description | String | Nullable |
| contactEmail | String | **Nullable** |
| contactPhone | String | Not null |
| telegramChatId | BigInt | Nullable |
| status | AgencyStatus (PENDING/APPROVED/REJECTED/SUSPENDED/BLOCKED) | Default: PENDING |
| specializations | String[] | Default: [] |
| regions | String[] | Default: [] |
| rating | Decimal(3,2) | Default: 0 |
| verifiedAt | DateTime | Nullable |
| verifiedByUserId | UUID | Nullable, FK → User |
| createdAt, updatedAt | DateTime | Auto |

**Relations:** `verifiedBy?` (User, "AgencyVerifier"), `agents[]`, `offers[]`, `proxyChats[]`, `bookings[]`, `rfqDistributions[]`

#### `agency_agents`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| agencyId | UUID | FK → Agency (cascade delete) |
| userId | UUID | FK → User (cascade delete, unique) |
| role | AgentRole (OWNER/MANAGER/AGENT) | Not null |
| status | AgentStatus (ACTIVE/INACTIVE) | Default: ACTIVE |
| createdAt | DateTime | Auto |

**Unique constraint:** `(agencyId, userId)`

#### `agency_applications`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| applicantTelegramId | BigInt | Not null |
| draftData | JSONB | Not null — stores {name, phone, specializations[], countries[], chatId} |
| status | AgencyApplicationStatus (SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED) | Default: SUBMITTED |
| reviewerUserId | UUID | Nullable, FK → User |
| decisionReason | String | Nullable |
| createdAt | DateTime | Auto |
| decidedAt | DateTime | Nullable |

**Indexes:** `applicantTelegramId`, `status`

#### `travel_requests`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| userId | UUID | FK → User |
| status | TravelRequestStatus (10 states) | Default: DRAFT |
| rawText | String | Original user messages |
| language | Language | Detected from input |
| destination | String | Nullable |
| departureCity | String | Default: "Yerevan" |
| departureDate, returnDate | Date | Nullable |
| tripType | TripType | Nullable |
| adults | Int | Default: 1 |
| children, infants | Int | Default: 0 |
| childrenAges | Int[] | Array |
| budgetMin, budgetMax | Decimal(12,2) | Nullable |
| currency | Currency | Default: USD |
| preferences | String[] | Default: [] |
| notes | String | Nullable |
| expiresAt | DateTime | 14 days from creation |
| createdAt, updatedAt | DateTime | Auto |

**Indexes:** `userId`, `status`, `expiresAt`

#### `offers`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| travelRequestId | UUID | FK → TravelRequest |
| agencyId | UUID | FK → Agency |
| agentId | UUID | FK → AgencyAgent |
| status | OfferStatus (8 states) | Default: DRAFT |
| totalPrice | Decimal(12,2) | Not null |
| currency | Currency | Not null |
| description | String | Not null |
| validUntil | DateTime | Not null |
| createdAt, updatedAt | DateTime | Auto |

**Unique constraint:** `(travelRequestId, agencyId)` — one offer per agency per request
**Indexes:** `travelRequestId`, `agencyId`, `status`

#### `offer_items`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| offerId | UUID | FK → Offer (cascade delete) |
| type | OfferItemType (FLIGHT/HOTEL/TRANSFER/INSURANCE/EXCURSION/OTHER) | Not null |
| title, description | String | title required, description nullable |
| price | Decimal(12,2) | Not null |
| currency | Currency | Not null |

#### `proxy_chats`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| travelRequestId | UUID | FK → TravelRequest |
| userId | UUID | FK → User |
| agencyId | UUID | FK → Agency |
| status | ProxyChatStatus (ACTIVE/CLOSED/ARCHIVED) | Default: ACTIVE |
| createdAt, closedAt | DateTime | Auto / Nullable |

**Unique constraint:** `(travelRequestId, userId, agencyId)`

#### `proxy_chat_messages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| proxyChatId | UUID | FK → ProxyChat (cascade delete) |
| senderType | MessageSenderType (USER/AGENCY/SYSTEM) | Not null |
| senderId | UUID | Not null |
| content | VARCHAR(4000) | Not null |
| createdAt, readAt | DateTime | Auto / Nullable |

**Index:** `(proxyChatId, createdAt)`

#### `bookings`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| travelRequestId | UUID | FK → TravelRequest (unique) |
| offerId | UUID | FK → Offer (unique) |
| userId | UUID | FK → User |
| agencyId | UUID | FK → Agency |
| status | BookingStatus (6 states) | Default: PENDING_CONFIRMATION |
| totalPrice | Decimal(12,2) | Snapshot from offer |
| currency | Currency | Snapshot |
| confirmedAt | DateTime | Nullable |
| createdAt, updatedAt | DateTime | Auto |

#### `booking_status_history`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| bookingId | UUID | FK → Booking (cascade delete) |
| fromStatus, toStatus | BookingStatus | Not null |
| changedBy | UUID | FK → User |
| reason | String | Nullable |
| createdAt | DateTime | Auto |

#### `ai_conversations`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| userId | UUID | FK → User |
| travelRequestId | UUID | FK → TravelRequest (nullable, unique) |
| status | AIConversationStatus (4 states) | Default: ACTIVE |
| model | AIModel (CLAUDE/OPENAI) | Not null |
| tokensUsed | Int | Default: 0 |
| conversationState | String | JSON-serialized state |
| draftData | JSONB | TravelDraft object |
| draftSnapshots | JSONB | Historical draft versions |
| detectedLanguage | String | Nullable |
| createdAt, completedAt | DateTime | Auto / Nullable |

**Index:** `(userId, status)`

#### `ai_messages`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| conversationId | UUID | FK → AIConversation (cascade delete) |
| role | AIMessageRole (USER/ASSISTANT/SYSTEM) | Not null |
| content | String | Not null |
| tokens | Int | Nullable |

**Index:** `(conversationId, createdAt)`

#### `ai_feedback_signals`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| conversationId | UUID | FK → AIConversation (cascade delete) |
| type | String | USER_CORRECTION/ABANDONED/BOOKING_SUCCESS |
| fieldName | String | Nullable |
| originalValue, correctedValue | JSONB | Nullable |
| metadata | JSONB | Default: {} |

**Indexes:** `conversationId`, `type`

#### `rfq_distributions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| travelRequestId | UUID | FK → TravelRequest (cascade delete) |
| agencyId | UUID | FK → Agency (cascade delete) |
| deliveryStatus | RfqDeliveryStatus (5 states) | Default: PENDING |
| failureReason | String | Nullable |
| notificationPayload | JSONB | Nullable |
| distributedAt, deliveredAt, viewedAt, respondedAt | DateTime | Auto / Nullable |

**Unique constraint:** `(travelRequestId, agencyId)`

### Enum Summary

| Enum | Values |
|------|--------|
| Language | RU, AM, EN |
| UserRole | TRAVELER, **MANAGER**, ADMIN |
| UserStatus | ACTIVE, BLOCKED |
| AgencyStatus | PENDING, **APPROVED**, **REJECTED**, SUSPENDED, BLOCKED |
| AgentRole | OWNER, MANAGER, AGENT |
| AgentStatus | ACTIVE, INACTIVE |
| TravelRequestStatus | DRAFT, COLLECTING_INFO, READY, DISTRIBUTED, OFFERS_RECEIVED, IN_NEGOTIATION, BOOKED, COMPLETED, CANCELLED, EXPIRED |
| TripType | PACKAGE, FLIGHT_ONLY, HOTEL_ONLY, EXCURSION, CUSTOM |
| Currency | AMD, USD, EUR, RUB |
| OfferStatus | DRAFT, SUBMITTED, VIEWED, ACCEPTED, REJECTED, BOOKED, WITHDRAWN, EXPIRED |
| OfferItemType | FLIGHT, HOTEL, TRANSFER, INSURANCE, EXCURSION, OTHER |
| ProxyChatStatus | ACTIVE, CLOSED, ARCHIVED |
| MessageSenderType | USER, AGENCY, SYSTEM |
| BookingStatus | PENDING_CONFIRMATION, CONFIRMED, PAID, COMPLETED, CANCELLED, REJECTED |
| AIConversationStatus | ACTIVE, COMPLETED, ABANDONED, FAILED |
| AIMessageRole | USER, ASSISTANT, SYSTEM |
| AIModel | CLAUDE, OPENAI |
| RfqDeliveryStatus | PENDING, DELIVERED, FAILED, VIEWED, RESPONDED |
| **AgencyApplicationStatus** | SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED |

### Migrations

| Migration | Date | Description |
|-----------|------|-------------|
| `20260207104622_init` | Feb 7 | Initial schema — all core tables |
| `20260207113059_add_ai_draft_and_feedback` | Feb 7 | AI conversation state columns + feedback table |
| `20260207125103_add_rfq_distribution` | Feb 7 | RFQ distribution tracking table |
| **`20260208010000_add_agency_onboarding`** | **Feb 8** | **AgencyStatus VERIFIED→APPROVED (enum recreation), add REJECTED, UserRole MANAGER, Agency verification fields, AgencyApplication model** |

---

## 5. AI Layer

### AI Session Lifecycle

```
INITIAL ──────────────> COLLECTING_DETAILS
                              │
                              │ (all required slots filled)
                              ▼
                        CONFIRMING_DRAFT
                         │     │     │
              (correction)│     │     │(confirmation)
                         │     │     │
                         ▼     │     ▼
               COLLECTING_     │   READY_FOR_RFQ
               DETAILS         │        │
                              │        │ (conversion success)
                              │        ▼
                              │   COMPLETED
                              │
                         CANCELLED (from any state)
```

**Storage:** All conversation state is database-backed via Prisma (JSONB). No in-memory session.

**Per-message processing pipeline (13 steps):**
1. Load or create `AIConversation` with all `AIMessage` history
2. Deserialize `draftData` into `TravelDraft` object
3. Detect language from user message (Unicode range analysis)
4. Persist user message as `AIMessage`
5. Check for synthetic callbacks (`__CONFIRM__`, `__CANCEL__`, `__EDIT__*`) — bypass LLM
6. Detect slot edit intent — clear targeted draft fields, bypass LLM
7. Call AI provider (`parse()`) with system prompt + conversation history
8. Track token usage
9. Merge parsed fields into draft (confidence-based rules)
10. Transition state machine
11. If `READY_FOR_RFQ` → convert draft to `TravelRequest` in transaction, trigger distribution
12. Generate response text + suggested keyboard actions
13. Persist updated draft, state, and assistant message

### Parsing Flow

**System Prompt** (`providers/system-prompt.ts`): Dynamically generated per AI call, includes:
- Role definition as travel data extraction assistant
- Current draft state with 14 slots showing value, confidence, status markers
- JSON response schema with `extractedFields`, intent flags, `suggestedQuestion`
- Slot descriptions with expected types and examples
- Confidence guidelines (0.9-1.0 explicit, 0.7-0.8 implied, 0.5-0.6 inferred, <0.5 guess)
- Date hallucination detection rules
- Language detection hint

**Normalization** (`services/ai-parsing.service.ts`):
- Slot name normalization: `trip_type` → `tripType`, `departure_date` → `departureDate`
- Trip type normalization: `package_tour` → `PACKAGE`, `flight` → `FLIGHT_ONLY`
- Currency normalization: `$` → `USD`, `рубли` → `RUB`, `֏` → `AMD`
- Numeric coercion for adults, children, budget fields
- Date hallucination detection

### Slot Filling System

**14 slots** defined with priorities:

| Slot | Type | Required | Priority |
|------|------|----------|----------|
| destination | string | Yes | 1 |
| departureDate | string (ISO) | Yes | 2 |
| adults | number | Yes | 3 |
| departureCity | string | Yes | 4 |
| tripType | string (enum) | Yes | 5 |
| returnDate | string (ISO) | No | 6 |
| children | number | No | 7 |
| childrenAges | number[] | No | 7 |
| infants | number | No | 7 |
| budgetMin | number | No | 8 |
| budgetMax | number | No | 8 |
| currency | string (enum) | No | 8 |
| preferences | string[] | No | 9 |
| notes | string | No | 10 |

**Draft field structure:**
```typescript
interface TravelDraftField<T> {
  value: T | null;
  confidence: number;      // 0.0 - 1.0
  source: 'user_explicit' | 'ai_inferred' | 'default';
  updatedAt: string;       // ISO 8601
}
```

### Draft Merge Rules

- CONFIRMED slots (confidence ≥ 1.0) never overwritten — unless flagged as correction
- Higher confidence always wins
- `user_explicit` source always overwrites
- Corrections always overwrite regardless of confidence
- Draft version incremented after each merge

### Fallback Mechanisms

- **Provider fallback chain:** Anthropic → OpenAI → Mock (regex, no API calls)
- **Retry logic:** 3 attempts, exponential backoff (1s base, max 10s, with jitter). Retryable: 429, 5xx, timeouts
- **JSON parse failures:** Graceful degradation to empty `ParseResult`
- **Draft validation failures:** Stay in `CONFIRMING_DRAFT`, show field-specific errors
- **Conversion failures:** Stay in `CONFIRMING_DRAFT` with retry guidance

### Feedback Signals

Records to `ai_feedback_signals` table (stored for future model fine-tuning, not currently consumed):
- `USER_CORRECTION` — field original + corrected values
- `ABANDONED` — conversation metadata
- `BOOKING_SUCCESS` — successful booking completion

---

## 6. Telegram Bot Architecture

### Registered Handlers

| Handler | Trigger | Method |
|---------|---------|--------|
| `/start` | Command | `handleStart()` |
| `/agency` | Command | `handleAgencyCommand()` |
| `/review_agencies` | Command | `handleReviewCommand()` |
| Text message | `message:text` | `handleTextMessage()` |
| `action:*` callbacks | `callbackQuery(/^action:/)` | `handleCallbackQuery()` |
| `rfq:*` / `offer:*` callbacks | `callbackQuery(/^(rfq:\|offer:)/)` | `handleOfferCallback()` |
| `agency:*` / `review:*` callbacks | `callbackQuery(/^(agency:\|review:)/)` | `handleAgencyCallback()` |

### Text Message Routing Priority

When a text message arrives, it is routed in this priority order:

1. **Agency wizard active** (`agencyApp.hasActiveWizard(chatId)` or `hasPendingRejectReason(chatId)`) → `handleAgencyWizardText()`
2. **Offer wizard active** (`offerWizard.hasActiveWizard(chatId)`) → `handleOfferWizardText()`
3. **Rate limit check** → send "slow down" message if exceeded
4. **Agency agent guard** (`agenciesService.isActiveAgent(telegramId)`) → block with "Agency accounts cannot create travel requests"
5. **Default** → `aiEngine.processMessage()` for AI conversation

### UX Flows

**Traveler Flow:**
```
/start → welcome message
Free text → AI parsing → slot filling → clarification questions
All slots filled → confirmation card [Confirm] [Edit] [Cancel]
[Edit] → field selection keyboard → clear + re-fill
[Confirm] → TravelRequest created → distributed to agencies
Agencies send offers → user notified
```

**Agency Offer Submission Flow:**
```
Agency receives RFQ notification → [Submit Offer] [Reject]
[Submit Offer] → Offer wizard starts
  Step 1: Enter price (number)
  Step 2: Select currency [AMD] [RUB] [USD] [EUR]
  Step 3: Validity period [1 day] [3 days] [7 days] or custom YYYY-MM-DD
  Step 4: Enter description/note (≤500 chars)
  Step 5: Review card [Submit] [Cancel]
  → Creates Offer(SUBMITTED) + updates RfqDistribution → RESPONDED
  → Notifies traveler of new offer
```

**Agency Onboarding Flow:**
```
/agency → checks existing agency/application
  → If approved agency: "You're approved, you'll receive RFQs"
  → If pending application: "Under review"
  → Otherwise: Start registration wizard
    Step 1: Enter agency name (2-100 chars)
    Step 2: Enter phone (+37491123456 format)
    Step 3: Select specializations (toggle: Package/Flights/Hotels/Excursions/Custom) [Done]
    Step 4: Select countries (toggle: Armenia/Georgia/Turkey/Egypt/UAE/Thailand/Maldives/Russia/Europe) [Done]
    Step 5: Review card [Submit] [Cancel]
    → Creates AgencyApplication(SUBMITTED)
```

**Manager Review Flow:**
```
/review_agencies → role check (ADMIN/MANAGER only)
  → Lists pending applications with [Review: AgencyName] buttons
  → [Review] → shows application details + [Approve] [Reject]
  → [Approve] → transaction: creates Agency(APPROVED) + AgencyAgent(OWNER) + updates application
     → notifies applicant "Your agency is approved!"
  → [Reject] → "Enter rejection reason" (text input)
     → updates application(REJECTED, reason)
```

### Callback Data Patterns

| Pattern | Handler | Description |
|---------|---------|-------------|
| `action:confirm` | AI engine | Maps to `__CONFIRM__` synthetic message |
| `action:cancel` | AI engine | Maps to `__CANCEL__` synthetic message |
| `action:edit:<field>` | AI engine | Maps to `__EDIT__<field>` synthetic message |
| `rfq:offer:<travelRequestId>` | Offer wizard | Starts offer submission wizard |
| `rfq:reject:<travelRequestId>` | Telegram update | Stub rejection acknowledgement |
| `offer:cur:<CODE>` | Offer wizard | Currency selection |
| `offer:ttl:<duration>` | Offer wizard | Validity period selection |
| `offer:submit` | Offer wizard | Submit offer |
| `offer:cancel` | Offer wizard | Cancel wizard |
| `agency:spec:<TYPE>` | Agency wizard | Toggle specialization |
| `agency:spec:done` | Agency wizard | Done selecting specializations |
| `agency:country:<NAME>` | Agency wizard | Toggle country |
| `agency:country:done` | Agency wizard | Done selecting countries |
| `agency:submit` | Agency wizard | Submit application |
| `agency:cancel` | Agency wizard | Cancel wizard |
| `review:view:<appId>` | Agency review | View application details |
| `review:approve:<appId>` | Agency review | Approve application |
| `review:reject:<appId>` | Agency review | Start rejection reason flow |

### Session / State Management

- **AI conversations:** Fully database-backed (Prisma JSONB). No in-memory session.
- **Offer wizard:** In-memory `Map<chatId, OfferWizardState>`. Lost on restart.
- **Agency wizard:** In-memory `Map<chatId, AgencyWizardState>`. Lost on restart.
- **Rejection reason:** In-memory `Map<chatId, {applicationId, reviewerUserId}>`. Lost on restart.
- **Rate limiter:** In-memory `Map<telegramId, timestamp[]>`. Lost on restart. Cleanup every 60s.

### Rate Limiting

- **Window:** 5000ms (5 seconds)
- **Maximum:** 5 messages per window per `telegramId`
- **Scope:** Telegram bot only — REST API has no rate limiting

---

## 7. RFQ Business Flow

### End-to-End Flow

```
1. USER sends message via Telegram
   │
   ▼
2. AI ENGINE parses natural language → extracts structured travel data
   │ (multi-turn conversation: clarification questions, slot filling)
   │
   ▼
3. USER confirms draft → TRAVEL REQUEST created (status: READY)
   │
   ▼
4. DISTRIBUTION ENGINE triggers automatically:
   a. Loads traveler's telegramId for self-delivery prevention
   b. AgencyMatchingService scores agencies (region +3, spec +2, rating +0-1)
   c. Filters: APPROVED only, must have telegramChatId, must have active agents, excludes traveler's own chatId
   d. Creates RfqDistribution records per eligible agency
   d. Updates TravelRequest → DISTRIBUTED
   e. Enqueues BullMQ delivery jobs
   │
   ▼
5. RFQ PROCESSOR delivers to each agency:
   a. Builds Telegram Markdown message (destination, dates, travelers, budget)
   b. Sends to agency's telegramChatId with [Submit Offer] [Reject] buttons
   c. Marks distribution → DELIVERED
   │
   ▼
6. AGENCY receives RFQ → clicks [Submit Offer]
   │
   ▼
7. OFFER WIZARD guides agency through:
   Price → Currency → Validity → Note → Confirm
   │ Creates Offer(SUBMITTED) + marks distribution → RESPONDED
   │
   ▼
8. USER notified of new offer via Telegram
   │
   ▼
9. [FUTURE] User views/compares offers → selects one → BOOKING created
   │
   ▼
10. [FUTURE] Booking lifecycle: PENDING → CONFIRMED → PAID → COMPLETED
```

### Status Transitions

**TravelRequest:** DRAFT → COLLECTING_INFO → READY → DISTRIBUTED → OFFERS_RECEIVED → IN_NEGOTIATION → BOOKED → COMPLETED (or CANCELLED/EXPIRED from any state)

**Offer:** DRAFT → SUBMITTED → VIEWED → ACCEPTED/REJECTED → BOOKED (or WITHDRAWN/EXPIRED)

**RfqDistribution:** PENDING → DELIVERED → VIEWED → RESPONDED (or FAILED at any point)

**Booking:** PENDING_CONFIRMATION → CONFIRMED → PAID → COMPLETED (or CANCELLED/REJECTED)

**AgencyApplication:** SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED

---

## 8. Security Model

### Access Control

- **REST API:** Currently **unprotected**. `AuthGuard` and `@CurrentUser()` decorator exist but are not applied. All GET endpoints are publicly accessible.
- **Telegram bot:** Users identified by `telegramId` (BigInt) from grammY context, mapped to internal User UUIDs via `UsersService.findByTelegramId()`
- **Manager commands:** `/review_agencies` enforces role check (`UserRole.ADMIN` or `UserRole.MANAGER`) before allowing access
- **Agency isolation:** Offer wizard resolves agent identity via `telegramId → User → AgencyAgent` chain; unauthorized users cannot submit offers

### Data Protection

- **Proxy chat pattern:** Users and agencies never exchange direct contact info. All communication routed through `ProxyChat` records
- **Prisma parameterized queries:** All database access uses Prisma's type-safe query builder — SQL injection prevention by design
- **Input validation:** Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` strips unknown properties from all DTO inputs
- **CORS:** Enabled but with no origin restrictions (`app.enableCors()`)

### Telegram Identity Mapping

```
Telegram from.id (number) → BigInt(telegramId) → User.telegramId (unique) → User.id (UUID)
```

All domain operations use the internal UUID. Telegram IDs are only used at the adapter boundary.

### Agency Isolation

- Each agency has its own `telegramChatId` — RFQ notifications sent only to matched, APPROVED agencies
- **Self-delivery prevention:** `AgencyMatchingService` excludes agencies whose `telegramChatId` matches the traveler's `telegramId` — a user cannot receive their own RFQ
- **Agency agent guard:** Active agency agents are blocked from creating travel requests via the AI conversation flow (returns "Agency accounts cannot create travel requests")
- **Agent requirement:** Agencies must have at least one active `AgencyAgent` to receive RFQ distributions
- `Offer` has unique constraint `(travelRequestId, agencyId)` — one offer per agency per request
- Agent resolution in offer wizard verifies `telegramId → User → AgencyAgent` chain before allowing offer submission
- Auto-bootstrap creates `AgencyAgent` only if `chatId` matches an agency's `telegramChatId`

---

## 9. External Integrations

### Telegram Bot API

- **Framework:** grammY 1.39.3
- **Mode:** Long polling (not webhook)
- **Bot provider:** Factory-injected via NestJS DI, returns `null` if `TELEGRAM_BOT_TOKEN` not set
- **Message formatting:** Markdown (V1) with plain-text fallback on parse failure; MarkdownV2 for offer notifications
- **Inline keyboards:** Used for confirmation, editing, offer actions, agency onboarding, review actions

### LLM Providers

- **Anthropic (primary):** Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`), temp=0.2, max_tokens=2048
- **OpenAI (secondary):** GPT-4.1, temp=0.2, json_object response format
- **Mock (fallback):** Regex-based parser, no API calls — activates when no API keys configured
- **Retry:** 3 attempts, exponential backoff (1s base, max 10s, jitter), retries on 429/5xx/timeouts

### Redis / BullMQ

- **Connection:** Via `ioredis` configured from `REDIS_HOST` and `REDIS_PORT` env vars
- **Queue:** `rfq-distribution` queue with `deliver-rfq` jobs
- **Job configuration:** 3 retries, exponential backoff (2s initial delay)
- **Processor concurrency:** Default (1 concurrent job)

### PostgreSQL (Neon)

- **Connection:** Pooled serverless PostgreSQL via Neon
- **ORM:** Prisma 6.x with generated type-safe client
- **Retry:** PrismaService implements 3-attempt connection retry with 2s delay

---

## 10. Deployment & Infrastructure

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon) |
| `REDIS_HOST` | Yes | Redis host (default: localhost) |
| `REDIS_PORT` | Yes | Redis port (default: 6379) |
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `ANTHROPIC_API_KEY` | No | Primary AI provider (Claude) |
| `OPENAI_API_KEY` | No | Secondary AI provider (GPT) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | development/production |

### Build Pipeline

- **Build:** `nest build` → compiles TypeScript to `dist/`
- **TypeScript:** Strict mode with incremental builds (`tsBuildInfoFile: "./dist/.tsbuildinfo"`)
- **Tests:** Jest 30 with ts-jest, 161 tests across 14 spec files
- **Linting:** ESLint configured for TypeScript
- **No CI/CD pipeline configured** — no GitHub Actions, Docker, or deployment automation

### Runtime Architecture

- **Single-process NestJS application** running Express HTTP server + grammY polling + BullMQ processor
- **No containerization** — no Dockerfile or docker-compose
- **No webhook mode** — Telegram bot uses long polling
- **Background processing:** BullMQ processor runs in-process (same Node.js event loop)

### Seed Data

- **File:** `prisma/seed.ts`
- **Seeds:** 3 pre-configured agencies with `AgencyStatus.APPROVED` (was VERIFIED before migration):
  - Ararat Travel (specializations: PACKAGE, EXCURSION, CUSTOM)
  - SkyBridge Tours (specializations: FLIGHT_ONLY, HOTEL_ONLY, PACKAGE)
  - Caucasus Adventures (specializations: EXCURSION, CUSTOM)

---

## 11. Known Limitations & Technical Debt

### Architecture Risks

1. **No authentication on REST API.** All endpoints are publicly accessible. `AuthGuard` exists but is not applied. Must be addressed before any web frontend deployment.

2. **In-memory wizard state.** Both `OfferWizardService` and `AgencyApplicationService` store wizard state in `Map<chatId, State>`. This state is **lost on application restart** and **cannot be shared across instances**. For production, wizard state should be persisted to Redis or the database.

3. **In-memory rate limiter.** `TelegramRateLimiter` uses process memory. Same restart/scaling limitations as wizard state.

4. **No event-driven communication.** Module dependencies are synchronous service calls. Domain events are defined in types but not consumed via EventEmitter or pub/sub. Adding new consumers (notifications, analytics) requires modifying existing services.

5. **Circular dependency chain.** `AiModule ↔ DistributionModule ↔ TelegramModule` resolved with `forwardRef()`. This creates coupling that could be eliminated with an event bus.

6. **Single-process monolith.** The bot polling, HTTP server, and BullMQ processor all run in the same Node.js process. Under load, AI API latency could block queue processing.

### Missing Validation

7. **No REST API rate limiting.** Only Telegram bot has rate limiting. REST endpoints have no throttling.

8. **No CORS origin restrictions.** `app.enableCors()` allows any domain.

9. **No input sanitization beyond parameterized queries.** User text stored as-is — XSS risk if rendered in a future web UI without escaping.

### Scalability Risks

10. **Database connection pooling.** No explicit pool size configuration for Neon PostgreSQL. Connection exhaustion possible under high concurrency.

11. **AI API rate limits.** Retry logic handles 429 responses, but no backpressure or admission control prevents burst overload.

12. **BullMQ single queue.** All distribution jobs in one queue with no priority lanes, dead letter queue, or concurrency limits.

13. **Full conversation history in prompts.** All `AIMessage` records sent with each LLM call. Long conversations increase token usage and latency linearly.

### Race Conditions

14. **Concurrent wizard access.** If the same `chatId` sends multiple rapid messages, the in-memory wizard state could be modified concurrently. No mutex or locking mechanism exists.

15. **Offer idempotency timing window.** Between the `findUnique` check and the `create` call in offer submission, a concurrent request could create a duplicate. The unique constraint provides a safety net, but the error handling path returns a generic failure rather than a clear duplicate message.

### Session Persistence Risks

16. **Wizard state loss on deploy.** Any active offer submission or agency registration wizard is silently abandoned when the application restarts. Users receive no notification.

17. **Rejection reason state.** The `pendingRejectReason` map is lost on restart. A reviewer who was typing a rejection reason will see no feedback after restart.

---

## 12. Suggested Improvements

### Priority 1: Production Readiness

1. **Persist wizard state to Redis.** Replace `Map<chatId, State>` in both `OfferWizardService` and `AgencyApplicationService` with Redis-backed storage. This enables horizontal scaling and survives restarts.

2. **Implement REST API authentication.** Add JWT-based auth with Telegram Login Widget or bot-generated tokens. Apply `AuthGuard` globally.

3. **Switch to webhook mode.** Telegram polling is unsuitable for production. Webhook provides immediate delivery and is compatible with serverless/containerized deployments.

4. **Add Docker configuration.** Create `Dockerfile`, `docker-compose.yml`, and `.dockerignore` for reproducible builds and deployment.

5. **Add CORS and rate limiting.** Configure allowed origins and apply `@nestjs/throttler` to REST endpoints.

### Priority 2: Complete Core Flows

6. **Implement offer viewing for users.** Users currently receive "new offer" notifications but cannot view, compare, or accept offers through Telegram.

7. **Implement proxy chat Telegram routing.** `ProxyChatMessage` records exist but are not forwarded between Telegram chats in real time.

8. **Implement booking flow.** No path from offer acceptance through booking creation and confirmation exists in the Telegram interface.

9. **Implement expiration scheduler.** `findExpired()` query exists but no cron/repeatable job calls it.

10. **Implement rejection notification for agencies.** When a reviewer rejects an agency application, the applicant should receive a Telegram notification with the reason.

### Priority 3: Web Frontend & Operations

11. **Create Nuxt 4 frontend** with agency dashboard, admin panel, and user portal.

12. **Add CI/CD pipeline.** GitHub Actions with lint, test, build, and deploy stages.

13. **Add monitoring.** Structured logging (JSON), APM integration (Sentry), health dashboards.

14. **Add proper Armenian translations.** Replace English placeholder text in AM templates.

### Priority 4: Architecture & Scale

15. **Implement domain event bus.** Replace direct cross-module service calls with NestJS EventEmitter. Decouple distribution triggering from AI module.

16. **Add Redis caching.** Cache agency lists, user profiles, frequently accessed data.

17. **Conversation history pruning.** Limit messages sent to LLM (e.g., last 10 turns) to control token usage.

18. **Database connection pool tuning.** Configure Prisma pool size based on expected concurrency.

---

## 13. Change Log

### Changes (628cb2b → 0e37bb3) — RFQ self-delivery fix & agency validation

#### Changed Flows

| Change | Details |
|--------|---------|
| **Self-delivery prevention** | `AgencyMatchingService.match()` now accepts `excludeChatId` parameter. `RfqDistributionService.distribute()` loads the traveler's `telegramId` and passes it to matching. Agencies whose `telegramChatId` matches the traveler are excluded from distribution. |
| **Agency agent requirement** | `AgencyMatchingService` now includes `agents` (active only) in the agency query. Agencies with zero active `AgencyAgent` records are filtered out before scoring. |
| **Missing chatId filter** | Agencies without a `telegramChatId` are now filtered out during matching (previously would fail later in the processor). |
| **Agency agent role isolation** | `TelegramUpdate.handleTextMessage()` now checks `AgenciesService.isActiveAgent(telegramId)` before routing to AI conversation. Active agency agents receive "Agency accounts cannot create travel requests" and are blocked from the AI flow. |
| **Structured skip logging** | `AgencyMatchingService` now logs `[agency-skip]` warnings with specific reasons: missing chatId, same chatId as traveler, no active agents. |

#### New / Modified Files

| File | Change |
|------|--------|
| `agencies.service.ts` | Added `isActiveAgent(telegramId): Promise<boolean>` — queries `agencyAgent` with active status via user relation |
| `agency-matching.service.ts` | Added `excludeChatId` to `MatchCriteria`, added `include: { agents }` to query, added 3-filter eligibility check before scoring loop |
| `rfq-distribution.service.ts` | Added `user.findUniqueOrThrow()` to load traveler's `telegramId`, passes `excludeChatId` to matching |
| `telegram.update.ts` | Injected `AgenciesService`, added agency-agent guard in `handleTextMessage()` after user lookup |

#### Test Coverage

| Metric | Previous | Current |
|--------|----------|---------|
| Test files | 13 | 14 |
| Total tests | 152 | 161 |
| New test suites | — | `agency-matching.service.spec.ts` (7 tests: self-delivery exclusion, missing chatId filter, no-agents filter, scoring, fallback) |
| Updated suites | — | `rfq-distribution.service.spec.ts` (+2 tests: excludeChatId passthrough, self-delivery prevention) |

---

### Previous: Changes (fd10285 → 628cb2b) — agency onboarding

#### New Modules / Services

| Component | Description |
|-----------|-------------|
| `OfferWizardService` | 5-step Telegram wizard for agencies to submit offers (PRICE → CURRENCY → VALID_UNTIL → NOTE → CONFIRM). Includes agent resolution with auto-bootstrap, idempotency checks, atomic offer creation + distribution status update in transaction. |
| `offer-wizard.types.ts` | Types: `OfferWizardStep`, `OfferWizardState`, `WizardStepResult`, `OfferSubmitResult`, `isOfferSubmitResult()`, constants for currencies/validity/note length. |
| `AgencyApplicationService` | 5-step Telegram wizard for agency registration (NAME → PHONE → SPECIALIZATIONS → COUNTRIES → CONFIRM). Includes application review flow with approve/reject. |
| `agency-wizard.types.ts` | Types: `AgencyWizardStep`, `AgencyWizardState`, `WizardStepResult`, constants for specializations/countries/phone regex. |
| `AgencyApplication` model | New Prisma model for tracking agency applications with `AgencyApplicationStatus` enum. |

#### Changed Flows

| Change | Details |
|--------|---------|
| **RFQ delivery now functional** | `RfqDistributionProcessor` now sends actual Telegram messages to agency chats via `TelegramService.sendRfqToAgency()` with "Submit Offer" and "Reject" inline buttons. Previously simulated delivery via logging. |
| **Offer notification implemented** | `TelegramService.sendOfferNotification()` sends MarkdownV2 formatted notification with "View offers" button to travelers when an offer is submitted. Previously was a stub. |
| **Agency status: VERIFIED → APPROVED** | All code and database data migrated from `AgencyStatus.VERIFIED` to `AgencyStatus.APPROVED`. The `VERIFIED` value no longer exists in the enum. |
| **`findVerified()` → `findApproved()`** | Renamed in `AgenciesService` and updated in `AgenciesController`. |
| **Agency matching filter** | `AgencyMatchingService` now filters by `AgencyStatus.APPROVED` (was `VERIFIED`). |
| **Telegram module imports expanded** | Now imports `OffersModule` and `AgenciesModule` in addition to `UsersModule` and `AiModule`. |
| **Text message routing** | Added wizard interception: agency wizard → offer wizard → AI engine (priority order). |
| **New bot commands** | `/agency` (agency onboarding) and `/review_agencies` (manager review) added. |
| **New callback patterns** | `rfq:*`, `offer:*`, `agency:*`, `review:*` callback handlers added to `TelegramUpdate`. |

#### Database Changes

| Change | Details |
|--------|---------|
| `AgencyStatus` enum | Removed `VERIFIED`, added `APPROVED` and `REJECTED`. Data migrated via enum recreation in migration SQL. |
| `UserRole` enum | Added `MANAGER` between `TRAVELER` and `ADMIN`. |
| `AgencyApplicationStatus` enum | New: `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`. |
| `Agency.contactEmail` | Changed from `String` (required) to `String?` (nullable). |
| `Agency.verifiedAt` | New `DateTime?` field. |
| `Agency.verifiedByUserId` | New `UUID?` FK → User. |
| `Agency.verifiedBy` | New relation via `"AgencyVerifier"`. |
| `User.reviewedApplications` | New relation via `"ApplicationReviewer"`. |
| `User.verifiedAgencies` | New relation via `"AgencyVerifier"`. |
| `agency_applications` table | New table with applicantTelegramId, draftData (JSONB), status, reviewer fields. |
| Seed data | All agencies now seeded as `AgencyStatus.APPROVED` (was `VERIFIED`). |

#### Test Coverage

| Metric | Previous | Current |
|--------|----------|---------|
| Test files | 9 | 13 |
| Total tests | ~101 | 152 |
| New test suites | — | `agency-application.service.spec.ts` (25 tests), `offer-wizard.service.spec.ts` (26 tests), `rfq-distribution.processor.spec.ts` (9 tests), `rfq-distribution.service.spec.ts` (4 tests) |

#### Removed / Deprecated

| Item | Details |
|------|---------|
| `AgencyStatus.VERIFIED` | Completely removed from enum and all code references. Replaced by `APPROVED`. |
| `findVerified()` | Replaced by `findApproved()` in `AgenciesService`. |
| Simulated RFQ delivery | Replaced by actual Telegram message sending in `RfqDistributionProcessor`. |
| Stub `sendOfferNotification()` | Replaced by real implementation with MarkdownV2 + inline keyboard. |

### Sections Added (628cb2b — architecture risk analysis)

| Section | Description |
|---------|-------------|
| **14. Architecture Risk Radar** | Identified 4 scaling blockers, 3 coupling risks, 3 performance bottlenecks, 3 AI cost risks, 3 state management risks. |
| **15. Domain Events Map** | Documented 11 existing implicit events. Defined event boundaries for 4 aggregates. Identified 5 candidate event-driven refactorings. |
| **16. AI Cost & Performance Analysis** | Modeled per-message token costs (~1130 + 150×N tokens/turn). Estimated $0.018-$0.251 per conversation. Latency breakdown with LLM dominating at 1.5-4s. |
| **17. Scaling Strategy** | Assessed vertical limits (~100 concurrent users). 4 microservice extraction candidates. State externalization plan (~2-3 day effort). 3-phase scaling roadmap to 50K users. |
| **18. Production Readiness Score** | Scored 34/100. Gap to 60/100 MVP threshold requires 5 specific actions. |

---

## 14. Architecture Risk Radar

### Scaling Blockers

| Risk | Severity | Location | Impact |
|------|----------|----------|--------|
| **In-memory wizard state** | CRITICAL | `OfferWizardService` (Map), `AgencyApplicationService` (Map), `TelegramRateLimiter` (Map) | Prevents horizontal scaling entirely. Running >1 instance means users can hit a different instance mid-wizard and lose all progress. Deployment restarts silently abandon active wizards with no user notification. |
| **Single-process architecture** | HIGH | `main.ts` — Express + grammY polling + BullMQ processor colocated | One Node.js event loop handles HTTP, Telegram polling, AI API calls, and queue processing. A slow Claude API response (5–15s) blocks the event loop for other users. Cannot scale bot separately from API. |
| **Agency matching full table scan** | HIGH | `AgencyMatchingService.findMatchingAgencies()` | Loads ALL approved agencies into memory then scores in O(n) loop with string comparisons on `regions[]` and `specializations[]` arrays. At 10k+ agencies this becomes a latency bottleneck on every RFQ. |
| **No database connection pool config** | MEDIUM | Prisma default (pool_size=10) | Under concurrent load (multiple AI conversations + distributions + REST), 10 connections can saturate quickly against Neon serverless PostgreSQL. |

### Coupling Risks

| Risk | Severity | Location | Impact |
|------|----------|----------|--------|
| **Circular dependency chain** | MEDIUM | `AiModule ↔ DistributionModule ↔ TelegramModule` (3× forwardRef) | Changes to any module in the chain require careful testing of all three. Cannot extract modules independently. Event bus would eliminate this entirely. |
| **TelegramUpdate god handler** | MEDIUM | `telegram.update.ts` — 6 injected services, ~600 lines | Single class handles all commands, text routing, and 4 callback prefixes. Adding any new feature requires modifying this file. Violates single responsibility. |
| **Direct PrismaService injection** | LOW | `OffersService`, `AgencyApplicationService`, `BookingsService` | Domain services access database directly rather than through repository abstractions. Acceptable for current scale but makes unit testing verbose and blocks future data layer swaps. |

### Performance Bottlenecks

| Risk | Severity | Location | Impact |
|------|----------|----------|--------|
| **Unbounded conversation history in LLM prompts** | HIGH | `AiEngineService.processMessage()` → sends all `AIMessage` records | Each AI call includes the full message history. A 20-turn conversation sends ~40 messages + system prompt (~3000+ tokens minimum). Token cost and latency grow linearly per turn. No truncation or summarization. |
| **No query pagination on most endpoints** | MEDIUM | `OffersService.findMany()`, `AgenciesService.findApproved()`, `findPendingApplications()` | Only `TravelRequestsController` uses `PaginationDto`. Other services return unbounded result sets. |
| **Synchronous offer notification** | LOW | `telegram.update.ts:317-321` | Traveler notification sent inline during offer callback handler. If Telegram API is slow, agency waits for the traveler's notification to complete before receiving confirmation. |

### AI Cost Risks

| Risk | Severity | Impact |
|------|----------|--------|
| **No token budget per conversation** | HIGH | `tokensUsed` tracked but never checked against a limit. A chatty user can run 50+ turns, each costing ~2000 tokens input + ~500 output. Single conversation could cost $1+ with Claude Sonnet. |
| **No conversation timeout** | MEDIUM | `AIConversation` has no TTL. Abandoned conversations remain ACTIVE indefinitely. No mechanism to auto-close stale conversations or prevent resumed old conversations from accumulating expensive context. |
| **System prompt regenerated per call** | LOW | `buildSystemPrompt()` includes current draft state (~200+ lines). Prompt is rebuilt on every single message, even if the draft hasn't changed. Caching system prompt when draft is unchanged would save ~500 tokens per call. |

### State Management Risks

| Risk | Severity | Location | Impact |
|------|----------|----------|--------|
| **No state transition validation** | HIGH | `TravelRequestsService.updateStatus()`, `OffersService.updateStatus()`, `BookingsService.updateStatus()` | Any status can transition to any other status. No guard prevents COMPLETED → DRAFT or CANCELLED → BOOKED. Only `ConversationStateService` validates transitions against a whitelist. |
| **Split state model** | MEDIUM | AI conversations in DB, wizards in memory, rate limits in memory | Three different persistence strategies for state. Makes debugging user issues difficult — must check DB + process memory to reconstruct full state. |
| **No optimistic locking** | MEDIUM | All Prisma updates use `where: { id }` without version checks | Concurrent updates to the same record silently overwrite each other. Two reviewers could approve the same application simultaneously, creating duplicate agencies. |

---

## 15. Domain Events Map

### Existing Implicit Events

These events occur in the system today but are **not published to an event bus**. They are hardcoded as direct service calls or fire-and-forget background invocations.

| Event | Trigger Location | Current Side Effects | Missing Side Effects |
|-------|-----------------|---------------------|---------------------|
| **TravelRequestCreated** | `draft-to-request.service.ts:95-117` (transaction) | Distribution triggered via `distributeInBackground()` | Analytics tracking, admin dashboard notification |
| **TravelRequestDistributed** | `rfq-distribution.service.ts:106-112` | Event object created and logged, NOT published | Status dashboard update, user notification ("sent to N agencies") |
| **RfqDelivered** | `rfq-distribution.processor.ts:102` | Distribution record marked DELIVERED | Delivery receipt analytics |
| **RfqDeliveryFailed** | `rfq-distribution.processor.ts:112` | Distribution record marked FAILED | Admin alert, retry dashboard |
| **OfferSubmitted** | `offer-wizard.service.ts:322-356` (transaction) | Distribution marked RESPONDED; traveler notified via Telegram | TravelRequest status → OFFERS_RECEIVED (currently never set), email notification |
| **AgencyApplicationSubmitted** | `agency-application.service.ts:457-469` | Application record created | Admin/manager notification, application queue dashboard |
| **AgencyApproved** | `agency-application.service.ts:233-275` (transaction) | Agency + AgencyAgent created, application updated; applicant notified | Welcome email, agency onboarding checklist |
| **AgencyRejected** | `agency-application.service.ts:292-300` | Application status updated | Applicant notification with reason (partially implemented — notification logic exists in telegram.update.ts but not confirmed end-to-end) |
| **BookingStatusChanged** | `bookings.service.ts:44-70` | StatusHistory record created | User/agency notification, payment trigger |
| **UserCreated** | `users.service.ts:create()` | User record created | Welcome message (currently sent separately in telegram.update.ts) |
| **ConversationAbandoned** | `ai-engine.service.ts:207-210` | AIConversation marked ABANDONED, FeedbackSignal recorded | Analytics, re-engagement message after N hours |

### Recommended Event Boundaries

The system should publish domain events at these boundaries to decouple modules:

```
┌───────────────────────────────────────────────────────────────┐
│  Aggregate: TravelRequest                                      │
│  Events:                                                       │
│    TravelRequestCreated    → triggers Distribution             │
│    TravelRequestDistributed → triggers user notification       │
│    TravelRequestExpired    → triggers cleanup + notifications  │
│    OffersReceived          → triggers status update            │
│    TravelRequestBooked     → triggers booking creation         │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Aggregate: Offer                                              │
│  Events:                                                       │
│    OfferSubmitted          → triggers user notification        │
│    OfferAccepted           → triggers booking + reject others  │
│    OfferWithdrawn          → triggers user notification        │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Aggregate: Agency                                             │
│  Events:                                                       │
│    ApplicationSubmitted    → triggers manager notification     │
│    AgencyApproved          → triggers welcome + RFQ eligibility│
│    AgencyRejected          → triggers applicant notification   │
│    AgencySuspended         → triggers RFQ pause                │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Aggregate: Booking                                            │
│  Events:                                                       │
│    BookingCreated          → triggers confirmation request     │
│    BookingConfirmed        → triggers payment flow             │
│    BookingCancelled        → triggers refund + notifications   │
└───────────────────────────────────────────────────────────────┘
```

### Candidate Event-Driven Refactorings

| Priority | Refactoring | Current State | Target State | Benefit |
|----------|------------|---------------|--------------|---------|
| **P0** | Decouple AI → Distribution | `AiEngineService` directly calls `RfqDistributionService.distribute()` via `forwardRef` | Publish `TravelRequestCreated` event; `DistributionModule` subscribes | Eliminates circular dependency, enables independent module testing |
| **P0** | Decouple Distribution → Telegram | `RfqDistributionProcessor` directly calls `TelegramService` via `forwardRef` | Publish `RfqReadyForDelivery` event; `TelegramModule` subscribes to deliver | Eliminates second circular dependency |
| **P1** | Centralize notifications | Telegram sends scattered across `telegram.update.ts`, `rfq-distribution.processor.ts` | Publish domain events; `NotificationService` subscribes and routes to Telegram/email/push | Single notification policy layer, easy to add channels |
| **P2** | Auto-expire travel requests | `findExpired()` exists but never called | Publish `TravelRequestExpired` on cron; subscribers handle cleanup + notifications | Prevents stale requests from cluttering system |
| **P2** | Status transition events | `updateStatus()` is a raw DB write | Publish `StatusChanged` events with from/to; enable audit + downstream reactions | Enables reactive flows without modifying services |

**Recommended implementation:** NestJS `@nestjs/event-emitter` (built-in EventEmitter2 wrapper). No external infrastructure required. Add `@OnEvent('travel-request.created')` handlers to decouple the circular dependency chain in a single PR.

---

## 16. AI Cost & Performance Analysis

### Token Usage Model

**Per-message cost estimate (Claude Sonnet 4.5):**

| Component | Tokens (est.) | Notes |
|-----------|--------------|-------|
| System prompt (static) | ~800 | Role definition, JSON schema, slot descriptions, rules |
| System prompt (draft state) | ~200-600 | Grows with filled slots; 14 slots × ~40 tokens each |
| Conversation history | ~100-200/turn | Each turn = user message (~50 tokens) + assistant response (~100 tokens) |
| User message (current) | ~30-80 | Natural language travel description |
| **Total input (turn N)** | **~1130 + 150×N** | Linear growth with conversation length |
| Output (assistant response) | ~200-500 | JSON parse result + suggested question |

**Cost per conversation (Claude Sonnet 4.5 pricing: $3/MTok input, $15/MTok output):**

| Turns | Input Tokens | Output Tokens | Cost |
|-------|-------------|---------------|------|
| 3 (fast) | ~1,580 | ~900 | $0.018 |
| 5 (typical) | ~1,880 | ~1,500 | $0.028 |
| 10 (complex) | ~2,630 | ~3,000 | $0.053 |
| 20 (chatty) | ~4,130 | ~6,000 | $0.102 |
| 50 (edge case) | ~8,630 | ~15,000 | $0.251 |

### Token Growth Risks

| Risk | Severity | Detail |
|------|----------|--------|
| **Unbounded history** | HIGH | No truncation of `AIMessage` records. History grows linearly. A 50-turn conversation sends ~8,600 input tokens per call. Last 5 calls alone cost as much as the first 45 combined. |
| **System prompt duplication** | MEDIUM | Full system prompt (~800-1400 tokens) sent on every call even if unchanged. Could cache and send hash reference with providers that support it. |
| **No per-user budget** | HIGH | No mechanism to cap token spend per user or per conversation. A single adversarial user could exhaust monthly API budget. |
| **Draft snapshots stored but not pruned** | LOW | `draftSnapshots` JSONB field accumulates all draft versions. Not sent to LLM but grows database storage per conversation. |

### Latency Bottlenecks

| Stage | Typical Latency | Worst Case | Notes |
|-------|----------------|------------|-------|
| Telegram message receipt | <100ms | <500ms | grammY polling interval |
| User lookup/creation | 5-20ms | 200ms | Prisma query to Neon PostgreSQL |
| Conversation load | 10-50ms | 500ms | Includes all messages (unbounded) |
| **LLM API call** | **1.5-4s** | **15s** | Dominant latency. Claude Sonnet typical ~2s. Retries add 1-10s each. |
| Draft merge + state transition | <5ms | <10ms | In-memory computation |
| Draft → TravelRequest conversion | 20-50ms | 200ms | Prisma transaction |
| Distribution (async) | <100ms | <500ms | Enqueues BullMQ jobs, non-blocking |
| Response send to Telegram | 50-200ms | 2s | Telegram API latency |
| **Total user-perceived latency** | **2-5s** | **18s** | Dominated by LLM call |

### Conversation Scaling Problems

| Problem | Impact | Mitigation |
|---------|--------|------------|
| **Long conversations degrade response time** | Each additional turn adds ~150 tokens to every subsequent LLM call input. At turn 20, input is 2.5× turn 3. | Implement sliding window (last 10 turns) + summary of earlier turns. |
| **Concurrent AI calls compete for rate limits** | Claude API rate limits are per-account. 50 simultaneous users = 50 concurrent API calls. 429 responses trigger retries, creating cascading delays. | Add admission control: queue AI requests, limit concurrent calls to N (e.g., 10), reject excess with "please wait" message. |
| **No streaming = full response wait** | User sees nothing until entire LLM response is generated and parsed. 2-4 second perceived silence. | Implement streaming: send "typing" indicator via Telegram `sendChatAction`, stream response tokens. |
| **Failed parse = wasted tokens** | If JSON extraction fails after LLM responds, all input tokens are wasted. Retry sends the same expensive prompt. | Cache raw LLM response, retry JSON extraction with different regex before re-calling LLM. |

---

## 17. Scaling Strategy

### Current Vertical Scaling Limits

| Resource | Current | Limit | Bottleneck |
|----------|---------|-------|-----------|
| **Node.js process** | 1 (single event loop) | ~1000 concurrent connections | LLM API calls (2-15s blocking) + Telegram polling compete for event loop time |
| **PostgreSQL connections** | Prisma default (10) | Neon free: 100 pooled | 10 concurrent Prisma operations before connection starvation |
| **Redis connections** | BullMQ default | ~10,000 | Not a near-term bottleneck |
| **Memory (in-memory state)** | ~50MB baseline | ~512MB before GC pressure | Each wizard state ~2KB; 10,000 concurrent wizards = ~20MB (acceptable). Main risk is not memory but instance loss. |
| **AI API rate limit** | Account-level | Anthropic tier-dependent (typically 60 RPM for Sonnet) | At 60 RPM max, system supports ~60 concurrent conversations before queuing |

**Estimated capacity (single instance):** ~50-100 concurrent active users before degradation; ~500-1000 registered users with typical 5-10% active ratio.

### Microservice Extraction Candidates

| Priority | Service | Reason | Dependencies to Resolve |
|----------|---------|--------|------------------------|
| **P0** | **AI Conversation Service** | Highest resource consumer (LLM API calls, 2-15s latency). Isolating it prevents AI latency from blocking offer submissions, agency reviews, and health checks. | Extract `AiModule` + `AiEngineService` into standalone NestJS microservice. Communicate via NATS/Redis pub-sub. Requires event-driven refactoring (Section 15). |
| **P1** | **Distribution Worker** | BullMQ processor should run in a separate process. Currently shares event loop with HTTP server and Telegram polling. A burst of 50 distribution jobs blocks all other operations. | Already queue-based. Extract `RfqDistributionProcessor` into standalone BullMQ worker process. Minimal code change — just separate `main.ts` entry point. |
| **P2** | **Telegram Bot Gateway** | Telegram polling/webhook should be a separate process that publishes messages to a queue. Enables multiple bot instances with webhook mode behind a load balancer. | Replace grammY polling with webhook mode. Add message queue between gateway and NestJS business logic. |
| **P3** | **Notification Service** | Centralize all outbound messaging (Telegram, future email/push). Currently scattered across `TelegramUpdate`, `RfqDistributionProcessor`. | Implement notification event subscribers. Route all sends through single service. |

### State Externalization Plan

| State | Current Storage | Target | Migration Effort |
|-------|----------------|--------|-----------------|
| **Offer wizard** | `Map<chatId, OfferWizardState>` in process memory | Redis hash: `wizard:offer:{chatId}` with 30-min TTL | LOW — serialize/deserialize JSON, replace Map.get/set with Redis GET/SET |
| **Agency wizard** | `Map<chatId, AgencyWizardState>` in process memory | Redis hash: `wizard:agency:{chatId}` with 30-min TTL | LOW — same pattern as offer wizard |
| **Rejection reason** | `Map<chatId, {applicationId, reviewerUserId}>` in process memory | Redis hash: `wizard:reject:{chatId}` with 10-min TTL | TRIVIAL — 2-field object |
| **Rate limiter** | `Map<telegramId, timestamp[]>` in process memory | Redis sorted set: `ratelimit:{telegramId}` with sliding window | LOW — use `ZADD`/`ZRANGEBYSCORE`/`ZREMRANGEBYSCORE` |
| **AI conversation** | Already in PostgreSQL (JSONB) | No change needed | N/A — already externalized |
| **BullMQ jobs** | Already in Redis | No change needed | N/A — already externalized |

**Total effort to externalize all in-memory state: ~2-3 days.** This single change unblocks multi-instance deployment.

### Scaling Roadmap

```
Phase 1 (Current → 500 users):
  ✓ Single process, single instance
  → Externalize wizard state to Redis
  → Add conversation history truncation (last 10 turns)
  → Configure Prisma pool size (20-30)

Phase 2 (500 → 5,000 users):
  → Extract BullMQ processor to separate worker process
  → Switch Telegram to webhook mode
  → Add AI request admission control (max 20 concurrent LLM calls)
  → Add Redis caching for agency list (5-min TTL)
  → Move agency matching to SQL (GIN indexes on arrays)

Phase 3 (5,000 → 50,000 users):
  → Extract AI service to microservice (NATS/Redis pub-sub)
  → Horizontal scaling with 2-4 NestJS instances behind load balancer
  → Implement event bus for all cross-module communication
  → Add database read replicas for queries
  → Implement conversation summarization for history compression
```

---

## 18. Production Readiness Score

**Overall Score: 37 / 100** _(was 34 at 628cb2b)_

### Category Breakdown

| Category | Score | Max | Assessment |
|----------|-------|-----|-----------|
| **Security** | 7 | 20 | REST API still unprotected. No authentication, no CORS restrictions, no rate limiting on HTTP endpoints. **Improved:** Self-delivery prevention guards RFQ routing. Agency-agent role isolation blocks agents from traveler flows. Role checks exist for `/review_agencies`. OWASP top-10 risks still present (unrestricted CORS, no auth, no HTTP rate limiting). |
| **Reliability** | 9 | 20 | In-memory wizard state lost on restart with no user notification. No circuit breakers for external services. AI provider fallback chain works but degrades silently. No status transition validation (invalid state changes possible). **Improved:** Agency matching validates telegramChatId + active agents before distribution, preventing silent delivery failures. Prisma connection retry exists (3×2s). BullMQ retry exists (3× exponential). No dead letter queue. |
| **Scalability** | 4 | 20 | Cannot run multiple instances (in-memory state). Single-process architecture. No connection pool tuning. Agency matching does full table scan. Unbounded query results on most endpoints. No caching layer. AI conversation history grows unbounded. Estimated ceiling: ~100 concurrent users on single instance. |
| **Observability** | 5 | 20 | Basic `ConsoleLogger` wrapping NestJS logger — no structured logging. No distributed tracing or correlation IDs. No metrics collection (Prometheus/StatsD). Health check covers database only (no Redis, no AI provider, no queue). Token usage logged but not aggregated. No alerting. No dashboard. |
| **Cost Efficiency** | 12 | 20 | AI provider fallback chain prevents total cost failure (Mock fallback = $0). Temperature 0.2 is cost-efficient for extraction tasks. max_tokens=2048 caps output cost. However: no per-user token budget, no conversation length limits, no prompt caching, full history on every call. Estimated cost at scale: $0.03-0.10 per conversation × 1000 daily = $30-100/day in AI API costs alone. |

### Score Justification

**What works well (earned points):**
- Prisma type safety eliminates SQL injection
- AI provider fallback chain (Anthropic → OpenAI → Mock) provides resilience
- BullMQ retry with exponential backoff for distribution jobs
- Database-backed AI conversation state survives restarts
- Atomic transactions for critical flows (offer submission, agency approval, draft conversion)
- Idempotency guards on distribution and offer submission
- Booking status audit trail
- Telegram rate limiting (basic but functional)
- Global ValidationPipe with whitelist mode
- **Self-delivery prevention** — traveler's telegramId excluded from agency matching (+2 Security)
- **Agency-agent role isolation** — active agents blocked from AI conversation flow (+1 Reliability)

**What prevents a higher score (lost points):**
- No authentication on REST API (−10)
- In-memory wizard state blocks scaling (−8)
- No structured logging or metrics (−8)
- No circuit breakers (−5)
- Unbounded conversation history in LLM prompts (−5)
- No status transition validation (−4)
- No CORS configuration (−3)
- No health check for Redis/AI/queue (−3)
- No dead letter queue (−3)
- Single-process architecture (−3)
- No optimistic locking (−3)
- No conversation timeout/cleanup (−2)
- No per-user token budget (−2)

### Minimum Viable Production Threshold: 60/100

**Gap to close: 23 points** _(was 26)._ Required actions:
1. REST API authentication (+8)
2. Externalize wizard state to Redis (+6)
3. Structured logging + basic metrics (+5)
4. Status transition validation (+4)
5. CORS origin restriction + HTTP rate limiting (+3)

---

_End of Technical Architecture Report_