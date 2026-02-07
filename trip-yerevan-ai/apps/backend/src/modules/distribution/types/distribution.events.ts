import { RfqNotificationPayload, AgencyMatchResult } from './distribution.types';

/**
 * Domain event: emitted when a TravelRequest has been distributed to agencies.
 *
 * Not yet integrated with an external event bus — stored in-memory for
 * logging and future EventEmitter2 / CQRS integration.
 */
export class TravelRequestDistributedEvent {
  public readonly eventName = 'travel-request.distributed' as const;
  public readonly occurredAt: Date;

  constructor(
    public readonly travelRequestId: string,
    public readonly userId: string,
    public readonly matchedAgencies: AgencyMatchResult[],
    public readonly notification: RfqNotificationPayload,
  ) {
    this.occurredAt = new Date();
  }

  get agencyCount(): number {
    return this.matchedAgencies.length;
  }

  get agencyIds(): string[] {
    return this.matchedAgencies.map((a) => a.agencyId);
  }
}
