import { TemplateResolverService } from '../template-resolver.service';
import { NotificationTemplateEngine } from '../notification-template.engine';
import { NotificationChannel } from '@prisma/client';

describe('TemplateResolverService', () => {
  let resolver: TemplateResolverService;
  let templateEngine: NotificationTemplateEngine;
  let prisma: {
    notificationTemplate: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      notificationTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    templateEngine = new NotificationTemplateEngine();
    templateEngine.register({
      key: 'booking.created.agent',
      body: 'Hello {{name}}, booking {{id}}',
    });

    resolver = new TemplateResolverService(
      prisma as any,
      templateEngine,
    );
  });

  describe('resolve — DB-first strategy', () => {
    it('should return DB template when active version exists', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        templateKey: 'booking.created.agent',
        version: '2.0',
        channel: NotificationChannel.TELEGRAM,
        body: 'DB version: {{name}} booked {{id}}',
        buttons: null,
        isActive: true,
        policyVersion: 'v1',
      });

      const result = await resolver.resolve(
        'booking.created.agent',
        NotificationChannel.TELEGRAM,
        { name: 'Alice', id: '123' },
      );

      expect(result.source).toBe('db');
      expect(result.version).toBe('2.0');
      expect(result.policyVersion).toBe('v1');
      expect(result.rendered.text).toBe('DB version: Alice booked 123');
      expect(result.snapshot).toBe('DB version: {{name}} booked {{id}}');
    });

    it('should query DB with correct filter', async () => {
      await resolver.resolve(
        'booking.created.agent',
        NotificationChannel.TELEGRAM,
        { name: 'X', id: '1' },
      );

      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: {
          templateKey: 'booking.created.agent',
          channel: NotificationChannel.TELEGRAM,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should render DB template buttons', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-2',
        templateKey: 'booking.created.agent',
        version: '1.0',
        channel: NotificationChannel.TELEGRAM,
        body: 'Confirm?',
        buttons: [{ label: 'Yes {{id}}', callbackData: 'ok:{{id}}' }],
        isActive: true,
        policyVersion: null,
      });

      const result = await resolver.resolve(
        'booking.created.agent',
        NotificationChannel.TELEGRAM,
        { id: '42' },
      );

      expect(result.rendered.buttons).toEqual([
        { label: 'Yes 42', callbackData: 'ok:42' },
      ]);
    });
  });

  describe('resolve — code fallback', () => {
    it('should fall back to in-code template when no DB match', async () => {
      const result = await resolver.resolve(
        'booking.created.agent',
        NotificationChannel.TELEGRAM,
        { name: 'Bob', id: '456' },
      );

      expect(result.source).toBe('code');
      expect(result.version).toBeNull();
      expect(result.policyVersion).toBeNull();
      expect(result.rendered.text).toBe('Hello Bob, booking 456');
    });

    it('should throw when template not found in DB or code', async () => {
      await expect(
        resolver.resolve(
          'nonexistent.template',
          NotificationChannel.TELEGRAM,
          {},
        ),
      ).rejects.toThrow('not found in DB or code registry');
    });
  });

  describe('preview', () => {
    it('should render body with variables', () => {
      const result = resolver.preview(
        'Hello {{name}}!',
        { name: 'Admin' },
      );

      expect(result.text).toBe('Hello Admin!');
    });

    it('should render buttons with variables', () => {
      const result = resolver.preview(
        'Confirm?',
        { id: '99' },
        [{ label: 'OK {{id}}', callbackData: 'ok:{{id}}' }],
      );

      expect(result.buttons).toEqual([
        { label: 'OK 99', callbackData: 'ok:99' },
      ]);
    });

    it('should keep missing variables as-is', () => {
      const result = resolver.preview(
        'Hello {{missing}}!',
        {},
      );

      expect(result.text).toBe('Hello {{missing}}!');
    });
  });
});
