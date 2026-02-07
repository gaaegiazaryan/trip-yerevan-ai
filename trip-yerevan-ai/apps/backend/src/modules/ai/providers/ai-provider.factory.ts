import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProviderInterface } from '../types';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAiProvider } from './openai.provider';
import { MockAiProvider } from './mock-ai.provider';

const logger = new Logger('AiProviderFactory');

/**
 * Factory for NestJS DI. Selects provider based on configured API keys.
 * Priority: Anthropic > OpenAI > Mock fallback.
 *
 * If a real provider fails to initialize, falls back to the next option.
 * The application NEVER crashes due to provider initialization failure.
 */
export function aiProviderFactory(
  configService: ConfigService,
): AIProviderInterface {
  const anthropicKey = configService.get<string>('ANTHROPIC_API_KEY');
  const openaiKey = configService.get<string>('OPENAI_API_KEY');

  // Priority 1: Anthropic
  if (anthropicKey?.trim()) {
    try {
      const provider = new AnthropicProvider(anthropicKey.trim());
      logger.log('[AI] Using AnthropicProvider (claude-sonnet-4-5-20250929)');
      return provider;
    } catch (error) {
      logger.error(
        `[AI] AnthropicProvider init failed, trying next: ${error}`,
      );
    }
  }

  // Priority 2: OpenAI
  if (openaiKey?.trim()) {
    try {
      const provider = new OpenAiProvider(openaiKey.trim());
      logger.log('[AI] Using OpenAiProvider (gpt-4.1)');
      return provider;
    } catch (error) {
      logger.error(`[AI] OpenAiProvider init failed, falling back to Mock: ${error}`);
    }
  }

  // Fallback: Mock
  logger.warn(
    '[AI] Using MockAiProvider (no valid API keys configured). ' +
      'Set ANTHROPIC_API_KEY or OPENAI_API_KEY for real AI.',
  );
  return new MockAiProvider();
}
