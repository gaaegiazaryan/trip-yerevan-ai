-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "conversationState" TEXT,
ADD COLUMN     "detectedLanguage" TEXT,
ADD COLUMN     "draftData" JSONB,
ADD COLUMN     "draftSnapshots" JSONB;

-- CreateTable
CREATE TABLE "ai_feedback_signals" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fieldName" TEXT,
    "originalValue" JSONB,
    "correctedValue" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_feedback_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_feedback_signals_conversationId_idx" ON "ai_feedback_signals"("conversationId");

-- CreateIndex
CREATE INDEX "ai_feedback_signals_type_idx" ON "ai_feedback_signals"("type");

-- AddForeignKey
ALTER TABLE "ai_feedback_signals" ADD CONSTRAINT "ai_feedback_signals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
