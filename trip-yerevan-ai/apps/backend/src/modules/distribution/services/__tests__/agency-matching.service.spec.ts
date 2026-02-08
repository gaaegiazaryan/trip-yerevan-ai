import { AgencyMatchingService } from '../agency-matching.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { AgencyStatus } from '@prisma/client';

function createMockAgency(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agency-001',
    name: 'Test Agency',
    telegramChatId: BigInt(111222333),
    status: AgencyStatus.APPROVED,
    rating: 4.5,
    regions: ['Armenia'],
    specializations: ['PACKAGE'],
    agents: [{ id: 'agent-001' }],
    ...overrides,
  };
}

describe('AgencyMatchingService', () => {
  let service: AgencyMatchingService;
  let prisma: { agency: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = {
      agency: {
        findMany: jest.fn().mockResolvedValue([
          createMockAgency(),
          createMockAgency({
            id: 'agency-002',
            name: 'Second Agency',
            telegramChatId: BigInt(444555666),
            regions: ['Georgia'],
            specializations: ['EXCURSION'],
            rating: 3.0,
            agents: [{ id: 'agent-002' }],
          }),
        ]),
      },
    };

    service = new AgencyMatchingService(
      prisma as unknown as PrismaService,
    );
  });

  it('should return approved agencies with active agents', async () => {
    const results = await service.match({
      destination: 'Armenia',
      tripType: 'PACKAGE',
      regions: ['Armenia'],
    });

    expect(results.length).toBe(2);
    expect(results[0].agencyId).toBe('agency-001');
    expect(results[0].matchScore).toBeGreaterThan(0);
  });

  it('should filter out agencies with no telegramChatId', async () => {
    prisma.agency.findMany.mockResolvedValue([
      createMockAgency(),
      createMockAgency({
        id: 'agency-no-chat',
        name: 'No Chat Agency',
        telegramChatId: null,
        agents: [{ id: 'agent-x' }],
      }),
    ]);

    const results = await service.match({
      destination: null,
      tripType: null,
      regions: [],
    });

    expect(results.length).toBe(1);
    expect(results[0].agencyId).toBe('agency-001');
  });

  it('should filter out agencies matching excludeChatId (self-delivery prevention)', async () => {
    const travelerChatId = BigInt(111222333); // same as agency-001

    const results = await service.match({
      destination: null,
      tripType: null,
      regions: [],
      excludeChatId: travelerChatId,
    });

    // agency-001 should be excluded because its telegramChatId matches traveler
    expect(results.length).toBe(1);
    expect(results[0].agencyId).toBe('agency-002');
  });

  it('should filter out agencies with no active agents', async () => {
    prisma.agency.findMany.mockResolvedValue([
      createMockAgency(),
      createMockAgency({
        id: 'agency-no-agents',
        name: 'No Agents Agency',
        telegramChatId: BigInt(777888999),
        agents: [], // no active agents
      }),
    ]);

    const results = await service.match({
      destination: null,
      tripType: null,
      regions: [],
    });

    expect(results.length).toBe(1);
    expect(results[0].agencyId).toBe('agency-001');
  });

  it('should return empty when no approved agencies exist', async () => {
    prisma.agency.findMany.mockResolvedValue([]);

    const results = await service.match({
      destination: 'Dubai',
      tripType: 'PACKAGE',
      regions: ['Dubai'],
    });

    expect(results).toEqual([]);
  });

  it('should score by region (+3), specialization (+2), and rating bonus', async () => {
    prisma.agency.findMany.mockResolvedValue([
      createMockAgency({
        id: 'agency-match',
        regions: ['Dubai'],
        specializations: ['PACKAGE'],
        rating: 5.0,
        telegramChatId: BigInt(100),
        agents: [{ id: 'a1' }],
      }),
      createMockAgency({
        id: 'agency-partial',
        regions: ['Egypt'],
        specializations: ['PACKAGE'],
        rating: 2.0,
        telegramChatId: BigInt(200),
        agents: [{ id: 'a2' }],
      }),
    ]);

    const results = await service.match({
      destination: 'Dubai',
      tripType: 'PACKAGE',
      regions: ['Dubai'],
    });

    // agency-match: region(3) + spec(2) + rating(1.0) = 6.0
    // agency-partial: spec(2) + rating(0.4) = 2.4
    expect(results[0].agencyId).toBe('agency-match');
    expect(results[0].matchScore).toBe(6);
    expect(results[1].agencyId).toBe('agency-partial');
    expect(results[1].matchScore).toBeCloseTo(2.4, 1);
  });

  it('should match regions and specializations despite whitespace/case differences (normalization)', async () => {
    prisma.agency.findMany.mockResolvedValue([
      createMockAgency({
        id: 'agency-ws',
        regions: ['  Dubai ', 'EGYPT'],
        specializations: [' Package '],
        rating: 4.0,
        telegramChatId: BigInt(300),
        agents: [{ id: 'a3' }],
      }),
    ]);

    const results = await service.match({
      destination: 'dubai',
      tripType: 'PACKAGE',
      regions: ['dubai'],
    });

    // Should match despite "  Dubai " vs "dubai" and " Package " vs "PACKAGE"
    expect(results.length).toBe(1);
    expect(results[0].agencyId).toBe('agency-ws');
    expect(results[0].matchScore).toBeGreaterThanOrEqual(5); // region(3) + spec(2)
    expect(results[0].matchReasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('region:'),
        expect.stringContaining('specialization:'),
      ]),
    );
  });

  it('should return all eligible when no agency scores above 0', async () => {
    prisma.agency.findMany.mockResolvedValue([
      createMockAgency({
        id: 'agency-a',
        regions: [],
        specializations: [],
        rating: 0,
        telegramChatId: BigInt(100),
        agents: [{ id: 'a1' }],
      }),
      createMockAgency({
        id: 'agency-b',
        regions: [],
        specializations: [],
        rating: 0,
        telegramChatId: BigInt(200),
        agents: [{ id: 'a2' }],
      }),
    ]);

    const results = await service.match({
      destination: 'Unknown',
      tripType: null,
      regions: [],
    });

    // No scores > 0, so all eligible returned as fallback
    expect(results.length).toBe(2);
  });
});
