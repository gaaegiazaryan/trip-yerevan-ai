-- CreateEnum
CREATE TYPE "Language" AS ENUM ('RU', 'AM', 'EN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TRAVELER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('PENDING', 'VERIFIED', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('OWNER', 'MANAGER', 'AGENT');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TravelRequestStatus" AS ENUM ('DRAFT', 'COLLECTING_INFO', 'READY', 'DISTRIBUTED', 'OFFERS_RECEIVED', 'IN_NEGOTIATION', 'BOOKED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TripType" AS ENUM ('PACKAGE', 'FLIGHT_ONLY', 'HOTEL_ONLY', 'EXCURSION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('AMD', 'USD', 'EUR', 'RUB');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VIEWED', 'ACCEPTED', 'REJECTED', 'BOOKED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfferItemType" AS ENUM ('FLIGHT', 'HOTEL', 'TRANSFER', 'INSURANCE', 'EXCURSION', 'OTHER');

-- CreateEnum
CREATE TYPE "ProxyChatStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('USER', 'AGENCY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AIConversationStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'FAILED');

-- CreateEnum
CREATE TYPE "AIMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AIModel" AS ENUM ('CLAUDE', 'OPENAI');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'RU',
    "role" "UserRole" NOT NULL DEFAULT 'TRAVELER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "telegramChatId" BIGINT,
    "status" "AgencyStatus" NOT NULL DEFAULT 'PENDING',
    "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agency_agents" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AgentRole" NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agency_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "TravelRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "rawText" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "destination" TEXT,
    "departureCity" TEXT NOT NULL DEFAULT 'Yerevan',
    "departureDate" DATE,
    "returnDate" DATE,
    "tripType" "TripType",
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "childrenAges" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "infants" INTEGER NOT NULL DEFAULT 0,
    "budgetMin" DECIMAL(12,2),
    "budgetMax" DECIMAL(12,2),
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "travelRequestId" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "description" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_items" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "type" "OfferItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_chats" (
    "id" UUID NOT NULL,
    "travelRequestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "status" "ProxyChatStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "proxy_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_chat_messages" (
    "id" UUID NOT NULL,
    "proxyChatId" UUID NOT NULL,
    "senderType" "MessageSenderType" NOT NULL,
    "senderId" UUID NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "proxy_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "travelRequestId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromStatus" "BookingStatus" NOT NULL,
    "toStatus" "BookingStatus" NOT NULL,
    "changedBy" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "travelRequestId" UUID,
    "status" "AIConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "model" "AIModel" NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "AIMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_name_key" ON "agencies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "agency_agents_userId_key" ON "agency_agents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agency_agents_agencyId_userId_key" ON "agency_agents"("agencyId", "userId");

-- CreateIndex
CREATE INDEX "travel_requests_userId_idx" ON "travel_requests"("userId");

-- CreateIndex
CREATE INDEX "travel_requests_status_idx" ON "travel_requests"("status");

-- CreateIndex
CREATE INDEX "travel_requests_expiresAt_idx" ON "travel_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "offers_travelRequestId_idx" ON "offers"("travelRequestId");

-- CreateIndex
CREATE INDEX "offers_agencyId_idx" ON "offers"("agencyId");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "offers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "offers_travelRequestId_agencyId_key" ON "offers"("travelRequestId", "agencyId");

-- CreateIndex
CREATE INDEX "offer_items_offerId_idx" ON "offer_items"("offerId");

-- CreateIndex
CREATE INDEX "proxy_chats_userId_idx" ON "proxy_chats"("userId");

-- CreateIndex
CREATE INDEX "proxy_chats_agencyId_idx" ON "proxy_chats"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "proxy_chats_travelRequestId_userId_agencyId_key" ON "proxy_chats"("travelRequestId", "userId", "agencyId");

-- CreateIndex
CREATE INDEX "proxy_chat_messages_proxyChatId_createdAt_idx" ON "proxy_chat_messages"("proxyChatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_travelRequestId_key" ON "bookings"("travelRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_offerId_key" ON "bookings"("offerId");

-- CreateIndex
CREATE INDEX "bookings_userId_idx" ON "bookings"("userId");

-- CreateIndex
CREATE INDEX "bookings_agencyId_idx" ON "bookings"("agencyId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "booking_status_history_bookingId_createdAt_idx" ON "booking_status_history"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_travelRequestId_key" ON "ai_conversations"("travelRequestId");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_status_idx" ON "ai_conversations"("userId", "status");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "agency_agents" ADD CONSTRAINT "agency_agents_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agency_agents" ADD CONSTRAINT "agency_agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_requests" ADD CONSTRAINT "travel_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agency_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_chats" ADD CONSTRAINT "proxy_chats_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_chats" ADD CONSTRAINT "proxy_chats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_chats" ADD CONSTRAINT "proxy_chats_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_chat_messages" ADD CONSTRAINT "proxy_chat_messages_proxyChatId_fkey" FOREIGN KEY ("proxyChatId") REFERENCES "proxy_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_travelRequestId_fkey" FOREIGN KEY ("travelRequestId") REFERENCES "travel_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
