import { Logger } from '@nestjs/common';
import { BaseAiProvider, RetryConfig } from '../base-ai.provider';
import { AIProviderMessage, AIProviderResponse, TravelDraft } from '../../types';
import { createEmptyDraft } from '../../types/travel-draft.interface';
import { InfrastructureException } from '../../../../common/exceptions/domain.exception';

class TestProvider extends BaseAiProvider {
  protected readonly logger = new Logger('TestProvider');
  protected readonly providerName = 'test';
  public callApiMock: jest.Mock;

  constructor(retryConfig?: Partial<RetryConfig>) {
    super(retryConfig);
    this.callApiMock = jest.fn();
  }

  protected callApi(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: AIProviderMessage[],
  ): Promise<AIProviderResponse> {
    return this.callApiMock(systemPrompt, userMessage, conversationHistory);
  }
}

describe('BaseAiProvider', () => {
  it('should succeed on first attempt', async () => {
    const provider = new TestProvider({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock.mockResolvedValue({
      content: '{}',
      tokensUsed: 100,
      model: 'test-model',
    });

    const result = await provider.parseMessage('hello', [], createEmptyDraft(), 'EN');
    expect(result.tokensUsed).toBe(100);
    expect(provider.callApiMock).toHaveBeenCalledTimes(1);
  });

  it('should retry on 500 errors and eventually succeed', async () => {
    const provider = new TestProvider({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock
      .mockRejectedValueOnce({ status: 500, message: 'Server Error' })
      .mockRejectedValueOnce({ status: 502, message: 'Bad Gateway' })
      .mockResolvedValue({ content: '{}', tokensUsed: 100, model: 'test-model' });

    const result = await provider.parseMessage('hello', [], createEmptyDraft(), 'EN');
    expect(result.tokensUsed).toBe(100);
    expect(provider.callApiMock).toHaveBeenCalledTimes(3);
  });

  it('should throw InfrastructureException after all retries exhausted', async () => {
    const provider = new TestProvider({ maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock.mockRejectedValue({ status: 500, message: 'Down' });

    await expect(
      provider.parseMessage('hello', [], createEmptyDraft(), 'EN'),
    ).rejects.toThrow(InfrastructureException);
    // initial + 2 retries = 3 calls
    expect(provider.callApiMock).toHaveBeenCalledTimes(3);
  });

  it('should NOT retry on 401 Unauthorized', async () => {
    const provider = new TestProvider({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock.mockRejectedValue({ status: 401, message: 'Unauthorized' });

    await expect(
      provider.parseMessage('hello', [], createEmptyDraft(), 'EN'),
    ).rejects.toThrow(InfrastructureException);
    expect(provider.callApiMock).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 400 Bad Request', async () => {
    const provider = new TestProvider({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock.mockRejectedValue({ status: 400, message: 'Bad Request' });

    await expect(
      provider.parseMessage('hello', [], createEmptyDraft(), 'EN'),
    ).rejects.toThrow(InfrastructureException);
    expect(provider.callApiMock).toHaveBeenCalledTimes(1);
  });

  it('should retry on 429 Rate Limit', async () => {
    const provider = new TestProvider({ maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock
      .mockRejectedValueOnce({ status: 429, message: 'Rate limited' })
      .mockResolvedValue({ content: '{}', tokensUsed: 50, model: 'test-model' });

    const result = await provider.parseMessage('hello', [], createEmptyDraft(), 'EN');
    expect(result.tokensUsed).toBe(50);
    expect(provider.callApiMock).toHaveBeenCalledTimes(2);
  });

  it('should include provider name in InfrastructureException', async () => {
    const provider = new TestProvider({ maxRetries: 0, baseDelayMs: 10, maxDelayMs: 50 });
    provider.callApiMock.mockRejectedValue(new Error('Network fail'));

    try {
      await provider.parseMessage('hello', [], createEmptyDraft(), 'EN');
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InfrastructureException);
      expect((error as InfrastructureException).provider).toBe('test');
    }
  });
});
