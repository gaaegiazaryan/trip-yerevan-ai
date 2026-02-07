import { Logger } from '@nestjs/common';
import {
  AIProviderInterface,
  AIProviderMessage,
  AIProviderResponse,
  TravelDraft,
  SupportedLanguage,
} from '../types';
import { buildSystemPrompt } from './system-prompt';
import { InfrastructureException } from '../../../common/exceptions/domain.exception';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export abstract class BaseAiProvider implements AIProviderInterface {
  protected abstract readonly logger: Logger;
  protected abstract readonly providerName: string;
  protected readonly retryConfig: RetryConfig;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY, ...retryConfig };
  }

  async parseMessage(
    userMessage: string,
    conversationHistory: AIProviderMessage[],
    currentDraft: TravelDraft,
    language: SupportedLanguage,
  ): Promise<AIProviderResponse> {
    const systemPrompt = buildSystemPrompt(currentDraft, language);
    return this.executeWithRetry(() =>
      this.callApi(systemPrompt, userMessage, conversationHistory),
    );
  }

  protected abstract callApi(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: AIProviderMessage[],
  ): Promise<AIProviderResponse>;

  private async executeWithRetry(
    fn: () => Promise<AIProviderResponse>,
  ): Promise<AIProviderResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fn();
        this.logger.debug(
          `[${this.providerName}] Success (attempt ${attempt + 1}), ` +
            `tokens=${response.tokensUsed}, model=${response.model}`,
        );
        return response;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.isNonRetryable(error)) {
          this.logger.error(
            `[${this.providerName}] Non-retryable error: ${lastError.message}`,
          );
          break;
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateDelay(attempt);
          this.logger.warn(
            `[${this.providerName}] Attempt ${attempt + 1} failed, ` +
              `retrying in ${delay}ms: ${lastError.message}`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw new InfrastructureException(
      `All ${this.retryConfig.maxRetries + 1} attempts failed: ${lastError?.message}`,
      this.providerName,
      lastError,
    );
  }

  private isNonRetryable(error: unknown): boolean {
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status: number }).status;
      // 400 Bad Request, 401 Unauthorized, 403 Forbidden → not retryable
      // 429 Rate Limit → retryable
      // 5xx → retryable
      if (status >= 400 && status < 429) return true;
      if (status > 429 && status < 500) return true;
    }
    return false;
  }

  private calculateDelay(attempt: number): number {
    const exponential = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.retryConfig.baseDelayMs;
    return Math.min(exponential + jitter, this.retryConfig.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
