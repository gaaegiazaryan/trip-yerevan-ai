import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  SupportThread,
  SupportMessage,
  SupportThreadStatus,
} from '@prisma/client';

export interface ManagerNotification {
  text: string;
  buttons: { label: string; callbackData: string }[];
}

export interface SupportThreadWithUser extends SupportThread {
  user: { telegramId: bigint };
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private readonly managerChannelChatId: number | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('MANAGER_CHANNEL_CHAT_ID');
    this.managerChannelChatId = raw ? Number(raw) : null;
  }

  getManagerChannelChatId(): number | null {
    return this.managerChannelChatId;
  }

  /**
   * Creates a support thread for a user about an offer.
   * Reuses an existing OPEN thread for the same user+offer if one exists.
   */
  async createThread(
    userId: string,
    offerId: string,
  ): Promise<SupportThread> {
    // Reuse existing OPEN thread for same user+offer
    const existing = await this.prisma.supportThread.findFirst({
      where: {
        userId,
        offerId,
        status: SupportThreadStatus.OPEN,
      },
    });

    if (existing) {
      this.logger.log(
        `[support] action=reuse_thread, threadId=${existing.id}, userId=${userId}, offerId=${offerId}`,
      );
      return existing;
    }

    // Look up travelRequestId from offer
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { travelRequestId: true },
    });

    const thread = await this.prisma.supportThread.create({
      data: {
        userId,
        offerId,
        travelRequestId: offer?.travelRequestId ?? null,
      },
    });

    this.logger.log(
      `[support] action=create_thread, threadId=${thread.id}, userId=${userId}, offerId=${offerId}`,
    );

    return thread;
  }

  /**
   * Adds a message to a support thread.
   */
  async addMessage(
    threadId: string,
    senderUserId: string,
    content: string,
  ): Promise<SupportMessage> {
    return this.prisma.supportMessage.create({
      data: {
        threadId,
        senderUserId,
        content,
      },
    });
  }

  /**
   * Marks a thread as REPLIED after a manager responds.
   */
  async markReplied(threadId: string): Promise<void> {
    await this.prisma.supportThread.update({
      where: { id: threadId },
      data: { status: SupportThreadStatus.REPLIED },
    });
  }

  /**
   * Loads a thread with its user relation (for getting traveler's telegramId).
   */
  async getThread(threadId: string): Promise<SupportThreadWithUser | null> {
    return this.prisma.supportThread.findUnique({
      where: { id: threadId },
      include: { user: { select: { telegramId: true } } },
    });
  }

  /**
   * Builds the manager channel notification for a new support question.
   */
  buildManagerNotification(
    thread: SupportThread,
    question: string,
  ): ManagerNotification {
    const text =
      `\ud83c\udd98 *New Support Question*\n\n` +
      `Thread: \`${thread.id}\`\n` +
      (thread.offerId ? `Offer: \`${thread.offerId}\`\n` : '') +
      `\n` +
      `*Question:*\n${this.escapeMarkdown(question)}`;

    return {
      text,
      buttons: [
        {
          label: '\u21a9 Reply',
          callbackData: `support:reply:${thread.id}`,
        },
      ],
    };
  }

  /**
   * Builds the message text sent to the traveler when a manager replies.
   */
  buildTravelerReplyNotification(replyText: string): string {
    return (
      `\ud83d\udce9 *Manager Response*\n\n` +
      this.escapeMarkdown(replyText)
    );
  }

  private escapeMarkdown(text: string): string {
    // Escape characters that conflict with Telegram MarkdownV1
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }
}
