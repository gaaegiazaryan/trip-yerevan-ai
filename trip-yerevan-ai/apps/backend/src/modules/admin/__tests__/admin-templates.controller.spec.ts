import { AdminTemplatesController } from '../admin-templates.controller';
import { NotificationChannel, Prisma } from '@prisma/client';

describe('AdminTemplatesController', () => {
  let controller: AdminTemplatesController;
  let prisma: {
    notificationTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let templateResolver: {
    preview: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      notificationTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'new-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    templateResolver = {
      preview: jest.fn().mockReturnValue({ text: 'rendered' }),
    };

    controller = new AdminTemplatesController(
      prisma as any,
      templateResolver as any,
    );
  });

  describe('GET /admin/templates', () => {
    it('should return paginated templates', async () => {
      const templates = [
        { id: 't1', templateKey: 'booking.created.agent', version: '1.0' },
      ];
      prisma.notificationTemplate.findMany.mockResolvedValue(templates);
      prisma.notificationTemplate.count.mockResolvedValue(1);

      const result = await controller.findAll({
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(templates);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should filter by templateKey', async () => {
      await controller.findAll({
        templateKey: 'booking.created.agent',
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { templateKey: 'booking.created.agent' },
        }),
      );
    });

    it('should filter by channel and isActive', async () => {
      await controller.findAll({
        channel: NotificationChannel.TELEGRAM,
        isActive: true,
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { channel: NotificationChannel.TELEGRAM, isActive: true },
        }),
      );
    });
  });

  describe('GET /admin/templates/:id', () => {
    it('should return template detail', async () => {
      const template = { id: 't1', templateKey: 'test' };
      prisma.notificationTemplate.findUnique.mockResolvedValue(template);

      const result = await controller.findById('t1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(template);
    });

    it('should throw 404 for non-existent template', async () => {
      await expect(controller.findById('nonexistent')).rejects.toThrow(
        'Template not found',
      );
    });
  });

  describe('POST /admin/templates', () => {
    it('should create a new template (inactive)', async () => {
      const dto = {
        templateKey: 'booking.created.agent',
        version: '2.0',
        channel: NotificationChannel.TELEGRAM,
        body: 'Hello {{name}}',
      };

      const result = await controller.create(dto as any, { user: { id: 'user-1' } });

      expect(result.success).toBe(true);
      expect(prisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateKey: 'booking.created.agent',
          version: '2.0',
          isActive: false,
          createdById: 'user-1',
        }),
      });
    });

    it('should throw ConflictException on duplicate key+version+channel', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '6.0.0' },
      );
      prisma.notificationTemplate.create.mockRejectedValue(error);

      await expect(
        controller.create(
          {
            templateKey: 'test',
            version: '1.0',
            channel: NotificationChannel.TELEGRAM,
            body: 'test',
          } as any,
          { user: { id: 'u1' } },
        ),
      ).rejects.toThrow('already exists');
    });
  });

  describe('PUT /admin/templates/:id', () => {
    it('should update body of inactive template', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        isActive: false,
      });
      prisma.notificationTemplate.update.mockResolvedValue({
        id: 't1',
        body: 'New body',
      });

      const result = await controller.update('t1', { body: 'New body' });

      expect(result.success).toBe(true);
      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { body: 'New body' },
      });
    });

    it('should reject editing an active template', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        isActive: true,
      });

      const result = await controller.update('t1', { body: 'New body' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot edit an active template');
    });

    it('should throw 404 for non-existent template', async () => {
      await expect(
        controller.update('nonexistent', { body: 'test' }),
      ).rejects.toThrow('Template not found');
    });
  });

  describe('POST /admin/templates/activate', () => {
    it('should atomically activate a template', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't2',
        templateKey: 'booking.created.agent',
        version: '2.0',
        channel: NotificationChannel.TELEGRAM,
      });

      const result = await controller.activate({ templateId: 't2' });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 't2',
        activated: true,
      });

      // Atomic transaction: deactivate siblings + activate target
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(), // updateMany (deactivate siblings)
        expect.anything(), // update (activate target)
      ]);
    });

    it('should throw 404 when template not found', async () => {
      await expect(
        controller.activate({ templateId: 'nonexistent' }),
      ).rejects.toThrow('Template not found');
    });
  });

  describe('POST /admin/templates/:id/deactivate', () => {
    it('should deactivate an active template', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        isActive: true,
      });

      const result = await controller.deactivate('t1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 't1', deactivated: true });
      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isActive: false },
      });
    });

    it('should return no-op when already inactive', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        isActive: false,
      });

      const result = await controller.deactivate('t1');

      expect(result.data).toEqual({
        id: 't1',
        deactivated: false,
        reason: 'Already inactive',
      });
      expect(prisma.notificationTemplate.update).not.toHaveBeenCalled();
    });

    it('should throw 404 for non-existent template', async () => {
      await expect(controller.deactivate('nonexistent')).rejects.toThrow(
        'Template not found',
      );
    });
  });

  describe('POST /admin/templates/preview', () => {
    it('should preview a template with variables', async () => {
      templateResolver.preview.mockReturnValue({ text: 'Hello Admin!' });

      const result = await controller.preview({
        body: 'Hello {{name}}!',
        variables: { name: 'Admin' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ text: 'Hello Admin!' });
      expect(templateResolver.preview).toHaveBeenCalledWith(
        'Hello {{name}}!',
        { name: 'Admin' },
        undefined,
      );
    });

    it('should pass buttons to preview', async () => {
      templateResolver.preview.mockReturnValue({
        text: 'Confirm?',
        buttons: [{ label: 'Yes', callbackData: 'ok' }],
      });

      const result = await controller.preview({
        body: 'Confirm?',
        buttons: [{ label: 'Yes', callbackData: 'ok' }],
      });

      expect(result.data).toEqual({
        text: 'Confirm?',
        buttons: [{ label: 'Yes', callbackData: 'ok' }],
      });
    });
  });
});
