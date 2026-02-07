import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
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
  DraftValidationService,
  DraftToRequestService,
  AiEngineService,
} from './services';

@Module({
  imports: [DistributionModule],
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
    DraftValidationService,
    DraftToRequestService,
    AiEngineService,
  ],
  exports: [AiService, AiEngineService],
})
export class AiModule {}
