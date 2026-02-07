import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DistributionModule } from '../distribution/distribution.module';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './providers/ai-provider.token';
import { aiProviderFactory } from './providers/ai-provider.factory';
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
  SlotEditDetectionService,
  AiEngineService,
} from './services';

@Module({
  imports: [forwardRef(() => DistributionModule)],
  providers: [
    AiService,
    {
      provide: AI_PROVIDER,
      useFactory: (configService: ConfigService) =>
        aiProviderFactory(configService),
      inject: [ConfigService],
    },
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
    SlotEditDetectionService,
    AiEngineService,
  ],
  exports: [AiService, AiEngineService],
})
export class AiModule {}
