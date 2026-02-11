import { Injectable } from '@nestjs/common';
import { MessageSenderType, ProxyChatState } from '@prisma/client';

export interface PermissionCheckResult {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
}

@Injectable()
export class ChatPermissionService {
  check(
    state: ProxyChatState,
    senderType: MessageSenderType,
    isManager: boolean,
  ): PermissionCheckResult {
    // CLOSED — nobody can send
    if (state === ProxyChatState.CLOSED) {
      return { allowed: false, flagged: false, reason: 'Chat is closed.' };
    }

    // OPEN — user and agency allowed, no flagging
    if (state === ProxyChatState.OPEN) {
      if (
        senderType === MessageSenderType.USER ||
        senderType === MessageSenderType.AGENCY
      ) {
        return { allowed: true, flagged: false };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    // REPLY_ONLY — user and agency allowed but flagged
    if (state === ProxyChatState.REPLY_ONLY) {
      if (
        senderType === MessageSenderType.USER ||
        senderType === MessageSenderType.AGENCY
      ) {
        return { allowed: true, flagged: true };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    // PAUSED — user and agency allowed but flagged (manager may join soon)
    if (state === ProxyChatState.PAUSED) {
      if (
        senderType === MessageSenderType.USER ||
        senderType === MessageSenderType.AGENCY
      ) {
        return { allowed: true, flagged: true };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    // ESCALATED — user allowed, agency blocked (read-only), manager allowed
    if (state === ProxyChatState.ESCALATED) {
      if (isManager) {
        return { allowed: true, flagged: false };
      }
      if (senderType === MessageSenderType.USER) {
        return { allowed: true, flagged: false };
      }
      if (senderType === MessageSenderType.AGENCY) {
        return {
          allowed: false,
          flagged: false,
          reason: 'A manager has taken over this chat. Agency messaging is read-only.',
        };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    return { allowed: false, flagged: false, reason: 'Unknown chat state.' };
  }
}
