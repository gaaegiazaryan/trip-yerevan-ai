import { Module } from '@nestjs/common';
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
  AiEngineService,
} from './services';

@Module({
  imports: [DistributionModule],
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
    AiEngineService,
  ],
  exports: [AiService, AiEngineService],
})
export class AiModule {}
