import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { BaseAiProvider } from './base-ai.provider';
import { AIProviderMessage, AIProviderResponse } from '../types';

export class OpenAiProvider extends BaseAiProvider {
  protected readonly logger = new Logger(OpenAiProvider.name);
  protected readonly providerName = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4.1') {
    super();
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  protected async callApi(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: AIProviderMessage[],
  ): Promise<AIProviderResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content ?? '{}';
    const usage = completion.usage;
    const tokensUsed = usage?.total_tokens ?? 0;

    this.logger.log(
      `[OpenAI] tokens: prompt=${usage?.prompt_tokens ?? 0}, ` +
        `completion=${usage?.completion_tokens ?? 0}, total=${tokensUsed}`,
    );

    return {
      content,
      tokensUsed,
      model: completion.model,
    };
  }
}
