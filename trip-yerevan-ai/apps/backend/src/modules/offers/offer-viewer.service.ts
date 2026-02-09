import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OfferStatus } from '@prisma/client';
import {
  formatOfferListPage,
  formatOfferDetail,
  OFFERS_PAGE_SIZE,
} from './offer-formatter';

export interface OfferListResult {
  text: string;
  buttons: { label: string; callbackData: string }[];
  totalOffers: number;
  page: number;
  totalPages: number;
  travelRequestId: string;
}

export interface OfferDetailResult {
  text: string;
  buttons: { label: string; callbackData: string }[];
  imageFileIds: string[];
  documentFileIds: { fileId: string; fileName?: string }[];
  travelRequestId: string;
}

export interface OfferViewError {
  text: string;
  buttons?: undefined;
}

@Injectable()
export class OfferViewerService {
  private readonly logger = new Logger(OfferViewerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOfferList(
    travelRequestId: string,
    userId: string,
    page: number = 0,
  ): Promise<OfferListResult | OfferViewError> {
    const travelRequest = await this.prisma.travelRequest.findUnique({
      where: { id: travelRequestId },
      select: {
        id: true,
        userId: true,
        destination: true,
        departureDate: true,
        returnDate: true,
        adults: true,
        children: true,
      },
    });

    if (!travelRequest) {
      this.logger.warn(
        `[offer-list] action=not_found, requestId=${travelRequestId}, userId=${userId}`,
      );
      return { text: 'Travel request not found.' };
    }

    if (travelRequest.userId !== userId) {
      this.logger.warn(
        `[offer-list] action=unauthorized, requestId=${travelRequestId}, userId=${userId}, ownerId=${travelRequest.userId}`,
      );
      return { text: 'You are not authorized to view these offers.' };
    }

    const offers = await this.prisma.offer.findMany({
      where: {
        travelRequestId,
        status: {
          in: [OfferStatus.SUBMITTED, OfferStatus.VIEWED, OfferStatus.ACCEPTED],
        },
      },
      include: { agency: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (offers.length === 0) {
      this.logger.log(
        `[offer-list] action=empty, requestId=${travelRequestId}, userId=${userId}`,
      );
      return {
        text: 'No offers yet for this travel request. We will notify you when agencies respond.',
      };
    }

    const totalPages = Math.ceil(offers.length / OFFERS_PAGE_SIZE);
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pageOffers = offers.slice(
      safePage * OFFERS_PAGE_SIZE,
      (safePage + 1) * OFFERS_PAGE_SIZE,
    );

    const text = formatOfferListPage(
      pageOffers,
      travelRequest.destination ?? null,
      safePage,
      totalPages,
      offers.length,
      {
        departureDate: travelRequest.departureDate,
        returnDate: travelRequest.returnDate,
        adults: travelRequest.adults,
        children: travelRequest.children,
      },
    );

    const buttons: { label: string; callbackData: string }[] = [];

    for (const offer of pageOffers) {
      const price = Number(offer.totalPrice).toLocaleString('en-US');
      buttons.push({
        label: `${offer.agency.name} — ${price} ${offer.currency}`,
        callbackData: `offers:d:${offer.id}`,
      });
    }

    if (safePage > 0) {
      buttons.push({
        label: '\u2b05 Previous',
        callbackData: `offers:p:${travelRequestId}:${safePage - 1}`,
      });
    }
    if (safePage < totalPages - 1) {
      buttons.push({
        label: 'Next \u27a1',
        callbackData: `offers:p:${travelRequestId}:${safePage + 1}`,
      });
    }

    buttons.push({
      label: '\u2716 Close',
      callbackData: `offers:close`,
    });

    this.logger.log(
      `[offer-list] action=rendered, requestId=${travelRequestId}, userId=${userId}, page=${safePage}, total=${offers.length}`,
    );

    return {
      text,
      buttons,
      totalOffers: offers.length,
      page: safePage,
      totalPages,
      travelRequestId,
    };
  }

  async getOfferDetail(
    offerId: string,
    userId: string,
  ): Promise<OfferDetailResult | OfferViewError> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        agency: { select: { name: true } },
        travelRequest: { select: { userId: true, id: true } },
        attachments: true,
      },
    });

    if (!offer) {
      this.logger.warn(
        `[offer-detail] action=not_found, offerId=${offerId}, userId=${userId}`,
      );
      return { text: 'Offer not found.' };
    }

    if (offer.travelRequest.userId !== userId) {
      this.logger.warn(
        `[offer-detail] action=unauthorized, offerId=${offerId}, userId=${userId}, ownerId=${offer.travelRequest.userId}`,
      );
      return { text: 'You are not authorized to view this offer.' };
    }

    // Status transition: SUBMITTED → VIEWED
    if (offer.status === OfferStatus.SUBMITTED) {
      await this.prisma.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.VIEWED },
      });
      this.logger.log(
        `[offer-detail] action=status_transition, offerId=${offerId}, from=SUBMITTED, to=VIEWED`,
      );
    }

    const text = formatOfferDetail(offer);

    const imageFileIds = offer.attachments
      .filter((a) => a.type === 'HOTEL_IMAGE')
      .map((a) => a.telegramFileId);

    const documentFileIds = offer.attachments
      .filter((a) => a.type !== 'HOTEL_IMAGE')
      .map((a) => ({
        fileId: a.telegramFileId,
        fileName: a.fileName ?? undefined,
      }));

    const buttons: { label: string; callbackData: string }[] = [
      {
        label: '\u2b05 Back to offers',
        callbackData: `offers:b:${offer.travelRequestId}`,
      },
      {
        label: '\u2753 Ask question',
        callbackData: `offers:ask:${offerId}`,
      },
      {
        label: '\u2705 Accept offer',
        callbackData: `offers:accept:${offerId}`,
      },
    ];

    this.logger.log(
      `[offer-detail] action=rendered, offerId=${offerId}, userId=${userId}, requestId=${offer.travelRequestId}, images=${imageFileIds.length}, docs=${documentFileIds.length}`,
    );

    return {
      text,
      buttons,
      imageFileIds,
      documentFileIds,
      travelRequestId: offer.travelRequestId,
    };
  }
}
