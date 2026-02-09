import { AgenciesService } from '../agencies.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyMembershipStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    agency: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    agencyMembership: {
      findFirst: jest.fn(),
    },
  };
}

describe('AgenciesService', () => {
  let service: AgenciesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AgenciesService(prisma as unknown as PrismaService);
  });

  // ---------------------------------------------------------------------------
  // isActiveMember
  // ---------------------------------------------------------------------------

  describe('isActiveMember', () => {
    const TELEGRAM_ID = BigInt(111222333);

    it('should return true when user has an active membership', async () => {
      prisma.agencyMembership.findFirst.mockResolvedValue({
        id: 'membership-001',
        status: AgencyMembershipStatus.ACTIVE,
      });

      const result = await service.isActiveMember(TELEGRAM_ID);

      expect(result).toBe(true);
      expect(prisma.agencyMembership.findFirst).toHaveBeenCalledWith({
        where: {
          user: { telegramId: TELEGRAM_ID },
          status: AgencyMembershipStatus.ACTIVE,
        },
      });
    });

    it('should return false when user has no active membership', async () => {
      prisma.agencyMembership.findFirst.mockResolvedValue(null);

      const result = await service.isActiveMember(TELEGRAM_ID);

      expect(result).toBe(false);
    });

    it('should return false (not throw) when database query fails', async () => {
      prisma.agencyMembership.findFirst.mockRejectedValue(
        new Error('relation "agency_memberships" does not exist'),
      );

      const result = await service.isActiveMember(TELEGRAM_ID);

      expect(result).toBe(false);
    });

    it('should return false on unexpected Prisma errors', async () => {
      prisma.agencyMembership.findFirst.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.isActiveMember(TELEGRAM_ID);

      expect(result).toBe(false);
    });
  });
});
