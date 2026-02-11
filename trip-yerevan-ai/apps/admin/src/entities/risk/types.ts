export type RiskSeverity = 'LOW' | 'MED' | 'HIGH';
export type RiskEntityType = 'USER' | 'AGENCY' | 'PROXY_CHAT' | 'BOOKING';

export interface RiskEvent {
  id: string;
  entityType: RiskEntityType;
  entityId: string;
  severity: RiskSeverity;
  reason: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface RiskEventsQuery {
  severity?: RiskSeverity;
  entityType?: RiskEntityType;
  page?: number;
  limit?: number;
}
