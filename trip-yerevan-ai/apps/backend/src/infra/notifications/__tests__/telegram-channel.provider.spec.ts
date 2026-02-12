import { TelegramChannelProvider } from '../telegram-channel.provider';
import { NotificationChannel } from '@prisma/client';

describe('TelegramChannelProvider', () => {
  let provider: TelegramChannelProvider;
  let telegramService: {
    sendMessage: jest.Mock;
    sendRfqToAgency: jest.Mock;
  };

  beforeEach(() => {
    telegramService = {
      sendMessage: jest.fn().mockResolvedValue(123),
      sendRfqToAgency: jest.fn().mockResolvedValue(456),
    };
    provider = new TelegramChannelProvider(telegramService as any);
  });

  it('should report TELEGRAM channel', () => {
    expect(provider.channel).toBe(NotificationChannel.TELEGRAM);
  });

  it('should send plain text via sendMessage and return providerMessageId', async () => {
    const result = await provider.send(12345, 'Hello world');

    expect(result).toEqual({ success: true, providerMessageId: '123' });
    expect(telegramService.sendMessage).toHaveBeenCalledWith(12345, 'Hello world');
    expect(telegramService.sendRfqToAgency).not.toHaveBeenCalled();
  });

  it('should send text with buttons via sendRfqToAgency', async () => {
    const buttons = [{ label: 'Accept', callbackData: 'bk:accept:1' }];
    const result = await provider.send(12345, 'Confirm?', buttons);

    expect(result).toEqual({ success: true, providerMessageId: '456' });
    expect(telegramService.sendRfqToAgency).toHaveBeenCalledWith(
      12345,
      'Confirm?',
      buttons,
    );
  });

  it('should send plain text when buttons array is empty', async () => {
    const result = await provider.send(12345, 'No buttons', []);
    expect(result.success).toBe(true);
    expect(telegramService.sendMessage).toHaveBeenCalledWith(12345, 'No buttons');
  });

  describe('error classification', () => {
    it('should mark 403 as permanent error', async () => {
      const error = new Error('Forbidden: bot was blocked by the user');
      (error as any).error_code = 403;
      telegramService.sendMessage.mockRejectedValue(error);

      const result = await provider.send(12345, 'Hello');

      expect(result.success).toBe(false);
      expect(result.permanent).toBe(true);
      expect(result.errorMessage).toContain('bot was blocked');
    });

    it('should mark 400 as permanent error', async () => {
      const error = new Error('Bad Request: chat not found');
      (error as any).error_code = 400;
      telegramService.sendMessage.mockRejectedValue(error);

      const result = await provider.send(12345, 'Hello');

      expect(result.success).toBe(false);
      expect(result.permanent).toBe(true);
    });

    it('should mark network timeout as transient (not permanent)', async () => {
      telegramService.sendMessage.mockRejectedValue(
        new Error('connect ETIMEDOUT'),
      );

      const result = await provider.send(12345, 'Hello');

      expect(result.success).toBe(false);
      expect(result.permanent).toBe(false);
    });

    it('should mark 429 rate limit as transient', async () => {
      const error = new Error('Too Many Requests');
      (error as any).error_code = 429;
      telegramService.sendMessage.mockRejectedValue(error);

      const result = await provider.send(12345, 'Hello');

      expect(result.success).toBe(false);
      expect(result.permanent).toBe(false);
    });

    it('should mark 500 server error as transient', async () => {
      const error = new Error('Internal Server Error');
      (error as any).error_code = 500;
      telegramService.sendMessage.mockRejectedValue(error);

      const result = await provider.send(12345, 'Hello');

      expect(result.success).toBe(false);
      expect(result.permanent).toBe(false);
    });

    it('should detect permanent error from message string', async () => {
      telegramService.sendMessage.mockRejectedValue(
        new Error('user is deactivated'),
      );

      const result = await provider.send(12345, 'Hello');

      expect(result.success).toBe(false);
      expect(result.permanent).toBe(true);
    });
  });
});
