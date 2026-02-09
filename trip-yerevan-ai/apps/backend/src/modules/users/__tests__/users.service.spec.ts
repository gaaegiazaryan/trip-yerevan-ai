import { UsersService } from '../users.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { Language } from '@prisma/client';

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('upsertByTelegram', () => {
    it('should call prisma.user.upsert with correct create and update args', async () => {
      const mockUser = { id: 'u1', telegramId: BigInt(100), firstName: 'Test' };
      prisma.user.upsert.mockResolvedValue(mockUser);

      const result = await service.upsertByTelegram({
        telegramId: BigInt(100),
        firstName: 'Test',
        lastName: 'User',
        languageCode: 'en',
      });

      expect(result).toEqual(mockUser);
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { telegramId: BigInt(100) },
        create: {
          telegramId: BigInt(100),
          firstName: 'Test',
          lastName: 'User',
          preferredLanguage: Language.EN,
        },
        update: {
          firstName: 'Test',
          lastName: 'User',
        },
      });
    });

    it('should not include preferredLanguage in update payload', async () => {
      prisma.user.upsert.mockResolvedValue({});

      await service.upsertByTelegram({
        telegramId: BigInt(100),
        firstName: 'Test',
        languageCode: 'hy',
      });

      const call = prisma.user.upsert.mock.calls[0][0];
      expect(call.update).not.toHaveProperty('preferredLanguage');
      expect(call.create.preferredLanguage).toBe(Language.AM);
    });

    it('should default to RU when no languageCode is provided', async () => {
      prisma.user.upsert.mockResolvedValue({});

      await service.upsertByTelegram({
        telegramId: BigInt(100),
        firstName: 'Test',
      });

      const call = prisma.user.upsert.mock.calls[0][0];
      expect(call.create.preferredLanguage).toBe(Language.RU);
    });
  });
});
