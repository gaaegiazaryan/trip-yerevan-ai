-- AlterTable: Add template versioning fields to notification_logs
ALTER TABLE "notification_logs" ADD COLUMN "templateVersion" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN "templateSnapshot" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN "policyVersion" TEXT;

-- CreateTable: notification_templates
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "templateKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "buttons" JSONB,
    "variables" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "policyVersion" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_templateKey_version_channel_key" ON "notification_templates"("templateKey", "version", "channel");
CREATE INDEX "notification_templates_templateKey_channel_isActive_idx" ON "notification_templates"("templateKey", "channel", "isActive");

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
