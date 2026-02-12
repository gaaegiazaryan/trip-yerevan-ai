import { Injectable, Logger } from '@nestjs/common';

export interface NotificationTemplate {
  /** Unique template key, e.g. "booking.created.agent" */
  key: string;
  /** Template body with {{variable}} placeholders */
  body: string;
  /** Optional inline keyboard buttons with {{variable}} support */
  buttons?: { label: string; callbackData: string }[];
}

export interface RenderedNotification {
  templateKey: string;
  text: string;
  buttons?: { label: string; callbackData: string }[];
}

@Injectable()
export class NotificationTemplateEngine {
  private readonly logger = new Logger(NotificationTemplateEngine.name);
  private readonly templates = new Map<string, NotificationTemplate>();

  register(template: NotificationTemplate): void {
    this.templates.set(template.key, template);
    this.logger.log(`[template-engine] Registered template "${template.key}"`);
  }

  registerAll(templates: NotificationTemplate[]): void {
    for (const t of templates) {
      this.register(t);
    }
  }

  render(
    templateKey: string,
    variables: Record<string, string | number>,
  ): RenderedNotification {
    const template = this.templates.get(templateKey);
    if (!template) {
      throw new Error(`Notification template "${templateKey}" not found`);
    }

    const text = this.interpolate(template.body, variables);

    const buttons = template.buttons?.map((btn) => ({
      label: this.interpolate(btn.label, variables),
      callbackData: this.interpolate(btn.callbackData, variables),
    }));

    return { templateKey, text, buttons };
  }

  has(templateKey: string): boolean {
    return this.templates.has(templateKey);
  }

  getRegisteredKeys(): string[] {
    return [...this.templates.keys()];
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
        `[template-engine] Missing variable "{{${key}}}" in template`,
      );
      return match;
    });
  }
}
