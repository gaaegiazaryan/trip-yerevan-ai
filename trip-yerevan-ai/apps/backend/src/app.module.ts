import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// Infrastructure
import { PrismaModule } from './infra/prisma/prisma.module';
import { QueueModule } from './infra/queue/queue.module';
import { LoggerModule } from './infra/logger/logger.module';

// Domain modules
import { UsersModule } from './modules/users/users.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { TravelRequestsModule } from './modules/travel-requests/travel-requests.module';
import { OffersModule } from './modules/offers/offers.module';
import { ProxyChatModule } from './modules/proxy-chat/proxy-chat.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { AiModule } from './modules/ai/ai.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({ isGlobal: true }),

    // Infrastructure
    PrismaModule,
    QueueModule,
    LoggerModule,

    // Domain
    UsersModule,
    AgenciesModule,
    TravelRequestsModule,
    OffersModule,
    ProxyChatModule,
    BookingsModule,
    AiModule,
    TelegramModule,
  ],
})
export class AppModule {}
