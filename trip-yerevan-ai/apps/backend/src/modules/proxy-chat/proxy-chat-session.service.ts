import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ProxyChatService } from './proxy-chat.service';
import { ContactLeakGuard } from './contact-leak-guard';
import { ChatPermissionService } from './chat-permission.service';
import { ChatAuditLogService, ChatAuditEvent } from './chat-audit-log.service';
import {
  MessageContentType,
  MessageSenderType,
  ProxyChatStatus,
} from '@prisma/client';

export interface ProxyChatSession {
  proxyChatId: string;
  senderType: MessageSenderType;
  senderId: string;
  offerId: string;
  travelRequestId: string;
  /** Telegram chat IDs to forward messages to */
  counterpartChatIds: number[];
  /** Label prefix for forwarded messages (e.g. "Traveler", "Agency") */
  senderLabel: string;
  /** Current chat status for permission checks */
  chatStatus: ProxyChatStatus;
  /** Whether this session is a manager session */
  isManager: boolean;
  /** Human-readable agency name for pinned chat header */
  agencyName: string;
  /** Message ID of the pinned chat header (undefined until pinned) */
  pinnedMessageId?: number;
  /** Timestamp (Date.now()) of last activity — for session timeout */
  lastActivityAt: number;
}

export interface ForwardTarget {
  chatId: number;
  text: string;
  contentType: MessageContentType;
  telegramFileId?: string;
}

export interface HandleMessageResult {
  targets: ForwardTarget[];
  blocked?: boolean;
  warningMessage?: string;
}

export interface StartChatResult {
  text: string;
  buttons?: { label: string; callbackData: string }[];
  proxyChatId?: string;
}

@Injectable()
export class ProxyChatSessionService {
  private readonly logger = new Logger(ProxyChatSessionService.name);
  private readonly sessions = new Map<number, ProxyChatSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly proxyChatService: ProxyChatService,
    private readonly contactLeakGuard: ContactLeakGuard,
    private readonly chatPermission: ChatPermissionService,
    private readonly chatAuditLog: ChatAuditLogService,
  ) {}

  hasActiveSession(chatId: number): boolean {
    return this.sessions.has(chatId);
  }

  getSession(chatId: number): ProxyChatSession | undefined {
    return this.sessions.get(chatId);
  }

  exitSession(chatId: number): void {
    this.sessions.delete(chatId);
  }

  /** Update the pinned header message ID for a session. */
  setPinnedMessageId(chatId: number, messageId: number): void {
    const session = this.sessions.get(chatId);
    if (session) {
      session.pinnedMessageId = messageId;
    }
  }

  /** Touch session timestamp (called on every message / keyboard action). */
  touchSession(chatId: number): void {
    const session = this.sessions.get(chatId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /** Returns sessions whose lastActivityAt exceeds the timeout threshold. */
  getExpiredSessions(
    timeoutMs: number,
  ): { chatId: number; session: ProxyChatSession }[] {
    const now = Date.now();
    const expired: { chatId: number; session: ProxyChatSession }[] = [];
    for (const [chatId, session] of this.sessions) {
      if (now - session.lastActivityAt > timeoutMs) {
        expired.push({ chatId, session });
      }
    }
    return expired;
  }

  /**
   * Start a traveler chat session for asking a question about an offer.
   * Creates or reuses a ProxyChat, resolves agent Telegram IDs for forwarding.
   */
  async startTravelerChat(
    chatId: number,
    offerId: string,
    userId: string,
  ): Promise<StartChatResult> {
    // Load offer with agency + membership info
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        travelRequest: { select: { id: true, userId: true, destination: true } },
        agency: { select: { id: true, name: true, agencyTelegramChatId: true } },
        membership: {
          select: {
            user: { select: { id: true, telegramId: true } },
          },
        },
      },
    });

    if (!offer) {
      return { text: 'Offer not found.' };
    }

    if (offer.travelRequest.userId !== userId) {
      return { text: 'You are not authorized to ask about this offer.' };
    }

    // Create or reuse proxy chat
    let proxyChat = await this.proxyChatService.findByParticipants(
      offer.travelRequestId,
      userId,
      offer.agencyId,
    );

    if (proxyChat && proxyChat.status === ProxyChatStatus.CLOSED) {
      // Reopen closed chat
      proxyChat = await this.prisma.proxyChat.update({
        where: { id: proxyChat.id },
        data: { status: ProxyChatStatus.OPEN, closedAt: null, offerId },
      });
    } else if (!proxyChat) {
      proxyChat = await this.proxyChatService.create(
        offer.travelRequestId,
        userId,
        offer.agencyId,
        offerId,
      );
    }

    // Resolve forwarding targets: offer creator personal + agency group
    const counterpartChatIds: number[] = [];

    // Agent personal chat
    const agentTelegramId = Number(offer.membership.user.telegramId);
    counterpartChatIds.push(agentTelegramId);

    // Agency group chat (deduplicate if same as personal)
    if (
      offer.agency.agencyTelegramChatId &&
      Number(offer.agency.agencyTelegramChatId) !== agentTelegramId
    ) {
      counterpartChatIds.push(Number(offer.agency.agencyTelegramChatId));
    }

    this.sessions.set(chatId, {
      proxyChatId: proxyChat.id,
      senderType: MessageSenderType.USER,
      senderId: userId,
      offerId,
      travelRequestId: offer.travelRequestId,
      counterpartChatIds,
      senderLabel: 'Traveler',
      chatStatus: proxyChat.status,
      isManager: false,
      agencyName: offer.agency.name,
      lastActivityAt: Date.now(),
    });

    this.logger.log(
      `[proxy-chat] action=start_traveler, chatId=${chatId}, userId=${userId}, offerId=${offerId}, proxyChatId=${proxyChat.id}, targets=${counterpartChatIds.length}`,
    );

    const dest = offer.travelRequest.destination ?? 'your request';

    return {
      text:
        `You are now chatting about *${offer.agency.name}*'s offer for *${dest}*.\n\n` +
        `Type your question and it will be forwarded anonymously to the agency.`,
      proxyChatId: proxyChat.id,
    };
  }

  /**
   * Start an agency reply session when an agent clicks "Reply".
   */
  async startAgencyReply(
    chatId: number,
    proxyChatId: string,
    agentTelegramId: bigint,
  ): Promise<StartChatResult> {
    const proxyChat = await this.prisma.proxyChat.findUnique({
      where: { id: proxyChatId },
      include: {
        user: { select: { id: true, telegramId: true } },
        agency: {
          select: {
            id: true,
            name: true,
            memberships: {
              select: { userId: true, user: { select: { telegramId: true } } },
              where: { status: 'ACTIVE' },
            },
          },
        },
        offer: { select: { id: true } },
      },
    });

    if (!proxyChat) {
      return { text: 'Chat not found.' };
    }

    if (proxyChat.status === ProxyChatStatus.CLOSED) {
      return { text: 'This chat has been closed.' };
    }

    // Verify agent is a member of the agency
    const isMember = proxyChat.agency.memberships.some(
      (m) => m.user.telegramId === agentTelegramId,
    );
    if (!isMember) {
      return { text: 'You are not authorized to reply in this chat.' };
    }

    // Find the agent's userId
    const membership = proxyChat.agency.memberships.find(
      (m) => m.user.telegramId === agentTelegramId,
    );

    // Forward to traveler
    const travelerChatId = Number(proxyChat.user.telegramId);

    this.sessions.set(chatId, {
      proxyChatId: proxyChat.id,
      senderType: MessageSenderType.AGENCY,
      senderId: membership!.userId,
      offerId: proxyChat.offer?.id ?? '',
      travelRequestId: proxyChat.travelRequestId,
      counterpartChatIds: [travelerChatId],
      senderLabel: proxyChat.agency.name,
      chatStatus: proxyChat.status,
      isManager: false,
      agencyName: proxyChat.agency.name,
      lastActivityAt: Date.now(),
    });

    this.logger.log(
      `[proxy-chat] action=start_agency_reply, chatId=${chatId}, proxyChatId=${proxyChatId}, agentTelegramId=${agentTelegramId}`,
    );

    return {
      text:
        `You are now replying to a traveler's question.\n\n` +
        `Type your message and it will be forwarded anonymously.`,
      proxyChatId: proxyChat.id,
    };
  }

  /**
   * Start a manager chat session targeting the traveler.
   */
  async startManagerChat(
    chatId: number,
    proxyChatId: string,
    managerTelegramId: bigint,
  ): Promise<StartChatResult> {
    const proxyChat = await this.prisma.proxyChat.findUnique({
      where: { id: proxyChatId },
      include: {
        user: { select: { id: true, telegramId: true } },
        manager: { select: { id: true, telegramId: true } },
      },
    });

    if (!proxyChat) {
      return { text: 'Chat not found.' };
    }

    if (proxyChat.status === ProxyChatStatus.CLOSED) {
      return { text: 'This chat has been closed.' };
    }

    if (
      !proxyChat.manager ||
      proxyChat.manager.telegramId !== managerTelegramId
    ) {
      return { text: 'You are not authorized to manage this chat.' };
    }

    const travelerChatId = Number(proxyChat.user.telegramId);

    this.sessions.set(chatId, {
      proxyChatId: proxyChat.id,
      senderType: MessageSenderType.SYSTEM,
      senderId: proxyChat.manager.id,
      offerId: proxyChat.offerId ?? '',
      travelRequestId: proxyChat.travelRequestId,
      counterpartChatIds: [travelerChatId],
      senderLabel: 'Manager',
      chatStatus: proxyChat.status,
      isManager: true,
      agencyName: 'N/A',
      lastActivityAt: Date.now(),
    });

    this.logger.log(
      `[proxy-chat] action=start_manager_chat, chatId=${chatId}, proxyChatId=${proxyChatId}, managerTelegramId=${managerTelegramId}`,
    );

    return {
      text:
        `You are now chatting with the traveler as a manager.\n\n` +
        `Type your message and it will be forwarded.`,
      proxyChatId: proxyChat.id,
    };
  }

  /**
   * Start a traveler-to-manager chat session.
   */
  async startTravelerManagerChat(
    chatId: number,
    proxyChatId: string,
    userId: string,
  ): Promise<StartChatResult> {
    const proxyChat = await this.prisma.proxyChat.findUnique({
      where: { id: proxyChatId },
      include: {
        user: { select: { id: true } },
        manager: { select: { id: true, telegramId: true } },
      },
    });

    if (!proxyChat) {
      return { text: 'Chat not found.' };
    }

    if (proxyChat.user.id !== userId) {
      return { text: 'You are not authorized to use this chat.' };
    }

    if (!proxyChat.manager) {
      return { text: 'No manager assigned to this chat yet.' };
    }

    const managerChatId = Number(proxyChat.manager.telegramId);

    this.sessions.set(chatId, {
      proxyChatId: proxyChat.id,
      senderType: MessageSenderType.USER,
      senderId: userId,
      offerId: proxyChat.offerId ?? '',
      travelRequestId: proxyChat.travelRequestId,
      counterpartChatIds: [managerChatId],
      senderLabel: 'Traveler',
      chatStatus: proxyChat.status,
      isManager: false,
      agencyName: 'Manager Chat',
      lastActivityAt: Date.now(),
    });

    this.logger.log(
      `[proxy-chat] action=start_traveler_manager, chatId=${chatId}, proxyChatId=${proxyChatId}, userId=${userId}`,
    );

    return {
      text:
        `You are now chatting with your assigned manager.\n\n` +
        `Type your message and it will be forwarded.`,
      proxyChatId: proxyChat.id,
    };
  }

  /**
   * Handle an incoming text/photo/document message from an active session.
   * Checks permissions and contact leak before storing and forwarding.
   */
  async handleMessage(
    chatId: number,
    content: string,
    contentType: MessageContentType = MessageContentType.TEXT,
    telegramFileId?: string,
  ): Promise<HandleMessageResult> {
    const session = this.sessions.get(chatId);
    if (!session) return { targets: [] };

    // Check permissions
    const permission = this.chatPermission.check(
      session.chatStatus,
      session.senderType,
      session.isManager,
    );

    if (!permission.allowed) {
      return {
        targets: [],
        blocked: true,
        warningMessage: permission.reason ?? 'You cannot send messages in this chat.',
      };
    }

    // Check contact leak (only for text messages)
    if (contentType === MessageContentType.TEXT) {
      const leakCheck = this.contactLeakGuard.check(content);
      if (leakCheck.blocked) {
        await this.chatAuditLog.log(
          session.proxyChatId,
          ChatAuditEvent.CONTACT_LEAK_DETECTED,
          session.senderId,
          { violations: leakCheck.violations, content: content.substring(0, 200) },
        );

        return {
          targets: [],
          blocked: true,
          warningMessage: leakCheck.warningMessage!,
        };
      }
    }

    // Store in DB
    await this.proxyChatService.sendMessage(
      session.proxyChatId,
      session.senderType,
      session.senderId,
      content,
      contentType,
      telegramFileId,
    );

    const prefix =
      session.senderType === MessageSenderType.USER
        ? '\ud83d\udcac *Traveler:*'
        : session.isManager
          ? '\ud83d\udc64 *Manager:*'
          : `\ud83c\udfe2 *${session.senderLabel}:*`;

    const forwardText =
      contentType === MessageContentType.TEXT
        ? `${prefix}\n${content}`
        : `${prefix}\n[${contentType === MessageContentType.PHOTO ? 'Photo' : 'Document'}]`;

    // Build forward targets (deduplicated)
    const seen = new Set<number>();
    const targets: ForwardTarget[] = [];
    for (const targetChatId of session.counterpartChatIds) {
      if (seen.has(targetChatId)) continue;
      seen.add(targetChatId);
      targets.push({
        chatId: targetChatId,
        text: forwardText,
        contentType,
        telegramFileId,
      });
    }

    this.logger.log(
      `[proxy-chat] action=forward, from=${chatId}, proxyChatId=${session.proxyChatId}, type=${contentType}, targets=${targets.length}`,
    );

    return { targets };
  }

  /**
   * Close a proxy chat in DB and clear the session.
   */
  async closeChat(chatId: number, proxyChatId: string): Promise<void> {
    await this.proxyChatService.close(proxyChatId);
    this.sessions.delete(chatId);
    this.logger.log(
      `[proxy-chat] action=close, chatId=${chatId}, proxyChatId=${proxyChatId}`,
    );
  }
}
