-- Rename ACTIVE → OPEN in ProxyChatStatus enum
ALTER TYPE "ProxyChatStatus" RENAME VALUE 'ACTIVE' TO 'OPEN';

-- Add new status values
ALTER TYPE "ProxyChatStatus" ADD VALUE IF NOT EXISTS 'BOOKED';
ALTER TYPE "ProxyChatStatus" ADD VALUE IF NOT EXISTS 'MANAGER_ASSIGNED';
ALTER TYPE "ProxyChatStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- Add new columns to proxy_chats
ALTER TABLE "proxy_chats" ADD COLUMN "closedReason" TEXT;
ALTER TABLE "proxy_chats" ADD COLUMN "managerId" UUID;

-- Foreign key for manager
ALTER TABLE "proxy_chats" ADD CONSTRAINT "proxy_chats_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "proxy_chats_status_idx" ON "proxy_chats"("status");
CREATE INDEX "proxy_chats_managerId_idx" ON "proxy_chats"("managerId");

-- ChatAuditLog table
CREATE TABLE "chat_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "proxyChatId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" UUID,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_audit_logs_pkey" PRIMARY KEY ("id")
);

-- ChatAuditLog indexes
CREATE INDEX "chat_audit_logs_proxyChatId_createdAt_idx" ON "chat_audit_logs"("proxyChatId", "createdAt");
CREATE INDEX "chat_audit_logs_eventType_idx" ON "chat_audit_logs"("eventType");

-- ChatAuditLog foreign key
ALTER TABLE "chat_audit_logs" ADD CONSTRAINT "chat_audit_logs_proxyChatId_fkey"
  FOREIGN KEY ("proxyChatId") REFERENCES "proxy_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
