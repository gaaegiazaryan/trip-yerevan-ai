import { AgencyMembershipService } from '../agency-membership.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyRole, AgencyMembershipStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    agencyMembership: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    agency: {
      findFirst: jest.fn(),
    },
  };
}

describe('AgencyMembershipService', () => {
  let service: AgencyMembershipService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const AGENCY_ID = 'agency-001';
  const USER_ID = 'user-001';
  const MEMBERSHIP_ID = 'membership-001';

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AgencyMembershipService(
      prisma as unknown as PrismaService,
    );
  });

  // ---------------------------------------------------------------------------
  // createOwnerMembership
  // ---------------------------------------------------------------------------

  describe('createOwnerMembership', () => {
    it('should create OWNER membership with ACTIVE status', async () => {
      const expected = {
        id: MEMBERSHIP_ID,
        agencyId: AGENCY_ID,
        userId: USER_ID,
        role: AgencyRole.OWNER,
        status: AgencyMembershipStatus.ACTIVE,
      };
      prisma.agencyMembership.create.mockResolvedValue(expected);

      const result = await service.createOwnerMembership(AGENCY_ID, USER_ID);

      expect(result).toEqual(expected);
      expect(prisma.agencyMembership.create).toHaveBeenCalledWith({
        data: {
          agencyId: AGENCY_ID,
          userId: USER_ID,
          role: AgencyRole.OWNER,
          status: AgencyMembershipStatus.ACTIVE,
        },
      });
    });

    it('should use transaction client when provided', async () => {
      const txCreate = jest.fn().mockResolvedValue({ id: MEMBERSHIP_ID });
      const tx = { agencyMembership: { create: txCreate } };

      await service.createOwnerMembership(AGENCY_ID, USER_ID, tx as any);

      expect(txCreate).toHaveBeenCalled();
      expect(prisma.agencyMembership.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // inviteAgent
  // ---------------------------------------------------------------------------

  describe('inviteAgent', () => {
    it('should create AGENT membership with ACTIVE status', async () => {
      const expected = {
        id: MEMBERSHIP_ID,
        role: AgencyRole.AGENT,
        status: AgencyMembershipStatus.ACTIVE,
      };
      prisma.agencyMembership.create.mockResolvedValue(expected);

      const result = await service.inviteAgent(AGENCY_ID, USER_ID, 'inviter-001');

      expect(result).toEqual(expected);
      expect(prisma.agencyMembership.create).toHaveBeenCalledWith({
        data: {
          agencyId: AGENCY_ID,
          userId: USER_ID,
          role: AgencyRole.AGENT,
          status: AgencyMembershipStatus.ACTIVE,
          invitedByUserId: 'inviter-001',
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // activateAgent
  // ---------------------------------------------------------------------------

  describe('activateAgent', () => {
    it('should set membership status to ACTIVE', async () => {
      prisma.agencyMembership.update.mockResolvedValue({
        id: MEMBERSHIP_ID,
        status: AgencyMembershipStatus.ACTIVE,
      });

      const result = await service.activateAgent(MEMBERSHIP_ID);

      expect(result.status).toBe(AgencyMembershipStatus.ACTIVE);
      expect(prisma.agencyMembership.update).toHaveBeenCalledWith({
        where: { id: MEMBERSHIP_ID },
        data: { status: AgencyMembershipStatus.ACTIVE },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // disableMember
  // ---------------------------------------------------------------------------

  describe('disableMember', () => {
    it('should set membership status to DISABLED', async () => {
      prisma.agencyMembership.update.mockResolvedValue({
        id: MEMBERSHIP_ID,
        status: AgencyMembershipStatus.DISABLED,
      });

      const result = await service.disableMember(MEMBERSHIP_ID);

      expect(result.status).toBe(AgencyMembershipStatus.DISABLED);
      expect(prisma.agencyMembership.update).toHaveBeenCalledWith({
        where: { id: MEMBERSHIP_ID },
        data: { status: AgencyMembershipStatus.DISABLED },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getActiveMembers
  // ---------------------------------------------------------------------------

  describe('getActiveMembers', () => {
    it('should return active members with user data', async () => {
      const members = [
        { id: 'm1', user: { firstName: 'John', lastName: 'Doe', telegramId: BigInt(111) } },
        { id: 'm2', user: { firstName: 'Jane', lastName: null, telegramId: BigInt(222) } },
      ];
      prisma.agencyMembership.findMany.mockResolvedValue(members);

      const result = await service.getActiveMembers(AGENCY_ID);

      expect(result).toEqual(members);
      expect(prisma.agencyMembership.findMany).toHaveBeenCalledWith({
        where: { agencyId: AGENCY_ID, status: AgencyMembershipStatus.ACTIVE },
        include: { user: { select: { firstName: true, lastName: true, telegramId: true } } },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // findActiveMemberTelegramIds
  // ---------------------------------------------------------------------------

  describe('findActiveMemberTelegramIds', () => {
    it('should return telegram IDs of all active members', async () => {
      prisma.agencyMembership.findMany.mockResolvedValue([
        { user: { telegramId: BigInt(111) } },
        { user: { telegramId: BigInt(222) } },
      ]);

      const ids = await service.findActiveMemberTelegramIds(AGENCY_ID);

      expect(ids).toEqual([BigInt(111), BigInt(222)]);
    });

    it('should return empty array when no active members', async () => {
      prisma.agencyMembership.findMany.mockResolvedValue([]);

      const ids = await service.findActiveMemberTelegramIds(AGENCY_ID);
      expect(ids).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findActiveMembership
  // ---------------------------------------------------------------------------

  describe('findActiveMembership', () => {
    it('should return membership for user in agency', async () => {
      const membership = { id: MEMBERSHIP_ID, agencyId: AGENCY_ID, userId: USER_ID };
      prisma.agencyMembership.findFirst.mockResolvedValue(membership);

      const result = await service.findActiveMembership(USER_ID, AGENCY_ID);

      expect(result).toEqual(membership);
    });

    it('should return null when no membership exists', async () => {
      prisma.agencyMembership.findFirst.mockResolvedValue(null);

      const result = await service.findActiveMembership(USER_ID, AGENCY_ID);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // resolveOrCreateMembership
  // ---------------------------------------------------------------------------

  describe('resolveOrCreateMembership', () => {
    const CHAT_ID = 123456789;

    it('should return existing membership if found', async () => {
      const existing = { id: MEMBERSHIP_ID, agencyId: AGENCY_ID };
      prisma.agencyMembership.findFirst.mockResolvedValue(existing);

      const result = await service.resolveOrCreateMembership(USER_ID, CHAT_ID);

      expect(result).toEqual(existing);
      expect(prisma.agency.findFirst).not.toHaveBeenCalled();
    });

    it('should auto-create membership when chat matches agency', async () => {
      prisma.agencyMembership.findFirst.mockResolvedValue(null);
      prisma.agency.findFirst.mockResolvedValue({
        id: AGENCY_ID,
        telegramChatId: BigInt(CHAT_ID),
      });
      prisma.agencyMembership.create.mockResolvedValue({
        id: 'new-membership',
        agencyId: AGENCY_ID,
      });

      const result = await service.resolveOrCreateMembership(USER_ID, CHAT_ID);

      expect(result).toEqual({ id: 'new-membership', agencyId: AGENCY_ID });
      expect(prisma.agencyMembership.create).toHaveBeenCalledWith({
        data: {
          agencyId: AGENCY_ID,
          userId: USER_ID,
          role: AgencyRole.AGENT,
          status: AgencyMembershipStatus.ACTIVE,
        },
      });
    });

    it('should return null when no agency matches chat', async () => {
      prisma.agencyMembership.findFirst.mockResolvedValue(null);
      prisma.agency.findFirst.mockResolvedValue(null);

      const result = await service.resolveOrCreateMembership(USER_ID, CHAT_ID);

      expect(result).toBeNull();
    });
  });
});
