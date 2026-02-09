import { Injectable } from '@nestjs/common';
import { MessageSenderType, ProxyChatStatus } from '@prisma/client';

export interface PermissionCheckResult {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
}

@Injectable()
export class ChatPermissionService {
  check(
    status: ProxyChatStatus,
    senderType: MessageSenderType,
    isManager: boolean,
  ): PermissionCheckResult {
    // CLOSED and ARCHIVED — nobody can send
    if (
      status === ProxyChatStatus.CLOSED ||
      status === ProxyChatStatus.ARCHIVED
    ) {
      return { allowed: false, flagged: false, reason: 'Chat is closed.' };
    }

    // OPEN — user and agency allowed, no flagging
    if (status === ProxyChatStatus.OPEN) {
      if (
        senderType === MessageSenderType.USER ||
        senderType === MessageSenderType.AGENCY
      ) {
        return { allowed: true, flagged: false };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    // BOOKED — user and agency allowed but flagged (manager may be watching soon)
    if (status === ProxyChatStatus.BOOKED) {
      if (
        senderType === MessageSenderType.USER ||
        senderType === MessageSenderType.AGENCY
      ) {
        return { allowed: true, flagged: true };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    // MANAGER_ASSIGNED — user allowed, agency blocked (read-only), manager allowed
    if (status === ProxyChatStatus.MANAGER_ASSIGNED) {
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

    // COMPLETED — all allowed but flagged
    if (status === ProxyChatStatus.COMPLETED) {
      if (
        senderType === MessageSenderType.USER ||
        senderType === MessageSenderType.AGENCY ||
        isManager
      ) {
        return { allowed: true, flagged: true };
      }
      return { allowed: false, flagged: false, reason: 'Not a participant.' };
    }

    return { allowed: false, flagged: false, reason: 'Unknown chat status.' };
  }
}
