import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Booking, BookingStatus, Currency } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Booking | null> {
    return this.prisma.booking.findUnique({
      where: { id },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async findByUserId(userId: string): Promise<Booking[]> {
    return this.prisma.booking.findMany({
      where: { userId },
      include: { offer: { include: { agency: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    travelRequestId: string,
    offerId: string,
    userId: string,
    agencyId: string,
    totalPrice: number,
    currency: Currency,
  ): Promise<Booking> {
    return this.prisma.booking.create({
      data: {
        travelRequestId,
        offerId,
        userId,
        agencyId,
        totalPrice,
        currency,
      },
    });
  }

  async updateStatus(
    id: string,
    status: BookingStatus,
    changedBy: string,
    reason?: string,
  ): Promise<Booking> {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
    });

    return this.prisma.booking.update({
      where: { id },
      data: {
        status,
        confirmedAt:
          status === BookingStatus.CONFIRMED ? new Date() : undefined,
        statusHistory: {
          create: {
            fromStatus: booking.status,
            toStatus: status,
            changedBy,
            reason,
          },
        },
      },
    });
  }
}
