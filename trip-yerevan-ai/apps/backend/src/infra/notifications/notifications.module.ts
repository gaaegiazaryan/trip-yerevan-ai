import { Global, Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationTemplateEngine } from './notification-template.engine';
import { TemplateResolverService } from './template-resolver.service';
import { NotificationPreferenceResolver } from './notification-preference.resolver';
import { NotificationService } from './notification.service';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { TelegramChannelProvider } from './telegram-channel.provider';
import { TelegramModule } from '../../modules/telegram/telegram.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationChannelProvider } from './notification-channel.provider';
import {
  NOTIFICATION_QUEUE,
  MAX_DELIVERY_ATTEMPTS,
} from './notification.constants';

@Global()
@Module({
  imports: [
    forwardRef(() => TelegramModule),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE,
      defaultJobOptions: {
        attempts: MAX_DELIVERY_ATTEMPTS,
        backoff: {
          type: 'custom',
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    }),
  ],
  providers: [
    NotificationTemplateEngine,
    TemplateResolverService,
    NotificationPreferenceResolver,
    TelegramChannelProvider,
    NotificationService,
    {
      provide: NotificationDeliveryProcessor,
      useFactory: (
        prisma: PrismaService,
        templateResolver: TemplateResolverService,
        telegramChannel: TelegramChannelProvider,
      ) => {
        const providers: NotificationChannelProvider[] = [telegramChannel];
        return new NotificationDeliveryProcessor(
          prisma,
          templateResolver,
          providers,
        );
      },
      inject: [PrismaService, TemplateResolverService, TelegramChannelProvider],
    },
  ],
  exports: [NotificationService, NotificationTemplateEngine, TemplateResolverService, NotificationPreferenceResolver],
})
export class NotificationsModule {}
