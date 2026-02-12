-- AlterTable: add reliable delivery fields to notification_logs
ALTER TABLE "notification_logs" ADD COLUMN "recipientChatId" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notification_logs" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notification_logs" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "notification_logs" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "notification_logs" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterColumn: recipientId no longer UUID (manager-channel is not a UUID)
ALTER TABLE "notification_logs" ALTER COLUMN "recipientId" TYPE TEXT;

-- Backfill idempotencyKey for existing rows (use id as fallback)
UPDATE "notification_logs" SET "idempotencyKey" = id WHERE "idempotencyKey" IS NULL;

-- Make idempotencyKey NOT NULL and UNIQUE after backfill
ALTER TABLE "notification_logs" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_idempotencyKey_key" ON "notification_logs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "notification_logs_status_nextRetryAt_idx" ON "notification_logs"("status", "nextRetryAt");
