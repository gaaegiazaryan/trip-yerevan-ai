import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { AdminService } from './admin.service';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminMeetingsController } from './admin-meetings.controller';
import { AdminCalendarController } from './admin-calendar.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAgenciesController } from './admin-agencies.controller';
import { AdminTravelersController } from './admin-travelers.controller';
import { AdminNotesController } from './admin-notes.controller';
import { AdminRiskController } from './admin-risk.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminTemplatesController } from './admin-templates.controller';
import { AdminNotificationPoliciesController } from './admin-notification-policies.controller';

@Module({
  imports: [BookingsModule],
  controllers: [
    AdminBookingsController,
    AdminMeetingsController,
    AdminCalendarController,
    AdminAnalyticsController,
    AdminAgenciesController,
    AdminTravelersController,
    AdminNotesController,
    AdminRiskController,
    AdminNotificationsController,
    AdminTemplatesController,
    AdminNotificationPoliciesController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
