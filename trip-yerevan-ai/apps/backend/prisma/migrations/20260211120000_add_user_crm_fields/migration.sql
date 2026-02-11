-- AlterTable
ALTER TABLE "users" ADD COLUMN "vip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "blacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "blacklistReason" TEXT;
