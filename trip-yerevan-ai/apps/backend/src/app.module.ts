import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Infrastructure
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { CacheModule } from './infra/cache/cache.module';
import { LoggerModule } from './infra/logger/logger.module';

// Platform modules
import { HealthModule } from './modules/health/health.module';

// Domain modules
import { UsersModule } from './modules/users/users.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { TravelRequestsModule } from './modules/travel-requests/travel-requests.module';
import { OffersModule } from './modules/offers/offers.module';
import { ProxyChatModule } from './modules/proxy-chat/proxy-chat.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { AiModule } from './modules/ai/ai.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { AdminModule } from './modules/admin/admin.module';
import { RiskModule } from './modules/risk/risk.module';

// Middleware
import { DevAuthMiddleware } from './common/middleware/dev-auth.middleware';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Infrastructure
    PrismaModule,
    QueueModule,
    CacheModule,
    LoggerModule,

    // Platform
    HealthModule,

    // Domain
    UsersModule,
    AgenciesModule,
    TravelRequestsModule,
    OffersModule,
    ProxyChatModule,
    BookingsModule,
    DistributionModule,
    AiModule,
    TelegramModule,
    AdminModule,
    RiskModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DevAuthMiddleware).forRoutes('admin/*path');
  }
}
