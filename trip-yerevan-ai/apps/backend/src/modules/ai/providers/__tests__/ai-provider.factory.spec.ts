import { ConfigService } from '@nestjs/config';
import { aiProviderFactory } from '../ai-provider.factory';
import { AnthropicProvider } from '../anthropic.provider';
import { OpenAiProvider } from '../openai.provider';
import { MockAiProvider } from '../mock-ai.provider';

function mockConfig(env: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

describe('aiProviderFactory', () => {
  it('should select AnthropicProvider when ANTHROPIC_API_KEY is set', () => {
    const config = mockConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      OPENAI_API_KEY: 'sk-openai-test-key',
    });
    const provider = aiProviderFactory(config);
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('should select OpenAiProvider when only OPENAI_API_KEY is set', () => {
    const config = mockConfig({
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: 'sk-openai-test-key',
    });
    const provider = aiProviderFactory(config);
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it('should fall back to MockAiProvider when no keys are set', () => {
    const config = mockConfig({
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
    });
    const provider = aiProviderFactory(config);
    expect(provider).toBeInstanceOf(MockAiProvider);
  });

  it('should fall back to MockAiProvider when keys are undefined', () => {
    const config = mockConfig({});
    const provider = aiProviderFactory(config);
    expect(provider).toBeInstanceOf(MockAiProvider);
  });

  it('should trim whitespace from API keys', () => {
    const config = mockConfig({
      ANTHROPIC_API_KEY: '   ',
      OPENAI_API_KEY: '  sk-openai-test-key  ',
    });
    const provider = aiProviderFactory(config);
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it('should prefer Anthropic over OpenAI when both keys are present', () => {
    const config = mockConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      OPENAI_API_KEY: 'sk-openai-test-key',
    });
    const provider = aiProviderFactory(config);
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });
});
