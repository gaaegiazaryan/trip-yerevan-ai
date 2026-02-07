# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Trip Yerevan AI

Travel RFQ platform with Telegram bot for Armenian market. Users send travel requests in natural language, platform distributes them to travel agencies who respond with offers.

## Tech Stack

- **Backend:** NestJS + Prisma + PostgreSQL + Redis + BullMQ
- **Bot:** Telegram via grammY
- **Frontend:** Nuxt 4
- **AI:** Claude, OpenAI
- **Languages:** TypeScript (strict mode)

## Monorepo Structure

```
trip-yerevan-ai/apps/
  backend/src/          # NestJS API server
    modules/            # Domain feature modules
    common/             # Shared decorators, DTOs, guards
    infra/              # Prisma, BullMQ queue, logger
  bot/telegram/         # grammY Telegram bot
  web/                  # Nuxt 4 frontend
  packages/
    shared-types/       # Cross-app TypeScript types
    shared-utils/       # Cross-app utility functions
  docs/                 # Product documentation
```

## Domain Modules (backend/src/modules/)

- `travel-requests` — RFQ creation and lifecycle
- `offers` — Agency quotes for travel requests
- `agencies` — Agency registration and management
- `bookings` — Confirmed booking tracking
- `users` — User accounts and profiles
- `telegram` — Telegram webhook/integration (no business logic here)
- `proxy-chat` — Anonymized messaging between users and agencies
- `ai` — AI conversation flow, request parsing, matching

## Architecture Rules

- **Modular monolith** with clean architecture
- **No business logic in the Telegram module** — it only handles bot I/O and delegates to services
- **Services contain all business logic** — controllers/handlers are thin
- **DTO validation required** on all inputs
- **Proxy chat pattern** — users and agencies never exchange direct contacts
- **Multi-language support** — all user-facing text must handle RU / AM / EN
