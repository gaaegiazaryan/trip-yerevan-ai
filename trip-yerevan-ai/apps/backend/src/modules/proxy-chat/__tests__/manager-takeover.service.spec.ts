import { ManagerTakeoverService } from '../manager-takeover.service';
import { ProxyChatStatus, UserRole } from '@prisma/client';

function createMockPrisma() {
  return {
    travelRequest: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    proxyChat: { findUnique: jest.fn() },
  };
}

function createMockProxyChatService() {
  return {
    findByTravelRequest: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn(),
    assignManager: jest.fn(),
  };
}

function createMockAuditLog() {
  return { log: jest.fn() };
}

const TR_ID = 'tr-001';
const BOOKING_ID = 'booking-001';
const MANAGER_USER_ID = 'manager-001';
const MANAGER_TELEGRAM_ID = BigInt(55555);
const MANAGER_CHANNEL = 77777;

describe('ManagerTakeoverService', () => {
  let service: ManagerTakeoverService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let proxyChatService: ReturnType<typeof createMockProxyChatService>;
  let auditLog: ReturnType<typeof createMockAuditLog>;

  beforeEach(() => {
    prisma = createMockPrisma();
    proxyChatService = createMockProxyChatService();
    auditLog = createMockAuditLog();
    service = new ManagerTakeoverService(
      prisma as any,
      proxyChatService as any,
      auditLog as any,
    );
  });

  describe('onBookingCreated', () => {
    it('should transition OPEN chats to BOOKED', async () => {
      proxyChatService.findByTravelRequest.mockResolvedValue([
        { id: 'pc-1', status: ProxyChatStatus.OPEN },
        { id: 'pc-2', status: ProxyChatStatus.CLOSED },
      ]);
      prisma.travelRequest.findUnique.mockResolvedValue({
        destination: 'Dubai',
      });

      await service.onBookingCreated(TR_ID, BOOKING_ID);

      expect(proxyChatService.updateStatus).toHaveBeenCalledWith(
        'pc-1',
        ProxyChatStatus.BOOKED,
      );
      // Closed chat should NOT be transitioned
      expect(proxyChatService.updateStatus).toHaveBeenCalledTimes(1);
      expect(auditLog.log).toHaveBeenCalledTimes(1);
    });

    it('should return empty when no manager channel', async () => {
      proxyChatService.findByTravelRequest.mockResolvedValue([]);

      const result = await service.onBookingCreated(TR_ID, BOOKING_ID);

      expect(result.managerChannelNotification).toBeUndefined();
    });

    it('should return manager channel notification with claim button', async () => {
      proxyChatService.findByTravelRequest.mockResolvedValue([]);
      prisma.travelRequest.findUnique.mockResolvedValue({
        destination: 'Dubai',
      });

      const result = await service.onBookingCreated(
        TR_ID,
        BOOKING_ID,
        MANAGER_CHANNEL,
      );

      expect(result.managerChannelNotification).toBeDefined();
      expect(result.managerChannelNotification!.chatId).toBe(MANAGER_CHANNEL);
      expect(result.managerChannelNotification!.text).toContain('New Booking');
      expect(result.managerChannelNotification!.buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            callbackData: `mgr:claim:${TR_ID}`,
          }),
        ]),
      );
    });
  });

  describe('claimChat', () => {
    it('should reject non-manager users', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.TRAVELER });

      const result = await service.claimChat(
        TR_ID,
        MANAGER_USER_ID,
        MANAGER_TELEGRAM_ID,
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain('Only managers');
    });

    it('should reject when already claimed', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.MANAGER });
      proxyChatService.findByTravelRequest.mockResolvedValue([
        { id: 'pc-1', status: ProxyChatStatus.MANAGER_ASSIGNED },
      ]);

      const result = await service.claimChat(
        TR_ID,
        MANAGER_USER_ID,
        MANAGER_TELEGRAM_ID,
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain('already been assigned');
    });

    it('should reject when no chat found', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.MANAGER });
      proxyChatService.findByTravelRequest.mockResolvedValue([]);

      const result = await service.claimChat(
        TR_ID,
        MANAGER_USER_ID,
        MANAGER_TELEGRAM_ID,
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain('No active chat');
    });

    it('should assign manager and return notifications', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.MANAGER });
      proxyChatService.findByTravelRequest.mockResolvedValue([
        { id: 'pc-1', status: ProxyChatStatus.BOOKED },
      ]);
      prisma.proxyChat.findUnique.mockResolvedValue({
        id: 'pc-1',
        user: { telegramId: BigInt(12345) },
        agency: {
          name: 'TravelCo',
          memberships: [
            { user: { telegramId: BigInt(99999) } },
          ],
        },
      });

      const result = await service.claimChat(
        TR_ID,
        MANAGER_USER_ID,
        MANAGER_TELEGRAM_ID,
      );

      expect(result.success).toBe(true);
      expect(proxyChatService.assignManager).toHaveBeenCalledWith(
        'pc-1',
        MANAGER_USER_ID,
      );
      expect(auditLog.log).toHaveBeenCalled();

      // Traveler notification with chat button
      const travelerNotif = result.notifications.find((n) => n.chatId === 12345);
      expect(travelerNotif).toBeDefined();
      expect(travelerNotif!.text).toContain('manager');
      expect(travelerNotif!.buttons).toBeDefined();

      // Agency notification
      const agentNotif = result.notifications.find((n) => n.chatId === 99999);
      expect(agentNotif).toBeDefined();
      expect(agentNotif!.text).toContain('taken over');
    });

    it('should allow ADMIN users to claim', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.ADMIN });
      proxyChatService.findByTravelRequest.mockResolvedValue([
        { id: 'pc-1', status: ProxyChatStatus.BOOKED },
      ]);
      prisma.proxyChat.findUnique.mockResolvedValue({
        id: 'pc-1',
        user: { telegramId: BigInt(12345) },
        agency: {
          name: 'TravelCo',
          memberships: [],
        },
      });

      const result = await service.claimChat(
        TR_ID,
        MANAGER_USER_ID,
        MANAGER_TELEGRAM_ID,
      );

      expect(result.success).toBe(true);
    });
  });
});
