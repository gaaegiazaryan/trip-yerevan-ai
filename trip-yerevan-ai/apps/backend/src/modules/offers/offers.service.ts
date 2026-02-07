import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Offer, OfferStatus, Prisma } from '@prisma/client';

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Offer | null> {
    return this.prisma.offer.findUnique({
      where: { id },
      include: { items: true, agency: true },
    });
  }

  async findByTravelRequestId(travelRequestId: string): Promise<Offer[]> {
    return this.prisma.offer.findMany({
      where: { travelRequestId },
      include: { items: true, agency: true },
      orderBy: { totalPrice: 'asc' },
    });
  }

  async create(
    data: Prisma.OfferCreateInput,
    items: Prisma.OfferItemCreateWithoutOfferInput[],
  ): Promise<Offer> {
    return this.prisma.offer.create({
      data: {
        ...data,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  async updateStatus(id: string, status: OfferStatus): Promise<Offer> {
    return this.prisma.offer.update({
      where: { id },
      data: { status },
    });
  }

  async rejectAllExcept(
    travelRequestId: string,
    acceptedOfferId: string,
  ): Promise<void> {
    await this.prisma.offer.updateMany({
      where: {
        travelRequestId,
        id: { not: acceptedOfferId },
        status: { in: [OfferStatus.SUBMITTED, OfferStatus.VIEWED] },
      },
      data: { status: OfferStatus.REJECTED },
    });
  }
}
