import { NotificationTemplate } from '../notification-template.engine';

export const BOOKING_TEMPLATES: NotificationTemplate[] = [
  {
    key: 'booking.created.traveler',
    body:
      '\u2705 *Booking Created!*\n\n' +
      '*Agency:* {{agencyName}}\n' +
      '*Destination:* {{destination}}\n' +
      '*Price:* {{price}} {{currency}}\n' +
      '*Booking ID:* {{shortBookingId}}...\n\n' +
      'The agency has been notified and will confirm your booking shortly.',
  },
  {
    key: 'booking.created.agent',
    body:
      '\u2705 *Offer Accepted!*\n\n' +
      '*Destination:* {{destination}}\n' +
      '*Price:* {{price}} {{currency}}\n' +
      '*Booking ID:* {{shortBookingId}}...\n\n' +
      'The traveler has accepted your offer. Please prepare the booking confirmation.',
  },
  {
    key: 'booking.created.manager',
    body:
      '\ud83d\udcdd *New Booking!*\n\n' +
      '*Destination:* {{destination}}\n' +
      '*Agency:* {{agencyName}}\n' +
      '*Price:* {{price}} {{currency}}\n' +
      '*Booking ID:* {{shortBookingId}}...',
  },
];
