export { NotificationService } from './notification.service';
export type {
  SendNotificationRequest,
  EnqueueResult,
} from './notification.service';
export { NotificationTemplateEngine } from './notification-template.engine';
export type {
  NotificationTemplate,
  RenderedNotification,
} from './notification-template.engine';
export { TemplateResolverService } from './template-resolver.service';
export type { ResolvedTemplate } from './template-resolver.service';
export { NotificationPreferenceResolver } from './notification-preference.resolver';
export type {
  NotificationChannelProvider,
  SendResult,
} from './notification-channel.provider';
export { NOTIFICATION_CHANNELS } from './notification-channel.provider';
export { TelegramChannelProvider } from './telegram-channel.provider';
export { NotificationDeliveryProcessor } from './notification-delivery.processor';
export type { DeliveryJobData } from './notification-delivery.processor';
export { NotificationsModule } from './notifications.module';
export {
  NOTIFICATION_QUEUE,
  NOTIFICATION_DELIVERY_JOB,
  MAX_DELIVERY_ATTEMPTS,
  BACKOFF_DELAYS_SEC,
} from './notification.constants';
