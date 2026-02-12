import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserNotificationPreferencesController } from './user-notification-preferences.controller';

@Module({
  controllers: [UsersController, UserNotificationPreferencesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
