import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './providers/ai-provider.token';
import { MockAiProvider } from './providers/mock-ai.provider';
import {
  LanguageService,
  SlotFillingService,
  DraftMergeService,
  ConversationStateService,
  ClarificationService,
  AiParsingService,
  ResponseGeneratorService,
  FeedbackService,
  AiEngineService,
} from './services';

@Module({
  providers: [
    AiService,
    { provide: AI_PROVIDER, useClass: MockAiProvider },
    LanguageService,
    SlotFillingService,
    DraftMergeService,
    ConversationStateService,
    ClarificationService,
    AiParsingService,
    ResponseGeneratorService,
    FeedbackService,
    AiEngineService,
  ],
  exports: [AiService, AiEngineService],
})
export class AiModule {}
