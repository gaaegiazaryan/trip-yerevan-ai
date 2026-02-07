import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { BaseAiProvider } from './base-ai.provider';
import { AIProviderMessage, AIProviderResponse } from '../types';

export class AnthropicProvider extends BaseAiProvider {
  protected readonly logger = new Logger(AnthropicProvider.name);
  protected readonly providerName = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-5-20250929') {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  protected async callApi(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: AIProviderMessage[],
  ): Promise<AIProviderResponse> {
    const messages = this.buildMessages(conversationHistory, userMessage);

    this.logger.debug(
      `[Anthropic] Calling API: model=${this.model}, messagesCount=${messages.length}, ` +
        `systemPromptLen=${systemPrompt.length}`,
    );

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      temperature: 0.2,
      system: systemPrompt,
      messages,
    });

    const content = this.extractTextContent(response);
    const tokensUsed =
      (response.usage?.input_tokens ?? 0) +
      (response.usage?.output_tokens ?? 0);

    this.logger.log(
      `[Anthropic] tokens: input=${response.usage?.input_tokens ?? 0}, ` +
        `output=${response.usage?.output_tokens ?? 0}, total=${tokensUsed}`,
    );

    if (!content || content.trim().length === 0) {
      this.logger.warn(
        `[Anthropic] Empty content response. stop_reason=${response.stop_reason}, ` +
          `contentBlocks=${response.content.length}, ` +
          `types=[${response.content.map((b) => b.type).join(',')}]`,
      );
    }

    return {
      content,
      tokensUsed,
      model: response.model,
    };
  }

  /**
   * Build Anthropic-compatible messages array.
   * System messages are stripped (sent via the `system` param).
   * Consecutive same-role messages are merged to satisfy alternation.
   */
  private buildMessages(
    history: AIProviderMessage[],
    userMessage: string,
  ): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of history) {
      if (msg.role === 'system') continue;
      const role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';

      if (messages.length > 0 && messages[messages.length - 1].role === role) {
        const last = messages[messages.length - 1];
        last.content = `${last.content as string}\n\n${msg.content}`;
      } else {
        messages.push({ role, content: msg.content });
      }
    }

    // Append current user message
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      const last = messages[messages.length - 1];
      last.content = `${last.content as string}\n\n${userMessage}`;
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    return messages;
  }

  private extractTextContent(response: Anthropic.Message): string {
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}
