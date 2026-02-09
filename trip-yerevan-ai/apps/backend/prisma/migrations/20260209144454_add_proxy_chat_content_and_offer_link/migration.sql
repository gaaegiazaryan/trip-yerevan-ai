-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'PHOTO', 'DOCUMENT');

-- AlterTable
ALTER TABLE "proxy_chat_messages" ADD COLUMN     "contentType" "MessageContentType" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "telegramFileId" TEXT;

-- AlterTable
ALTER TABLE "proxy_chats" ADD COLUMN     "offerId" UUID;

-- AddForeignKey
ALTER TABLE "proxy_chats" ADD CONSTRAINT "proxy_chats_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
