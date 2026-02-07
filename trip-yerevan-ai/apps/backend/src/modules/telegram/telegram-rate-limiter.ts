import { Injectable } from '@nestjs/common';

const MAX_MESSAGES = 5;
const WINDOW_MS = 5000;

@Injectable()
export class TelegramRateLimiter {
  private readonly timestamps = new Map<bigint, number[]>();

  isRateLimited(telegramId: bigint): boolean {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    let userTimestamps = this.timestamps.get(telegramId);
    if (!userTimestamps) {
      userTimestamps = [];
      this.timestamps.set(telegramId, userTimestamps);
    }

    const filtered = userTimestamps.filter((ts) => ts > cutoff);
    this.timestamps.set(telegramId, filtered);

    if (filtered.length >= MAX_MESSAGES) {
      return true;
    }

    filtered.push(now);
    return false;
  }

  cleanup(): void {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    for (const [telegramId, timestamps] of this.timestamps) {
      const filtered = timestamps.filter((ts) => ts > cutoff);
      if (filtered.length === 0) {
        this.timestamps.delete(telegramId);
      } else {
        this.timestamps.set(telegramId, filtered);
      }
    }
  }
}
