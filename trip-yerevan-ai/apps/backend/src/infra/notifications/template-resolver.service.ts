import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationTemplateEngine,
  RenderedNotification,
} from './notification-template.engine';

export interface ResolvedTemplate {
  rendered: RenderedNotification;
  version: string | null;
  snapshot: string;
  policyVersion: string | null;
  source: 'db' | 'code';
}

@Injectable()
export class TemplateResolverService {
  private readonly logger = new Logger(TemplateResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: NotificationTemplateEngine,
  ) {}

  /**
   * Resolve a template by key and channel.
   * 1. Look for an active DB template (templateKey + channel + isActive=true)
   * 2. Fall back to in-code template registry
   * 3. Throw if neither exists
   */
  async resolve(
    templateKey: string,
    channel: NotificationChannel,
    variables: Record<string, string | number>,
  ): Promise<ResolvedTemplate> {
    // 1. Try DB-first
    const dbTemplate = await this.prisma.notificationTemplate.findFirst({
      where: {
        templateKey,
        channel,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (dbTemplate) {
      const text = this.interpolate(dbTemplate.body, variables);
      const rawButtons = dbTemplate.buttons as
        | { label: string; callbackData: string }[]
        | null;
      const buttons = rawButtons?.map((btn) => ({
        label: this.interpolate(btn.label, variables),
        callbackData: this.interpolate(btn.callbackData, variables),
      }));

      this.logger.debug(
        `[template-resolver] Resolved "${templateKey}" from DB, version=${dbTemplate.version}`,
      );

      return {
        rendered: { templateKey, text, buttons },
        version: dbTemplate.version,
        snapshot: dbTemplate.body,
        policyVersion: dbTemplate.policyVersion,
        source: 'db',
      };
    }

    // 2. Fallback to in-code registry
    if (!this.templateEngine.has(templateKey)) {
      throw new Error(
        `Template "${templateKey}" not found in DB or code registry`,
      );
    }

    const rendered = this.templateEngine.render(templateKey, variables);

    this.logger.debug(
      `[template-resolver] Resolved "${templateKey}" from code registry (fallback)`,
    );

    return {
      rendered,
      version: null,
      snapshot: rendered.text,
      policyVersion: null,
      source: 'code',
    };
  }

  /**
   * Preview a template with given variables (for admin preview endpoint).
   * Does NOT persist anything — just renders and returns.
   */
  preview(
    body: string,
    variables: Record<string, string | number>,
    buttons?: { label: string; callbackData: string }[],
  ): { text: string; buttons?: { label: string; callbackData: string }[] } {
    const text = this.interpolate(body, variables);
    const renderedButtons = buttons?.map((btn) => ({
      label: this.interpolate(btn.label, variables),
      callbackData: this.interpolate(btn.callbackData, variables),
    }));
    return { text, buttons: renderedButtons };
  }

  private interpolate(
    text: string,
    variables: Record<string, string | number>,
  ): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (key in variables) {
        return String(variables[key]);
      }
      this.logger.warn(
        `[template-resolver] Missing variable "{{${key}}}" in template`,
      );
      return match;
    });
  }
}
