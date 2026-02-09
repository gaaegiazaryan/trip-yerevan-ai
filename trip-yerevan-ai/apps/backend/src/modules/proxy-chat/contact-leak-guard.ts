import { Injectable } from '@nestjs/common';

export interface LeakCheckResult {
  blocked: boolean;
  violations: string[];
  warningMessage: string | null;
}

const WARNINGS: Record<string, Record<string, string>> = {
  RU: {
    blocked:
      'Сообщение заблокировано: обмен контактными данными запрещён до завершения бронирования. Пожалуйста, общайтесь через платформу.',
  },
  EN: {
    blocked:
      'Message blocked: sharing contact information is not allowed until the booking is finalized. Please communicate through the platform.',
  },
  AM: {
    blocked:
      'Message blocked: sharing contact information is not allowed until the booking is finalized. Please communicate through the platform.',
  },
};

// Date pattern to strip before phone detection (dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd etc.)
const DATE_PATTERN = /\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}/g;

// Phone: sequences with 7+ digits (after stripping non-digit separators)
const PHONE_PATTERN = /(?:\+?\d[\d\s\-().]{5,}\d)/g;

// Email
const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i;

// @username (Telegram-style)
const USERNAME_PATTERN = /(?<!\S)@[a-zA-Z]\w{3,}/;

// URLs (http/https/www)
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

// WhatsApp mentions
const WHATSAPP_PATTERN = /(?:whatsapp|вацап|ватсап|вотсап|wa\.me)/i;

// Social handles / platform mentions
const SOCIAL_PATTERN =
  /(?:instagram|инстаграм|viber|вайбер|facebook|фейсбук|telegram|телеграм|signal|сигнал|vk\.com|вконтакте)/i;

function countDigits(s: string): number {
  return (s.match(/\d/g) || []).length;
}

@Injectable()
export class ContactLeakGuard {
  check(content: string, language: 'RU' | 'EN' | 'AM' = 'RU'): LeakCheckResult {
    const violations: string[] = [];

    // Phone numbers — strip dates first, then require 7+ digits
    const contentWithoutDates = content.replace(DATE_PATTERN, ' ');
    const phoneMatches = contentWithoutDates.match(PHONE_PATTERN) || [];
    for (const match of phoneMatches) {
      if (countDigits(match) >= 7) {
        violations.push('phone_number');
        break;
      }
    }

    if (EMAIL_PATTERN.test(content)) {
      violations.push('email');
    }

    if (USERNAME_PATTERN.test(content)) {
      violations.push('username');
    }

    if (URL_PATTERN.test(content)) {
      violations.push('url');
    }

    if (WHATSAPP_PATTERN.test(content)) {
      violations.push('whatsapp');
    }

    if (SOCIAL_PATTERN.test(content)) {
      violations.push('social_handle');
    }

    const blocked = violations.length > 0;
    const lang = language === 'AM' ? 'AM' : language === 'EN' ? 'EN' : 'RU';
    const warningMessage = blocked
      ? (WARNINGS[lang]?.blocked ?? WARNINGS.EN.blocked)
      : null;

    return { blocked, violations, warningMessage };
  }
}
