import { Keyboard } from 'grammy';
import {
  KB_EXIT_CHAT,
  KB_BOOKING_DETAILS,
  KB_CHAT_DETAILS,
  KB_CONTACT_MANAGER,
} from './proxy-chat.constants';

/**
 * Persistent reply keyboard for a traveler in chat mode.
 *   [ Booking details ] [ Contact manager ]
 *   [ Exit chat ]
 */
export function buildTravelerKeyboard(): Keyboard {
  return new Keyboard()
    .text(KB_BOOKING_DETAILS)
    .text(KB_CONTACT_MANAGER)
    .row()
    .text(KB_EXIT_CHAT)
    .resized();
}

/**
 * Persistent reply keyboard for an agency agent in chat mode.
 *   [ Chat details ]
 *   [ Exit chat ]
 */
export function buildAgencyKeyboard(): Keyboard {
  return new Keyboard()
    .text(KB_CHAT_DETAILS)
    .row()
    .text(KB_EXIT_CHAT)
    .resized();
}

/**
 * Persistent reply keyboard for a manager in chat mode.
 *   [ Exit chat ]
 */
export function buildManagerKeyboard(): Keyboard {
  return new Keyboard().text(KB_EXIT_CHAT).resized();
}
