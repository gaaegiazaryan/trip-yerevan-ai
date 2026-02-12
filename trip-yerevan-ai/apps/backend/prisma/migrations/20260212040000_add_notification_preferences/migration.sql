-- CreateEnum: NotificationCategory
CREATE TYPE "NotificationCategory" AS ENUM ('CRITICAL', 'TRANSACTIONAL', 'MARKETING');

-- AlterEnum: NotificationChannel (add EMAIL, PUSH)
ALTER TYPE "NotificationChannel" ADD VALUE 'EMAIL';
ALTER TYPE "NotificationChannel" ADD VALUE 'PUSH';

-- AlterEnum: NotificationStatus (add SKIPPED)
ALTER TYPE "NotificationStatus" ADD VALUE 'SKIPPED';

-- AlterTable: notification_logs — add skipReason
ALTER TABLE "notification_logs" ADD COLUMN "skipReason" TEXT;

-- CreateTable: system_notification_policies
CREATE TABLE "system_notification_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "templateKey" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "allowedChannels" JSONB NOT NULL,
    "forceDeliver" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_notification_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "system_notification_policies_templateKey_key" ON "system_notification_policies"("templateKey");
CREATE INDEX "system_notification_policies_category_idx" ON "system_notification_policies"("category");

-- CreateTable: role_notification_defaults
CREATE TABLE "role_notification_defaults" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "UserRole" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_notification_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_notification_defaults_role_category_channel_key" ON "role_notification_defaults"("role", "category", "channel");

-- CreateTable: user_notification_preferences
CREATE TABLE "user_notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_notification_preferences_userId_category_channel_key" ON "user_notification_preferences"("userId", "category", "channel");
CREATE INDEX "user_notification_preferences_userId_idx" ON "user_notification_preferences"("userId");

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==========================================================================
-- Seed: SystemNotificationPolicy for existing templateKeys
-- ==========================================================================
INSERT INTO "system_notification_policies" ("id", "templateKey", "category", "allowedChannels", "forceDeliver", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'booking.created.traveler',  'CRITICAL',       '["TELEGRAM"]', true,  NOW(), NOW()),
  (gen_random_uuid(), 'booking.created.agent',     'CRITICAL',       '["TELEGRAM"]', true,  NOW(), NOW()),
  (gen_random_uuid(), 'booking.created.manager',   'CRITICAL',       '["TELEGRAM"]', true,  NOW(), NOW());

-- ==========================================================================
-- Seed: RoleNotificationDefault
-- ==========================================================================
-- TRAVELER defaults
INSERT INTO "role_notification_defaults" ("id", "role", "category", "channel", "enabled", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'TRAVELER', 'CRITICAL',       'TELEGRAM', true,  NOW(), NOW()),
  (gen_random_uuid(), 'TRAVELER', 'TRANSACTIONAL',  'TELEGRAM', true,  NOW(), NOW()),
  (gen_random_uuid(), 'TRAVELER', 'MARKETING',      'TELEGRAM', false, NOW(), NOW());

-- MANAGER defaults
INSERT INTO "role_notification_defaults" ("id", "role", "category", "channel", "enabled", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'MANAGER', 'CRITICAL',       'TELEGRAM', true, NOW(), NOW()),
  (gen_random_uuid(), 'MANAGER', 'TRANSACTIONAL',  'TELEGRAM', true, NOW(), NOW()),
  (gen_random_uuid(), 'MANAGER', 'MARKETING',      'TELEGRAM', true, NOW(), NOW());

-- ADMIN defaults
INSERT INTO "role_notification_defaults" ("id", "role", "category", "channel", "enabled", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'ADMIN', 'CRITICAL',       'TELEGRAM', true, NOW(), NOW()),
  (gen_random_uuid(), 'ADMIN', 'TRANSACTIONAL',  'TELEGRAM', true, NOW(), NOW()),
  (gen_random_uuid(), 'ADMIN', 'MARKETING',      'TELEGRAM', true, NOW(), NOW());
