# Product Vision

## Problem

Travel planning in Armenia is fragmented. Users must manually contact multiple agencies via phone, Instagram, or walk-ins to compare prices. Agencies lack a unified channel for receiving structured requests.

## Solution

Trip Yerevan AI — a Telegram-based travel RFQ (Request for Quote) platform that connects travelers with agencies through a single conversational interface.

## How It Works

1. **User sends a travel request** via Telegram in natural language (RU / AM / EN)
2. **AI parses the request** into a structured format (destination, dates, travelers, budget, preferences)
3. **Platform distributes the RFQ** to matching travel agencies
4. **Agencies submit offers** with pricing and details
5. **User receives and compares offers** through the bot
6. **Proxy chat** enables direct negotiation between user and agency without exposing personal contacts
7. **Booking is confirmed** and tracked through the platform

## Target Market

- Armenian travelers (primarily Russian and Armenian speaking)
- Local travel agencies operating in Armenia

## Key Differentiators

- **Telegram-first** — meets users where they already are
- **AI-powered conversation** — no forms, just natural language
- **Multi-language** — Russian, Armenian, English
- **Agency competition** — multiple offers per request drive better pricing
- **Privacy** — proxy chat keeps personal contacts private

## User Roles

- **Traveler** — submits travel requests, receives offers, chats with agencies
- **Agency** — receives RFQs, submits offers, communicates with travelers
- **Admin** — manages platform, agencies, and monitors activity

## Core Flows

### Traveler Flow
- Start bot -> describe trip in natural language -> AI clarifies details -> RFQ created -> receive offers -> compare -> chat with agency -> book

### Agency Flow
- Register on platform -> receive relevant RFQs -> submit offers -> chat with traveler -> confirm booking

## Success Metrics

- Number of travel requests submitted
- Number of active agencies
- RFQ-to-offer conversion rate
- Offer-to-booking conversion rate
- User retention (repeat requests)
