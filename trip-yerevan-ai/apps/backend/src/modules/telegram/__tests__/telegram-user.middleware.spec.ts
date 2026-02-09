import { TelegramUserMiddleware } from '../telegram-user.middleware';
import { UsersService } from '../../users/users.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { Language, UserRole, UserStatus } from '@prisma/client';

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

const MOCK_USER = {
  id: 'user-001',
  telegramId: BigInt(123456),
  firstName: 'John',
  lastName: 'Doe',
  phone: null,
  preferredLanguage: Language.EN,
  role: UserRole.TRAVELER,
  status: UserStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TelegramUserMiddleware', () => {
  let middleware: TelegramUserMiddleware;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    const usersService = new UsersService(
      prisma as unknown as PrismaService,
    );
    middleware = new TelegramUserMiddleware(usersService);
  });

  it('should upsert new user and attach to ctx.dbUser', async () => {
    prisma.user.upsert.mockResolvedValue(MOCK_USER);

    const ctx: any = {
      from: {
        id: 123456,
        first_name: 'John',
        last_name: 'Doe',
        language_code: 'en',
      },
      dbUser: undefined,
    };
    const next = jest.fn().mockResolvedValue(undefined);

    await middleware.middleware()(ctx, next);

    expect(ctx.dbUser).toEqual(MOCK_USER);
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { telegramId: BigInt(123456) },
      create: expect.objectContaining({
        telegramId: BigInt(123456),
        firstName: 'John',
        lastName: 'Doe',
        preferredLanguage: Language.EN,
      }),
      update: {
        firstName: 'John',
        lastName: 'Doe',
      },
    });
    expect(next).toHaveBeenCalled();
  });

  it('should update existing user names and attach to ctx.dbUser', async () => {
    const updatedUser = { ...MOCK_USER, firstName: 'Jane', lastName: 'Smith' };
    prisma.user.upsert.mockResolvedValue(updatedUser);

    const ctx: any = {
      from: {
        id: 123456,
        first_name: 'Jane',
        last_name: 'Smith',
        language_code: 'en',
      },
      dbUser: undefined,
    };
    const next = jest.fn().mockResolvedValue(undefined);

    await middleware.middleware()(ctx, next);

    expect(ctx.dbUser).toEqual(updatedUser);
    expect(ctx.dbUser.firstName).toBe('Jane');
    expect(ctx.dbUser.lastName).toBe('Smith');
    expect(next).toHaveBeenCalled();
  });

  it('should leave ctx.dbUser undefined when ctx.from is absent', async () => {
    const ctx: any = {
      from: undefined,
      dbUser: undefined,
    };
    const next = jest.fn().mockResolvedValue(undefined);

    await middleware.middleware()(ctx, next);

    expect(ctx.dbUser).toBeUndefined();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should call next() even when upsert throws a DB error', async () => {
    prisma.user.upsert.mockRejectedValue(new Error('DB connection lost'));

    const ctx: any = {
      from: {
        id: 123456,
        first_name: 'John',
      },
      dbUser: undefined,
    };
    const next = jest.fn().mockResolvedValue(undefined);

    await middleware.middleware()(ctx, next);

    expect(ctx.dbUser).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
