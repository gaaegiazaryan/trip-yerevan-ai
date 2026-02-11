import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AgencyStatus, BookingStatus, MeetingProposer, MeetingStatus, Prisma } from '@prisma/client';
import {
  BookingStateMachineService,
  TransitionResult,
} from '../bookings/booking-state-machine.service';
import { MeetingService, MeetingResult } from '../bookings/meeting.service';
import {
  MeetingProposalService,
  ProposalResult,
} from '../bookings/meeting-proposal.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  MEETING_CALENDAR_COLORS,
} from '../bookings/meeting.constants';
import {
  AdminBookingsQueryDto,
  VerifyBookingDto,
  KanbanQueryDto,
  AssignManagerDto,
  SetStatusDto,
} from './dto/admin-bookings.dto';
import {
  AdminMeetingsQueryDto,
  CancelMeetingDto,
  CompleteMeetingDto,
  CounterProposeMeetingDto,
} from './dto/admin-meetings.dto';
import { AdminCalendarQueryDto, RescheduleMeetingDto } from './dto/admin-calendar.dto';
import { AdminAnalyticsQueryDto } from './dto/admin-analytics.dto';
import {
  AdminAgenciesQueryDto,
  VerifyAgencyDto,
  TrustBadgeDto,
} from './dto/admin-agencies.dto';
import {
  AgencyPerformanceQueryDto,
  AgencyRankingQueryDto,
} from './dto/admin-agency-performance.dto';
import {
  AdminTravelersQueryDto,
  SetVipDto,
  SetBlacklistDto,
} from './dto/admin-travelers.dto';
import { NotesQueryDto, CreateNoteDto } from './dto/admin-notes.dto';
import { AdminRiskEventsQueryDto } from './dto/admin-risk.dto';
import { CacheService } from '../../infra/cache/cache.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  status: MeetingStatus;
  color: string;
  extendedProps: {
    bookingId: string;
    meetingId: string;
    userName: string;
    agencyName: string;
    destination: string | null;
    location: string | null;
    notes: string | null;
    status: MeetingStatus;
  };
}

export interface BookingListItem {
  id: string;
  status: BookingStatus;
  totalPrice: Prisma.Decimal;
  currency: string;
  createdAt: Date;
  user: { id: string; firstName: string; lastName: string | null };
  agency: { id: string; name: string };
  offer: {
    destination: string | null;
    departureDate: Date | null;
    totalPrice: Prisma.Decimal;
  };
}

/** Raw row shape from the ranking SQL query. */
interface AgencyPerformanceRawRow {
  agencyId: string;
  agencyName: string;
  trustBadge: boolean | null;
  offersSent: number | bigint;
  bookingsWon: number | bigint;
  cancellations: number | bigint;
  avgOfferPrice: number | null;
  totalRevenue: number | null;
  avgResponseHours: number | null;
}

/** Cleaned row returned to API consumers. */
export interface AgencyPerformanceRow {
  agencyId: string;
  agencyName: string;
  trustBadge: boolean;
  offersSent: number;
  bookingsWon: number;
  winRate: number;
  avgOfferPrice: number | null;
  avgResponseHours: number | null;
  totalRevenue: number;
  cancellationRate: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: BookingStateMachineService,
    private readonly meetingService: MeetingService,
    private readonly proposalService: MeetingProposalService,
    private readonly cache: CacheService,
  ) {}

  // -----------------------------------------------------------------------
  // Bookings
  // -----------------------------------------------------------------------

  async findBookings(
    query: AdminBookingsQueryDto,
  ): Promise<{ data: BookingListItem[]; total: number }> {
    const where: Prisma.BookingWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    if (query.q) {
      const search = query.q;
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        {
          offer: {
            travelRequest: {
              destination: { contains: search, mode: 'insensitive' },
            },
          },
        },
        { agency: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          agency: { select: { id: true, name: true } },
          offer: {
            select: {
              totalPrice: true,
              departureDate: true,
              travelRequest: { select: { destination: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    // Flatten offer.travelRequest.destination into offer.destination
    const items: BookingListItem[] = data.map((b) => ({
      id: b.id,
      status: b.status,
      totalPrice: b.totalPrice,
      currency: b.currency,
      createdAt: b.createdAt,
      user: b.user,
      agency: b.agency,
      offer: {
        destination: b.offer.travelRequest?.destination ?? null,
        departureDate: b.offer.departureDate,
        totalPrice: b.offer.totalPrice,
      },
    }));

    return { data: items, total };
  }

  async findBookingById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            telegramId: true,
          },
        },
        agency: { select: { id: true, name: true } },
        offer: {
          select: {
            id: true,
            totalPrice: true,
            currency: true,
            hotelName: true,
            departureDate: true,
            returnDate: true,
            nightsCount: true,
            adults: true,
            description: true,
            travelRequest: {
              select: {
                id: true,
                destination: true,
                departureCity: true,
                rawText: true,
                adults: true,
                children: true,
              },
            },
          },
        },
        meetings: { orderBy: { createdAt: 'desc' } },
        meetingProposals: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    return booking;
  }

  async verifyBooking(
    bookingId: string,
    dto: VerifyBookingDto,
    managerId: string,
  ): Promise<TransitionResult> {
    if (dto.action === 'CONFIRM') {
      // Save manager notes / checklist before transitioning
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          managerNotes: dto.notes ?? null,
          verificationChecklist: dto.checklist
            ? (dto.checklist as Prisma.InputJsonValue)
            : undefined,
        },
      });

      // Transition: AGENCY_CONFIRMED → MANAGER_VERIFIED
      const verifyResult = await this.stateMachine.transition(
        bookingId,
        BookingStatus.MANAGER_VERIFIED,
        { triggeredBy: managerId },
      );

      if (!verifyResult.success) {
        return verifyResult;
      }

      // Auto-chain: MANAGER_VERIFIED → MEETING_SCHEDULED (same as Telegram flow)
      const meetingResult = await this.stateMachine.transition(
        bookingId,
        BookingStatus.MEETING_SCHEDULED,
        { triggeredBy: managerId },
      );

      // Merge notifications from both transitions
      return {
        ...meetingResult,
        notifications: [
          ...verifyResult.notifications,
          ...meetingResult.notifications,
        ],
      };
    }

    // REJECT → CANCELLED
    return this.stateMachine.transition(bookingId, BookingStatus.CANCELLED, {
      triggeredBy: managerId,
      reason: dto.notes,
    });
  }

  // -----------------------------------------------------------------------
  // Kanban Pipeline
  // -----------------------------------------------------------------------

  private static readonly KANBAN_STATUSES: BookingStatus[] = [
    BookingStatus.CREATED,
    BookingStatus.AWAITING_AGENCY_CONFIRMATION,
    BookingStatus.AGENCY_CONFIRMED,
    BookingStatus.MANAGER_VERIFIED,
    BookingStatus.MEETING_SCHEDULED,
    BookingStatus.PAYMENT_PENDING,
    BookingStatus.PAID,
    BookingStatus.IN_PROGRESS,
  ];

  async findKanbanBookings(
    query: KanbanQueryDto,
  ): Promise<Record<string, BookingListItem[]>> {
    const where: Prisma.BookingWhereInput = {
      status: { in: AdminService.KANBAN_STATUSES },
    };

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    if (query.managerId) {
      where.managerId = query.managerId;
    }

    if (query.q) {
      const search = query.q;
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        {
          offer: {
            travelRequest: {
              destination: { contains: search, mode: 'insensitive' },
            },
          },
        },
        { agency: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const data = await this.prisma.booking.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        agency: { select: { id: true, name: true } },
        offer: {
          select: {
            totalPrice: true,
            departureDate: true,
            travelRequest: { select: { destination: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Initialize all columns as empty arrays
    const columns: Record<string, BookingListItem[]> = {};
    for (const status of AdminService.KANBAN_STATUSES) {
      columns[status] = [];
    }

    // Group bookings by status
    for (const b of data) {
      const item: BookingListItem = {
        id: b.id,
        status: b.status,
        totalPrice: b.totalPrice,
        currency: b.currency,
        createdAt: b.createdAt,
        user: b.user,
        agency: b.agency,
        offer: {
          destination: b.offer.travelRequest?.destination ?? null,
          departureDate: b.offer.departureDate,
          totalPrice: b.offer.totalPrice,
        },
      };
      if (columns[b.status]) {
        columns[b.status].push(item);
      }
    }

    return columns;
  }

  async assignManager(bookingId: string, managerId: string) {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { role: true },
    });

    if (!manager || manager.role !== 'MANAGER') {
      throw new DomainException('Target user is not an active manager.');
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { managerId },
    });

    return { success: true };
  }

  async setBookingStatus(
    bookingId: string,
    status: BookingStatus,
    reason: string | undefined,
    triggeredBy: string,
  ): Promise<TransitionResult> {
    return this.stateMachine.transition(bookingId, status, {
      triggeredBy,
      reason,
    });
  }

  // -----------------------------------------------------------------------
  // Meetings
  // -----------------------------------------------------------------------

  async findMeetings(query: AdminMeetingsQueryDto) {
    const bookingWhere: Prisma.BookingWhereInput = {
      status: {
        in: [
          BookingStatus.MEETING_SCHEDULED,
          BookingStatus.PAYMENT_PENDING,
        ],
      },
    };

    const meetingWhere: Prisma.MeetingWhereInput = {};
    if (query.status) {
      meetingWhere.status = query.status;
    }
    if (query.date) {
      const d = new Date(query.date);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      meetingWhere.scheduledAt = { gte: dayStart, lt: dayEnd };
    }

    // If meeting-level filters are set, only show bookings with matching meetings
    if (query.status || query.date) {
      bookingWhere.meetings = { some: meetingWhere };
    }

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: bookingWhere,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          agency: { select: { id: true, name: true } },
          meetings: {
            where: Object.keys(meetingWhere).length > 0 ? meetingWhere : undefined,
            orderBy: { createdAt: 'desc' },
          },
          meetingProposals: {
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          offer: {
            select: {
              totalPrice: true,
              travelRequest: { select: { destination: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.booking.count({ where: bookingWhere }),
    ]);

    return { data, total };
  }

  async confirmMeeting(
    bookingId: string,
    _managerId: string,
  ): Promise<MeetingResult> {
    const meeting = await this.meetingService.findActiveByBookingId(bookingId);
    if (!meeting) {
      throw new DomainException('No active meeting found for this booking.');
    }
    return this.meetingService.confirm(meeting.id);
  }

  async completeMeeting(
    bookingId: string,
    dto: CompleteMeetingDto,
    managerId: string,
  ): Promise<TransitionResult> {
    const meeting = await this.meetingService.findActiveByBookingId(bookingId);
    if (!meeting) {
      throw new DomainException('No active meeting found for this booking.');
    }

    const meetingResult = await this.meetingService.complete(meeting.id);
    if (!meetingResult.success) {
      return {
        success: false,
        error: meetingResult.error,
        notifications: [],
      };
    }

    // Transition booking: MEETING_SCHEDULED → PAYMENT_PENDING
    return this.stateMachine.transition(
      bookingId,
      BookingStatus.PAYMENT_PENDING,
      {
        triggeredBy: managerId,
        metadata: {
          notes: dto.notes,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod ?? 'CASH',
        },
      },
    );
  }

  async counterProposeMeeting(
    bookingId: string,
    dto: CounterProposeMeetingDto,
    managerId: string,
  ): Promise<ProposalResult> {
    const activeProposal =
      await this.proposalService.getActiveProposal(bookingId);

    if (!activeProposal) {
      throw new DomainException(
        'No active proposal found for this booking to counter.',
      );
    }

    return this.proposalService.counterProposal(activeProposal.id, {
      bookingId,
      proposedBy: managerId,
      proposerRole: MeetingProposer.MANAGER,
      proposedDate: new Date(dto.dateTime),
      proposedLocation: dto.location,
      notes: dto.notes,
    });
  }

  async cancelMeeting(
    bookingId: string,
    dto: CancelMeetingDto,
    _managerId: string,
  ): Promise<MeetingResult> {
    const meeting = await this.meetingService.findActiveByBookingId(bookingId);
    if (!meeting) {
      throw new DomainException('No active meeting found for this booking.');
    }
    return this.meetingService.cancel(meeting.id);
  }

  // -----------------------------------------------------------------------
  // Calendar
  // -----------------------------------------------------------------------

  async getCalendarEvents(
    query: AdminCalendarQueryDto,
  ): Promise<CalendarEvent[]> {
    const where: Prisma.MeetingWhereInput = {
      scheduledAt: {
        gte: new Date(query.from),
        lte: new Date(query.to),
      },
      status: {
        in: [
          MeetingStatus.SCHEDULED,
          MeetingStatus.CONFIRMED,
          MeetingStatus.COMPLETED,
        ],
      },
    };

    if (query.managerId) {
      where.scheduledBy = query.managerId;
    }

    const meetings = await this.prisma.meeting.findMany({
      where,
      include: {
        booking: {
          include: {
            user: { select: { firstName: true, lastName: true } },
            agency: { select: { name: true } },
            offer: {
              select: {
                travelRequest: { select: { destination: true } },
              },
            },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return meetings.map((m) => this.toCalendarEvent(m));
  }

  async rescheduleMeeting(
    bookingId: string,
    dto: RescheduleMeetingDto,
    _managerId: string,
  ): Promise<MeetingResult> {
    const meeting =
      await this.meetingService.findActiveByBookingId(bookingId);
    if (!meeting) {
      throw new DomainException('No active meeting found for this booking.');
    }

    const newDate = new Date(dto.dateTime);
    const conflict = await this.meetingService.hasConflict(
      meeting.scheduledBy,
      newDate,
      meeting.id,
    );

    if (conflict) {
      return {
        success: false,
        error: `Time conflict: another meeting is scheduled at ${conflict.scheduledAt.toISOString()}.`,
      };
    }

    return this.meetingService.reschedule(meeting.id, {
      scheduledAt: newDate,
      location: dto.location,
      notes: dto.notes,
    });
  }

  // -----------------------------------------------------------------------
  // Analytics — Defensive Data Pattern
  //
  // Contract: these methods NEVER throw. Every code path returns valid
  // typed data. Sub-sections degrade independently — a failed trends query
  // still returns funnel + revenue. A failed per-agency query returns that
  // agency with zero metrics, not a blown-up response.
  // -----------------------------------------------------------------------

  private static readonly EMPTY_FUNNEL = {
    travelRequests: 0,
    withOffers: 0,
    withBookings: 0,
    withMeetings: 0,
    paid: 0,
    completed: 0,
  };

  private static readonly EMPTY_REVENUE = {
    total: 0,
    average: 0,
    count: 0,
    byCurrency: [] as { currency: string; total: number }[],
  };

  private static readonly EMPTY_RESPONSE_TIMES = {
    avgOfferResponseHours: null as number | null,
    avgAgencyConfirmHours: null as number | null,
  };

  /** Convert any value to a finite number, falling back to `fallback`. */
  private safeNum(val: unknown, fallback = 0): number {
    if (val == null) return fallback;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Safe integer division returning 0 on divide-by-zero. */
  private safeRatio(numerator: number, denominator: number): number {
    return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
  }

  private parseDateRange(query: AdminAnalyticsQueryDto): { from: Date; to: Date } {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = query.from ? new Date(query.from) : defaultFrom;
    const to = query.to ? new Date(query.to) : now;

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return { from: defaultFrom, to: now };
    }

    // Ensure 'to' covers the full day when only a date string is passed
    if (to.getHours() === 0 && to.getMinutes() === 0 && to.getSeconds() === 0) {
      to.setHours(23, 59, 59, 999);
    }

    return { from, to };
  }

  // ---- Overview -----------------------------------------------------------

  async getOverviewAnalytics(query: AdminAnalyticsQueryDto) {
    const { from, to } = this.parseDateRange(query);
    const dateFilter = { createdAt: { gte: from, lte: to } };

    // Section 1: Funnel counts
    let funnel = { ...AdminService.EMPTY_FUNNEL };
    try {
      const [
        travelRequests,
        withOffers,
        withBookings,
        withMeetings,
        paid,
        completed,
      ] = await Promise.all([
        this.prisma.travelRequest.count({ where: dateFilter }),
        this.prisma.travelRequest.count({
          where: { ...dateFilter, offers: { some: {} } },
        }),
        this.prisma.booking.count({ where: dateFilter }),
        this.prisma.booking.count({
          where: { ...dateFilter, meetings: { some: {} } },
        }),
        this.prisma.booking.count({
          where: {
            ...dateFilter,
            status: {
              in: [
                BookingStatus.PAID,
                BookingStatus.IN_PROGRESS,
                BookingStatus.COMPLETED,
              ],
            },
          },
        }),
        this.prisma.booking.count({
          where: { ...dateFilter, status: BookingStatus.COMPLETED },
        }),
      ]);
      funnel = { travelRequests, withOffers, withBookings, withMeetings, paid, completed };
    } catch (err) {
      console.warn('[Analytics] funnel query failed:', (err as Error).message);
    }

    // Section 2: Revenue
    let revenue = { ...AdminService.EMPTY_REVENUE };
    try {
      const paidStatuses = [
        BookingStatus.PAID,
        BookingStatus.IN_PROGRESS,
        BookingStatus.COMPLETED,
      ];

      const revenueAgg = await this.prisma.booking.aggregate({
        where: { ...dateFilter, status: { in: paidStatuses } },
        _sum: { totalPrice: true },
        _avg: { totalPrice: true },
        _count: true,
      });

      const revenueByCurrency = await this.prisma.booking.groupBy({
        by: ['currency'],
        where: { ...dateFilter, status: { in: paidStatuses } },
        _sum: { totalPrice: true },
      });

      revenue = {
        total: this.safeNum(revenueAgg._sum.totalPrice),
        average: this.safeNum(revenueAgg._avg.totalPrice),
        count: revenueAgg._count ?? 0,
        byCurrency: revenueByCurrency.map((r) => ({
          currency: r.currency,
          total: this.safeNum(r._sum.totalPrice),
        })),
      };
    } catch (err) {
      console.warn('[Analytics] revenue query failed:', (err as Error).message);
    }

    // Section 3: Trends
    let trends: { date: string; travelRequests: number; offers: number; bookings: number }[] = [];
    try {
      const [trendsTr, trendsOffers, trendsBookings] = await Promise.all([
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_TRUNC('day', "createdAt")::date::text AS date, COUNT(*) AS count
          FROM "travel_requests"
          WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date`,
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_TRUNC('day', "createdAt")::date::text AS date, COUNT(*) AS count
          FROM "offers"
          WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date`,
        this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT DATE_TRUNC('day', "createdAt")::date::text AS date, COUNT(*) AS count
          FROM "bookings"
          WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date`,
      ]);

      const trendMap = new Map<string, { travelRequests: number; offers: number; bookings: number }>();
      for (const r of trendsTr) {
        const e = trendMap.get(r.date) ?? { travelRequests: 0, offers: 0, bookings: 0 };
        e.travelRequests = this.safeNum(r.count);
        trendMap.set(r.date, e);
      }
      for (const r of trendsOffers) {
        const e = trendMap.get(r.date) ?? { travelRequests: 0, offers: 0, bookings: 0 };
        e.offers = this.safeNum(r.count);
        trendMap.set(r.date, e);
      }
      for (const r of trendsBookings) {
        const e = trendMap.get(r.date) ?? { travelRequests: 0, offers: 0, bookings: 0 };
        e.bookings = this.safeNum(r.count);
        trendMap.set(r.date, e);
      }

      trends = Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts }));
    } catch (err) {
      console.warn('[Analytics] trends query failed:', (err as Error).message);
    }

    // Section 4: Response times
    const responseTimes = { ...AdminService.EMPTY_RESPONSE_TIMES };
    try {
      const rows: { avg_hours: number | null }[] = await this.prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM ("respondedAt" - "distributedAt")) / 3600) AS avg_hours
        FROM "rfq_distributions"
        WHERE "respondedAt" IS NOT NULL
          AND "distributedAt" >= ${from} AND "distributedAt" <= ${to}`;
      if (rows[0]?.avg_hours != null) {
        responseTimes.avgOfferResponseHours = this.safeNum(rows[0].avg_hours, 0);
      }
    } catch (err) {
      console.warn('[Analytics] offer response time query failed:', (err as Error).message);
    }

    try {
      const rows: { avg_hours: number | null }[] = await this.prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM (e2."createdAt" - e1."createdAt")) / 3600) AS avg_hours
        FROM "booking_events" e1
        JOIN "booking_events" e2 ON e1."bookingId" = e2."bookingId"
        WHERE e1."toStatus" = 'CREATED'
          AND e2."toStatus" = 'AGENCY_CONFIRMED'
          AND e1."createdAt" >= ${from} AND e1."createdAt" <= ${to}`;
      if (rows[0]?.avg_hours != null) {
        responseTimes.avgAgencyConfirmHours = this.safeNum(rows[0].avg_hours, 0);
      }
    } catch (err) {
      console.warn('[Analytics] agency confirm time query failed:', (err as Error).message);
    }

    return { funnel, revenue, trends, responseTimes };
  }

  // ---- Agency analytics ---------------------------------------------------

  async getAgencyAnalytics(query: AdminAnalyticsQueryDto) {
    const { from, to } = this.parseDateRange(query);

    let agencies: { id: string; name: string; status: string }[] = [];
    try {
      agencies = await this.prisma.agency.findMany({
        where: { status: 'APPROVED' },
        select: { id: true, name: true, status: true },
      });
    } catch (err) {
      console.warn('[Analytics] agency list query failed:', (err as Error).message);
      return [];
    }

    if (agencies.length === 0) return [];

    const paidStatuses = [
      BookingStatus.PAID,
      BookingStatus.IN_PROGRESS,
      BookingStatus.COMPLETED,
    ];

    const results = await Promise.all(
      agencies.map(async (agency) => {
        // Default shape — returned if any sub-query fails
        const row = {
          id: agency.id,
          name: agency.name,
          status: agency.status,
          offersCount: 0,
          bookingsCount: 0,
          conversionRate: 0,
          avgResponseHours: null as number | null,
          totalRevenue: 0,
        };

        try {
          const [offers, bookings, revAgg] = await Promise.all([
            this.prisma.offer.count({
              where: { agencyId: agency.id, createdAt: { gte: from, lte: to } },
            }),
            this.prisma.booking.count({
              where: {
                agencyId: agency.id,
                createdAt: { gte: from, lte: to },
                status: {
                  notIn: [
                    BookingStatus.CREATED,
                    BookingStatus.AWAITING_AGENCY_CONFIRMATION,
                    BookingStatus.REJECTED_BY_AGENCY,
                    BookingStatus.CANCELLED,
                    BookingStatus.EXPIRED,
                  ],
                },
              },
            }),
            this.prisma.booking.aggregate({
              where: {
                agencyId: agency.id,
                createdAt: { gte: from, lte: to },
                status: { in: paidStatuses },
              },
              _sum: { totalPrice: true },
            }),
          ]);

          row.offersCount = offers;
          row.bookingsCount = bookings;
          row.conversionRate = this.safeRatio(bookings, offers);
          row.totalRevenue = this.safeNum(revAgg._sum.totalPrice);
        } catch (err) {
          console.warn(`[Analytics] agency ${agency.id} counts failed:`, (err as Error).message);
        }

        try {
          const rows: { avg_hours: number | null }[] = await this.prisma.$queryRaw`
            SELECT AVG(EXTRACT(EPOCH FROM ("respondedAt" - "distributedAt")) / 3600) AS avg_hours
            FROM "rfq_distributions"
            WHERE "agencyId" = ${agency.id}::uuid
              AND "respondedAt" IS NOT NULL
              AND "distributedAt" >= ${from} AND "distributedAt" <= ${to}`;
          if (rows[0]?.avg_hours != null) {
            row.avgResponseHours = this.safeNum(rows[0].avg_hours, 0);
          }
        } catch (err) {
          console.warn(`[Analytics] agency ${agency.id} response time failed:`, (err as Error).message);
        }

        return row;
      }),
    );

    return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  // ---- Manager analytics --------------------------------------------------

  async getManagerAnalytics(query: AdminAnalyticsQueryDto) {
    const { from, to } = this.parseDateRange(query);

    let managers: { id: string; firstName: string; lastName: string | null }[] = [];
    try {
      managers = await this.prisma.user.findMany({
        where: { role: 'MANAGER', status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true },
      });
    } catch (err) {
      console.warn('[Analytics] manager list query failed:', (err as Error).message);
      return [];
    }

    if (managers.length === 0) return [];

    const results = await Promise.all(
      managers.map(async (manager) => {
        const row = {
          id: manager.id,
          firstName: manager.firstName,
          lastName: manager.lastName,
          bookingsVerified: 0,
          meetingsScheduled: 0,
          meetingsCompleted: 0,
          avgVerifyHours: null as number | null,
        };

        try {
          const [verified, scheduled, completed] = await Promise.all([
            this.prisma.booking.count({
              where: {
                managerVerifiedBy: manager.id,
                managerVerifiedAt: { gte: from, lte: to },
              },
            }),
            this.prisma.meeting.count({
              where: { scheduledBy: manager.id, createdAt: { gte: from, lte: to } },
            }),
            this.prisma.meeting.count({
              where: {
                scheduledBy: manager.id,
                status: MeetingStatus.COMPLETED,
                createdAt: { gte: from, lte: to },
              },
            }),
          ]);
          row.bookingsVerified = verified;
          row.meetingsScheduled = scheduled;
          row.meetingsCompleted = completed;
        } catch (err) {
          console.warn(`[Analytics] manager ${manager.id} counts failed:`, (err as Error).message);
        }

        try {
          const rows: { avg_hours: number | null }[] = await this.prisma.$queryRaw`
            SELECT AVG(EXTRACT(EPOCH FROM (e2."createdAt" - e1."createdAt")) / 3600) AS avg_hours
            FROM "booking_events" e1
            JOIN "booking_events" e2 ON e1."bookingId" = e2."bookingId"
            JOIN "bookings" b ON b.id = e1."bookingId"
            WHERE e1."toStatus" = 'AGENCY_CONFIRMED'
              AND e2."toStatus" = 'MANAGER_VERIFIED'
              AND b."managerVerifiedBy" = ${manager.id}::uuid
              AND e1."createdAt" >= ${from} AND e1."createdAt" <= ${to}`;
          if (rows[0]?.avg_hours != null) {
            row.avgVerifyHours = this.safeNum(rows[0].avg_hours, 0);
          }
        } catch (err) {
          console.warn(`[Analytics] manager ${manager.id} verify time failed:`, (err as Error).message);
        }

        return row;
      }),
    );

    return results.sort((a, b) => b.bookingsVerified - a.bookingsVerified);
  }

  // -----------------------------------------------------------------------
  // Agencies
  // -----------------------------------------------------------------------

  async findAgencies(query: AdminAgenciesQueryDto) {
    const where: Prisma.AgencyWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { contactEmail: { contains: query.q, mode: 'insensitive' } },
        { contactPhone: { contains: query.q } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.agency.findMany({
        where,
        include: {
          verifiedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: {
              offers: true,
              bookings: true,
              memberships: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.agency.count({ where }),
    ]);

    return { data, total };
  }

  async findAgencyById(id: string) {
    const agency = await this.prisma.agency.findUnique({
      where: { id },
      include: {
        verifiedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, telegramId: true },
            },
          },
        },
        _count: {
          select: {
            offers: true,
            bookings: true,
            memberships: true,
            rfqDistributions: true,
          },
        },
      },
    });

    if (!agency) {
      throw new NotFoundException(`Agency ${id} not found.`);
    }

    return agency;
  }

  async verifyAgency(id: string, dto: VerifyAgencyDto, managerId: string) {
    const agency = await this.prisma.agency.findUnique({ where: { id } });
    if (!agency) {
      throw new NotFoundException(`Agency ${id} not found.`);
    }

    const statusMap: Record<VerifyAgencyDto['action'], AgencyStatus> = {
      APPROVE: AgencyStatus.APPROVED,
      REJECT: AgencyStatus.REJECTED,
      BLOCK: AgencyStatus.BLOCKED,
    };

    const newStatus = statusMap[dto.action];

    const updateData: Prisma.AgencyUpdateInput = {
      status: newStatus,
      verifiedAt: new Date(),
      verifiedBy: { connect: { id: managerId } },
    };

    if (dto.action === 'REJECT' && dto.reason) {
      updateData.rejectionReason = dto.reason;
    } else if (dto.action === 'APPROVE') {
      updateData.rejectionReason = null;
    }

    if (dto.action === 'BLOCK' && dto.reason) {
      updateData.rejectionReason = dto.reason;
    }

    const updated = await this.prisma.agency.update({
      where: { id },
      data: updateData,
    });

    return { success: true, agency: updated };
  }

  async setTrustBadge(id: string, dto: TrustBadgeDto) {
    const agency = await this.prisma.agency.findUnique({ where: { id } });
    if (!agency) {
      throw new NotFoundException(`Agency ${id} not found.`);
    }

    const updated = await this.prisma.agency.update({
      where: { id },
      data: { trustBadge: dto.enabled },
    });

    return { success: true, agency: updated };
  }

  // -----------------------------------------------------------------------
  // Agency Performance
  // -----------------------------------------------------------------------

  /**
   * Computes performance metrics for a single agency.
   * Uses 2 Prisma queries + 1 raw SQL (response time) — no N+1.
   */
  async getAgencyPerformance(agencyId: string, query: AgencyPerformanceQueryDto) {
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { id: true, name: true },
    });
    if (!agency) {
      throw new NotFoundException(`Agency ${agencyId} not found.`);
    }

    const { from, to } = this.parseDateRange(query);
    const dateFilter = { createdAt: { gte: from, lte: to } };

    // Batch: offers count + avg price, bookings count, cancellations — 3 parallel Prisma queries
    let offersSent = 0;
    let avgOfferPrice: number | null = null;
    let bookingsWon = 0;
    let totalRevenue = 0;
    let cancellations = 0;

    try {
      const [offerAgg, bookingCount, cancelCount, revenueAgg] = await Promise.all([
        this.prisma.offer.aggregate({
          where: { agencyId, ...dateFilter },
          _count: true,
          _avg: { totalPrice: true },
        }),
        this.prisma.booking.count({
          where: {
            agencyId,
            ...dateFilter,
            status: {
              in: [
                BookingStatus.AGENCY_CONFIRMED,
                BookingStatus.MANAGER_VERIFIED,
                BookingStatus.MEETING_SCHEDULED,
                BookingStatus.PAYMENT_PENDING,
                BookingStatus.PAID,
                BookingStatus.IN_PROGRESS,
                BookingStatus.COMPLETED,
              ],
            },
          },
        }),
        this.prisma.booking.count({
          where: {
            agencyId,
            ...dateFilter,
            status: {
              in: [BookingStatus.CANCELLED, BookingStatus.REJECTED_BY_AGENCY],
            },
          },
        }),
        this.prisma.booking.aggregate({
          where: {
            agencyId,
            ...dateFilter,
            status: {
              in: [BookingStatus.PAID, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED],
            },
          },
          _sum: { totalPrice: true },
        }),
      ]);

      offersSent = offerAgg._count ?? 0;
      avgOfferPrice = offerAgg._avg.totalPrice != null
        ? this.safeNum(offerAgg._avg.totalPrice)
        : null;
      bookingsWon = bookingCount;
      cancellations = cancelCount;
      totalRevenue = this.safeNum(revenueAgg._sum.totalPrice);
    } catch (err) {
      console.warn(`[Performance] agency ${agencyId} counts failed:`, (err as Error).message);
    }

    // Raw SQL: avg response time (RFQ distributed → offer submitted)
    let avgResponseHours: number | null = null;
    try {
      const rows: { avg_hours: number | null }[] = await this.prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM ("respondedAt" - "distributedAt")) / 3600) AS avg_hours
        FROM "rfq_distributions"
        WHERE "agencyId" = ${agencyId}::uuid
          AND "respondedAt" IS NOT NULL
          AND "distributedAt" >= ${from} AND "distributedAt" <= ${to}`;
      if (rows[0]?.avg_hours != null) {
        avgResponseHours = Math.round(this.safeNum(rows[0].avg_hours) * 10) / 10;
      }
    } catch (err) {
      console.warn(`[Performance] agency ${agencyId} response time failed:`, (err as Error).message);
    }

    const winRate = this.safeRatio(bookingsWon, offersSent);
    const totalBookings = bookingsWon + cancellations;
    const cancellationRate = this.safeRatio(cancellations, totalBookings);

    return {
      agencyId: agency.id,
      agencyName: agency.name,
      offersSent,
      bookingsWon,
      winRate,
      avgOfferPrice,
      avgResponseHours,
      totalRevenue,
      cancellationRate,
    };
  }

  /**
   * Ranking of all approved agencies by performance.
   * Single raw SQL query — avoids N+1 by computing everything in one pass.
   * Results cached in Redis for 5 min.
   */
  async getAgencyPerformanceRanking(query: AgencyRankingQueryDto) {
    const { from, to } = this.parseDateRange(query);
    const sort = query.sort ?? 'revenue';
    const cacheKey = `admin:agency-ranking:${from.toISOString()}:${to.toISOString()}:${sort}`;

    // Check cache
    const cached = await this.cache.get<AgencyPerformanceRow[]>(cacheKey);
    if (cached) return cached;

    // Single aggregation query — all agencies in one pass
    // Why raw SQL: Need LEFT JOINs across 3 tables (offers, bookings,
    // rfq_distributions) grouped by agency, which Prisma can't express
    // in a single query without N+1.
    const rows: AgencyPerformanceRawRow[] = await this.prisma.$queryRaw`
      SELECT
        a."id"                AS "agencyId",
        a."name"              AS "agencyName",
        a."trustBadge"        AS "trustBadge",
        COALESCE(o."cnt", 0)  AS "offersSent",
        COALESCE(b."won", 0)  AS "bookingsWon",
        COALESCE(b."cancelled", 0) AS "cancellations",
        o."avgPrice"          AS "avgOfferPrice",
        COALESCE(b."revenue", 0) AS "totalRevenue",
        r."avgHours"          AS "avgResponseHours"
      FROM "agencies" a
      LEFT JOIN (
        SELECT "agencyId",
               COUNT(*)::int                         AS "cnt",
               AVG("totalPrice")                     AS "avgPrice"
        FROM "offers"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY "agencyId"
      ) o ON o."agencyId" = a."id"
      LEFT JOIN (
        SELECT "agencyId",
               COUNT(*) FILTER (WHERE "status" NOT IN ('CANCELLED', 'REJECTED_BY_AGENCY', 'EXPIRED'))::int AS "won",
               COUNT(*) FILTER (WHERE "status" IN ('CANCELLED', 'REJECTED_BY_AGENCY'))::int                AS "cancelled",
               SUM("totalPrice") FILTER (WHERE "status" IN ('PAID', 'IN_PROGRESS', 'COMPLETED'))           AS "revenue"
        FROM "bookings"
        WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
        GROUP BY "agencyId"
      ) b ON b."agencyId" = a."id"
      LEFT JOIN (
        SELECT "agencyId",
               AVG(EXTRACT(EPOCH FROM ("respondedAt" - "distributedAt")) / 3600) AS "avgHours"
        FROM "rfq_distributions"
        WHERE "respondedAt" IS NOT NULL
          AND "distributedAt" >= ${from} AND "distributedAt" <= ${to}
        GROUP BY "agencyId"
      ) r ON r."agencyId" = a."id"
      WHERE a."status" = 'APPROVED'
      ORDER BY a."name"`;

    const results: AgencyPerformanceRow[] = rows.map((row) => {
      const offersSent = this.safeNum(row.offersSent);
      const bookingsWon = this.safeNum(row.bookingsWon);
      const cancellations = this.safeNum(row.cancellations);
      const totalBookings = bookingsWon + cancellations;

      return {
        agencyId: row.agencyId,
        agencyName: row.agencyName,
        trustBadge: row.trustBadge ?? false,
        offersSent,
        bookingsWon,
        winRate: this.safeRatio(bookingsWon, offersSent),
        avgOfferPrice: row.avgOfferPrice != null
          ? Math.round(this.safeNum(row.avgOfferPrice) * 100) / 100
          : null,
        avgResponseHours: row.avgResponseHours != null
          ? Math.round(this.safeNum(row.avgResponseHours) * 10) / 10
          : null,
        totalRevenue: this.safeNum(row.totalRevenue),
        cancellationRate: this.safeRatio(cancellations, totalBookings),
      };
    });

    // Sort
    const sortFns: Record<string, (a: AgencyPerformanceRow, b: AgencyPerformanceRow) => number> = {
      revenue: (a, b) => b.totalRevenue - a.totalRevenue,
      winRate: (a, b) => b.winRate - a.winRate,
      offersSent: (a, b) => b.offersSent - a.offersSent,
      avgResponseTime: (a, b) => (a.avgResponseHours ?? Infinity) - (b.avgResponseHours ?? Infinity),
    };
    results.sort(sortFns[sort] ?? sortFns.revenue);

    // Cache for 5 minutes
    await this.cache.set(cacheKey, results, 300);

    return results;
  }

  // -----------------------------------------------------------------------
  // Travelers CRM
  // -----------------------------------------------------------------------

  async findTravelers(query: AdminTravelersQueryDto) {
    const where: Prisma.UserWhereInput = { role: 'TRAVELER' };

    if (query.vip !== undefined) {
      where.vip = query.vip;
    }

    if (query.blacklisted !== undefined) {
      where.blacklisted = query.blacklisted;
    }

    if (query.q) {
      const search = query.q.trim();
      // Try exact telegramId match first (numeric search)
      const telegramIdMatch = /^\d+$/.test(search) ? BigInt(search) : null;

      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        ...(telegramIdMatch ? [{ telegramId: telegramIdMatch }] : []),
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          telegramId: true,
          firstName: true,
          lastName: true,
          phone: true,
          preferredLanguage: true,
          vip: true,
          blacklisted: true,
          blacklistReason: true,
          createdAt: true,
          _count: {
            select: { travelRequests: true, bookings: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Serialize BigInt telegramId to string for JSON
    const items = data.map((u) => ({
      ...u,
      telegramId: u.telegramId.toString(),
    }));

    return { data: items, total };
  }

  async findTravelerById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        telegramId: true,
        firstName: true,
        lastName: true,
        phone: true,
        preferredLanguage: true,
        role: true,
        status: true,
        vip: true,
        blacklisted: true,
        blacklistReason: true,
        createdAt: true,
        travelRequests: {
          select: {
            id: true,
            status: true,
            destination: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' as const },
          take: 5,
        },
        bookings: {
          select: {
            id: true,
            status: true,
            totalPrice: true,
            currency: true,
            agency: { select: { name: true } },
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' as const },
          take: 5,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Traveler ${id} not found.`);
    }

    return {
      ...user,
      telegramId: user.telegramId.toString(),
    };
  }

  async setVip(id: string, dto: SetVipDto, _managerId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Traveler ${id} not found.`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { vip: dto.enabled },
    });

    return { success: true, user: updated };
  }

  async setBlacklist(id: string, dto: SetBlacklistDto, _managerId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Traveler ${id} not found.`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        blacklisted: dto.enabled,
        blacklistReason: dto.enabled ? (dto.reason ?? null) : null,
      },
    });

    return { success: true, user: updated };
  }

  // -----------------------------------------------------------------------
  // Manager Notes
  // -----------------------------------------------------------------------

  async findNotes(query: NotesQueryDto) {
    const notes = await this.prisma.managerNote.findMany({
      where: {
        entityType: query.entityType,
        entityId: query.entityId,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notes;
  }

  async createNote(dto: CreateNoteDto, authorId: string) {
    const note = await this.prisma.managerNote.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        text: dto.text,
        authorId,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return note;
  }

  async deleteNote(noteId: string, requesterId: string) {
    const note = await this.prisma.managerNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found.`);
    }

    // Only the author or an admin can delete
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });

    if (note.authorId !== requesterId && requester?.role !== 'ADMIN') {
      throw new DomainException('Only the note author or an admin can delete this note.');
    }

    await this.prisma.managerNote.delete({ where: { id: noteId } });

    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Risk Events
  // -----------------------------------------------------------------------

  async findRiskEvents(query: AdminRiskEventsQueryDto) {
    const where: Prisma.RiskEventWhereInput = {};

    if (query.severity) where.severity = query.severity;
    if (query.entityType) where.entityType = query.entityType;

    const [data, total] = await Promise.all([
      this.prisma.riskEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.riskEvent.count({ where }),
    ]);

    return { data, total };
  }

  async findRiskEventById(id: string) {
    const event = await this.prisma.riskEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Risk event not found.');
    return event;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private toCalendarEvent(meeting: {
    id: string;
    status: MeetingStatus;
    scheduledAt: Date;
    location: string | null;
    notes: string | null;
    booking: {
      id: string;
      user: { firstName: string; lastName: string | null };
      agency: { name: string };
      offer: { travelRequest: { destination: string | null } | null };
    };
  }): CalendarEvent {
    const durationMs = DEFAULT_MEETING_DURATION_MINUTES * 60 * 1000;
    const userName = [
      meeting.booking.user.firstName,
      meeting.booking.user.lastName,
    ]
      .filter(Boolean)
      .join(' ');
    const destination =
      meeting.booking.offer.travelRequest?.destination ?? null;

    return {
      id: meeting.id,
      title: `${userName} — ${destination ?? 'TBD'}`,
      start: meeting.scheduledAt.toISOString(),
      end: new Date(meeting.scheduledAt.getTime() + durationMs).toISOString(),
      status: meeting.status,
      color: MEETING_CALENDAR_COLORS[meeting.status] ?? '#909399',
      extendedProps: {
        bookingId: meeting.booking.id,
        meetingId: meeting.id,
        userName,
        agencyName: meeting.booking.agency.name,
        destination,
        location: meeting.location,
        notes: meeting.notes,
        status: meeting.status,
      },
    };
  }
}
