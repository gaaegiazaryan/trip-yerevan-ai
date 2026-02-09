import { AgencyManagementService } from '../agency-management.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyRole, AgencyMembershipStatus, AgencyStatus, RfqDeliveryStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    agency: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    agencyMembership: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    rfqDistribution: {
      findMany: jest.fn(),
    },
  };
}

function makeUser(
  overrides: {
    role?: AgencyRole;
    membershipStatus?: AgencyMembershipStatus;
    agencyStatus?: AgencyStatus;
    agencyId?: string;
    userId?: string;
    agencyName?: string;
  } = {},
) {
  const {
    role = AgencyRole.OWNER,
    membershipStatus = AgencyMembershipStatus.ACTIVE,
    agencyStatus = AgencyStatus.APPROVED,
    agencyId = 'agency-001',
    userId = 'user-001',
    agencyName = 'Test Agency',
  } = overrides;

  return {
    id: userId,
    firstName: 'John',
    lastName: 'Doe',
    telegramId: BigInt(111222333),
    memberships: membershipStatus === AgencyMembershipStatus.ACTIVE
      ? [
          {
            agencyId,
            userId,
            role,
            status: membershipStatus,
            agency: {
              id: agencyId,
              name: agencyName,
              status: agencyStatus,
            },
          },
        ]
      : [],
  };
}

describe('AgencyManagementService', () => {
  let service: AgencyManagementService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const TELEGRAM_ID = BigInt(111222333);
  const CHAT_ID = 123456789;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AgencyManagementService(
      prisma as unknown as PrismaService,
    );
  });

  // ---------------------------------------------------------------------------
  // getOwnerAgency
  // ---------------------------------------------------------------------------

  describe('getOwnerAgency', () => {
    it('should return agency info for OWNER with ACTIVE status and APPROVED agency', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.getOwnerAgency(TELEGRAM_ID);

      expect(result).toEqual({
        agencyId: 'agency-001',
        userId: 'user-001',
        agencyName: 'Test Agency',
      });
    });

    it('should return null for AGENT role', async () => {
      // Prisma's include.where { role: OWNER } filters out AGENT memberships
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        memberships: [],
      });

      const result = await service.getOwnerAgency(TELEGRAM_ID);
      expect(result).toBeNull();
    });

    it('should return null for DISABLED membership', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ membershipStatus: AgencyMembershipStatus.DISABLED }),
      );

      const result = await service.getOwnerAgency(TELEGRAM_ID);
      expect(result).toBeNull();
    });

    it('should return null for non-APPROVED agency', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ agencyStatus: AgencyStatus.PENDING }),
      );

      const result = await service.getOwnerAgency(TELEGRAM_ID);
      expect(result).toBeNull();
    });

    it('should return null for user without memberships', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        memberships: [],
      });

      const result = await service.getOwnerAgency(TELEGRAM_ID);
      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getOwnerAgency(TELEGRAM_ID);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getAgentAgency
  // ---------------------------------------------------------------------------

  describe('getAgentAgency', () => {
    it('should return for OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.getAgentAgency(TELEGRAM_ID);
      expect(result).toEqual({
        agencyId: 'agency-001',
        userId: 'user-001',
        agencyName: 'Test Agency',
        role: AgencyRole.OWNER,
      });
    });

    it('should return for AGENT', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ role: AgencyRole.AGENT }),
      );

      const result = await service.getAgentAgency(TELEGRAM_ID);
      expect(result).toEqual(
        expect.objectContaining({ role: AgencyRole.AGENT }),
      );
    });

    it('should return null for DISABLED membership', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ membershipStatus: AgencyMembershipStatus.DISABLED }),
      );

      const result = await service.getAgentAgency(TELEGRAM_ID);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // setAgencyChat
  // ---------------------------------------------------------------------------

  describe('setAgencyChat', () => {
    it('should update agency chat for OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.agency.update.mockResolvedValue({});

      const result = await service.setAgencyChat(
        TELEGRAM_ID,
        -1001234567890,
        'Travel Team Chat',
      );

      expect(result.text).toContain('Travel Team Chat');
      expect(result.text).toContain('RFQ notifications');
      expect(prisma.agency.update).toHaveBeenCalledWith({
        where: { id: 'agency-001' },
        data: { agencyTelegramChatId: BigInt(-1001234567890) },
      });
    });

    it('should reject non-OWNER', async () => {
      // Prisma's include.where { role: OWNER } returns empty memberships for AGENT
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        memberships: [],
      });

      const result = await service.setAgencyChat(
        TELEGRAM_ID,
        -1001234567890,
        'Chat',
      );

      expect(result.text).toContain('Only agency owners');
      expect(prisma.agency.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // /add_manager flow
  // ---------------------------------------------------------------------------

  describe('startAddManager', () => {
    it('should set state and return prompt for OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.startAddManager(CHAT_ID, TELEGRAM_ID);

      expect(result.text).toContain('Forward a message');
      expect(result.buttons).toBeDefined();
      expect(result.buttons![0].callbackData).toBe('mgmt:cancel_add');
      expect(service.hasActiveAddManager(CHAT_ID)).toBe(true);
    });

    it('should reject non-OWNER', async () => {
      // Prisma's include.where { role: OWNER } returns empty memberships for AGENT
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        memberships: [],
      });

      const result = await service.startAddManager(CHAT_ID, TELEGRAM_ID);

      expect(result.text).toContain('Only agency owners');
      expect(service.hasActiveAddManager(CHAT_ID)).toBe(false);
    });
  });

  describe('cancelAddManager', () => {
    it('should clear add-manager state', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await service.startAddManager(CHAT_ID, TELEGRAM_ID);
      expect(service.hasActiveAddManager(CHAT_ID)).toBe(true);

      service.cancelAddManager(CHAT_ID);
      expect(service.hasActiveAddManager(CHAT_ID)).toBe(false);
    });
  });

  describe('handleAddManagerInput', () => {
    const TARGET_TG_ID = BigInt(444555666);

    beforeEach(async () => {
      // Start add-manager flow as OWNER
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await service.startAddManager(CHAT_ID, TELEGRAM_ID);
      // Reset mock for subsequent calls
      prisma.user.findUnique.mockReset();
    });

    it('should create AGENT membership for valid user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-target',
        firstName: 'Jane',
        lastName: 'Smith',
        telegramId: TARGET_TG_ID,
      });
      prisma.agencyMembership.findUnique.mockResolvedValue(null);
      prisma.agencyMembership.create.mockResolvedValue({});

      const result = await service.handleAddManagerInput(
        CHAT_ID,
        TARGET_TG_ID,
      );

      expect(result.text).toContain('Manager added successfully');
      expect(result.text).toContain('Jane Smith');
      expect(prisma.agencyMembership.create).toHaveBeenCalledWith({
        data: {
          agencyId: 'agency-001',
          userId: 'user-target',
          role: AgencyRole.AGENT,
          status: AgencyMembershipStatus.ACTIVE,
        },
      });
      expect(service.hasActiveAddManager(CHAT_ID)).toBe(false);
    });

    it('should reject unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.handleAddManagerInput(
        CHAT_ID,
        TARGET_TG_ID,
      );

      expect(result.text).toContain('not found');
      expect(result.text).toContain('/start');
      expect(prisma.agencyMembership.create).not.toHaveBeenCalled();
    });

    it('should reject user already in same agency', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-target',
        firstName: 'Jane',
        lastName: null,
        telegramId: TARGET_TG_ID,
      });
      prisma.agencyMembership.findUnique.mockResolvedValue({
        agencyId: 'agency-001',
        userId: 'user-target',
      });

      const result = await service.handleAddManagerInput(
        CHAT_ID,
        TARGET_TG_ID,
      );

      expect(result.text).toContain('already a member of your agency');
      expect(prisma.agencyMembership.create).not.toHaveBeenCalled();
    });

    it('should allow user already in another agency (multi-agency)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-target',
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: TARGET_TG_ID,
      });
      // No membership in THIS agency
      prisma.agencyMembership.findUnique.mockResolvedValue(null);
      prisma.agencyMembership.create.mockResolvedValue({});

      const result = await service.handleAddManagerInput(
        CHAT_ID,
        TARGET_TG_ID,
      );

      expect(result.text).toContain('Manager added successfully');
      expect(prisma.agencyMembership.create).toHaveBeenCalled();
    });

    it('should return error when no active flow', async () => {
      service.cancelAddManager(CHAT_ID);

      const result = await service.handleAddManagerInput(
        CHAT_ID,
        TARGET_TG_ID,
      );

      expect(result.text).toContain('No active add-manager flow');
    });

    it('should clean up state after handling input', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.handleAddManagerInput(CHAT_ID, TARGET_TG_ID);
      expect(service.hasActiveAddManager(CHAT_ID)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // buildDashboard
  // ---------------------------------------------------------------------------

  describe('buildDashboard', () => {
    it('should return dashboard with buttons for OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.agency.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Agency',
        status: AgencyStatus.APPROVED,
        agencyTelegramChatId: BigInt(-1001234567890),
        memberships: [
          {
            role: AgencyRole.OWNER,
            user: { firstName: 'John', lastName: 'Doe' },
          },
          {
            role: AgencyRole.AGENT,
            user: { firstName: 'Jane', lastName: null },
          },
        ],
      });
      prisma.rfqDistribution.findMany.mockResolvedValue([
        { deliveryStatus: RfqDeliveryStatus.DELIVERED },
        { deliveryStatus: RfqDeliveryStatus.RESPONDED },
        { deliveryStatus: RfqDeliveryStatus.PENDING },
      ]);

      const result = await service.buildDashboard(TELEGRAM_ID);

      expect(result).not.toBeNull();
      expect(result!.text).toContain('Test Agency');
      expect(result!.text).toContain('Agency Dashboard');
      expect(result!.text).toContain('Distributed: 3');
      expect(result!.text).toContain('Delivered: 2');
      expect(result!.text).toContain('Responded: 1');
      expect(result!.text).toContain('John Doe');
      expect(result!.text).toContain('Jane');
      expect(result!.text).toContain('Agency chat:* Set');
      // OWNER gets management buttons
      expect(result!.buttons).toHaveLength(2);
      expect(result!.buttons![0].callbackData).toBe('mgmt:add_manager');
      expect(result!.buttons![1].callbackData).toBe('mgmt:set_chat_info');
    });

    it('should return dashboard without buttons for AGENT', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ role: AgencyRole.AGENT }),
      );
      prisma.agency.findUniqueOrThrow.mockResolvedValue({
        name: 'Test Agency',
        status: AgencyStatus.APPROVED,
        agencyTelegramChatId: null,
        memberships: [
          {
            role: AgencyRole.OWNER,
            user: { firstName: 'John', lastName: 'Doe' },
          },
        ],
      });
      prisma.rfqDistribution.findMany.mockResolvedValue([]);

      const result = await service.buildDashboard(TELEGRAM_ID);

      expect(result).not.toBeNull();
      expect(result!.text).toContain('Agency chat:* Not set');
      expect(result!.buttons).toHaveLength(0);
    });

    it('should return null for non-member user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.buildDashboard(TELEGRAM_ID);
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // findActiveAgentTelegramIds
  // ---------------------------------------------------------------------------

  describe('findActiveAgentTelegramIds', () => {
    it('should return telegramIds for active members', async () => {
      prisma.agencyMembership.findMany.mockResolvedValue([
        { user: { telegramId: BigInt(111) } },
        { user: { telegramId: BigInt(222) } },
      ]);

      const ids = await service.findActiveAgentTelegramIds('agency-001');

      expect(ids).toEqual([BigInt(111), BigInt(222)]);
      expect(prisma.agencyMembership.findMany).toHaveBeenCalledWith({
        where: { agencyId: 'agency-001', status: AgencyMembershipStatus.ACTIVE },
        include: { user: { select: { telegramId: true } } },
      });
    });

    it('should return empty array when no active members', async () => {
      prisma.agencyMembership.findMany.mockResolvedValue([]);

      const ids = await service.findActiveAgentTelegramIds('agency-001');
      expect(ids).toEqual([]);
    });
  });
});
