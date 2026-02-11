-- CreateEnum: ProxyChatState (replaces ProxyChatStatus)
CREATE TYPE "ProxyChatState" AS ENUM ('OPEN', 'REPLY_ONLY', 'PAUSED', 'ESCALATED', 'CLOSED');

-- CreateEnum: CloseReason (replaces closedReason string)
CREATE TYPE "CloseReason" AS ENUM ('MANUAL', 'INACTIVITY', 'MANAGER', 'COMPLETED', 'ARCHIVED');

-- CreateEnum: PolicyDecision
CREATE TYPE "PolicyDecision" AS ENUM ('ALLOW', 'BLOCK', 'FLAG', 'REDACT');

-- CreateEnum: ChatChannel
CREATE TYPE "ChatChannel" AS ENUM ('TELEGRAM', 'WEB');

-- AddColumn: proxy_chats.state (new state machine field)
ALTER TABLE "proxy_chats" ADD COLUMN "state" "ProxyChatState" NOT NULL DEFAULT 'OPEN';

-- AddColumn: proxy_chats.closeReason (typed enum replaces string)
ALTER TABLE "proxy_chats" ADD COLUMN "closeReason" "CloseReason";

-- AddColumn: proxy_chats tracking fields
ALTER TABLE "proxy_chats" ADD COLUMN "lastMessageAt" TIMESTAMP(3);
ALTER TABLE "proxy_chats" ADD COLUMN "lastMessageBy" UUID;
ALTER TABLE "proxy_chats" ADD COLUMN "replyWindowUntil" TIMESTAMP(3);
ALTER TABLE "proxy_chats" ADD COLUMN "policyVersion" TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE "proxy_chats" ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "proxy_chats" ADD COLUMN "channel" "ChatChannel" NOT NULL DEFAULT 'TELEGRAM';

-- BackfillState: map old status values to new state values
UPDATE "proxy_chats" SET "state" = 'PAUSED' WHERE "status" = 'BOOKED';
UPDATE "proxy_chats" SET "state" = 'ESCALATED' WHERE "status" = 'MANAGER_ASSIGNED';
UPDATE "proxy_chats" SET "state" = 'CLOSED' WHERE "status" IN ('COMPLETED', 'CLOSED', 'ARCHIVED');
-- OPEN rows already default to 'OPEN'

-- BackfillCloseReason: map old closedReason strings to enum values
UPDATE "proxy_chats" SET "closeReason" = 'MANUAL' WHERE "closedReason" = 'manual';
UPDATE "proxy_chats" SET "closeReason" = 'INACTIVITY' WHERE "closedReason" = 'auto_closed_inactivity';
UPDATE "proxy_chats" SET "closeReason" = 'MANAGER' WHERE "closedReason" = 'manager_closed';
UPDATE "proxy_chats" SET "closeReason" = 'COMPLETED' WHERE "status" = 'COMPLETED' AND "closedReason" IS NULL;
UPDATE "proxy_chats" SET "closeReason" = 'ARCHIVED' WHERE "status" = 'ARCHIVED' AND "closedReason" IS NULL;

-- BackfillLastMessage: populate from latest message per chat
UPDATE "proxy_chats" pc SET
  "lastMessageAt" = sub."max_at",
  "lastMessageBy" = sub."sender"
FROM (
  SELECT DISTINCT ON ("proxyChatId")
    "proxyChatId",
    "createdAt" AS "max_at",
    "senderId" AS "sender"
  FROM "proxy_chat_messages"
  ORDER BY "proxyChatId", "createdAt" DESC
) sub
WHERE pc."id" = sub."proxyChatId";

-- DropOldColumns: remove legacy status and closedReason
DROP INDEX IF EXISTS "proxy_chats_status_idx";
ALTER TABLE "proxy_chats" DROP COLUMN "status";
ALTER TABLE "proxy_chats" DROP COLUMN "closedReason";

-- DropOldEnum
DROP TYPE "ProxyChatStatus";

-- CreateIndex: new state index
CREATE INDEX "proxy_chats_state_idx" ON "proxy_chats"("state");

-- AddColumns: proxy_chat_messages policy fields
ALTER TABLE "proxy_chat_messages" ADD COLUMN "policyDecision" "PolicyDecision";
ALTER TABLE "proxy_chat_messages" ADD COLUMN "policyReasons" TEXT[] DEFAULT '{}';
ALTER TABLE "proxy_chat_messages" ADD COLUMN "redactions" JSONB;
