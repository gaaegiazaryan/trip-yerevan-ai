import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma, TravelRequest, TravelRequestStatus } from '@prisma/client';

@Injectable()
export class TravelRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TravelRequest | null> {
    return this.prisma.travelRequest.findUnique({
      where: { id },
      include: { offers: true },
    });
  }

  async findByUserId(userId: string): Promise<TravelRequest[]> {
    return this.prisma.travelRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveByUserId(userId: string): Promise<TravelRequest | null> {
    return this.prisma.travelRequest.findFirst({
      where: {
        userId,
        status: {
          notIn: [
            TravelRequestStatus.BOOKED,
            TravelRequestStatus.COMPLETED,
            TravelRequestStatus.CANCELLED,
            TravelRequestStatus.EXPIRED,
          ],
        },
      },
    });
  }

  async create(data: Prisma.TravelRequestCreateInput): Promise<TravelRequest> {
    return this.prisma.travelRequest.create({ data });
  }

  async updateStatus(
    id: string,
    status: TravelRequestStatus,
  ): Promise<TravelRequest> {
    return this.prisma.travelRequest.update({
      where: { id },
      data: { status },
    });
  }

  async findExpired(): Promise<TravelRequest[]> {
    return this.prisma.travelRequest.findMany({
      where: {
        expiresAt: { lte: new Date() },
        status: {
          notIn: [
            TravelRequestStatus.BOOKED,
            TravelRequestStatus.COMPLETED,
            TravelRequestStatus.CANCELLED,
            TravelRequestStatus.EXPIRED,
          ],
        },
      },
    });
  }
}
