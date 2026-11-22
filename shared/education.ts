export function commercialDate(instant: number): string {
  return new Date(instant - 10800000).toISOString().slice(0, 10);
}
export interface EducationPerson {
  id: number;
  public_id: string;
  nombre: string;
  apellido: string;
  activo: number;
}
export interface DigitalRight {
  id: string;
  activityId: number;
  activity: string;
  startsAt: number;
  endsAt: number;
  revokedAt: number | null;
  status: 'scheduled' | 'active' | 'expired' | 'revoked';
}
export interface EducationSnapshot {
  participantLink?: {
    userId: string;
    displayName: string;
    status: 'enabled' | 'disabled';
    enabled: number;
  } | null;
  revision: number;
  now: number;
  person: EducationPerson;
  activities: { id: number; name: string; active: number }[];
  presential: { activityId: number; activity: string; enabled: number }[];
  enrollments: { activity: string; year: number; month: number }[];
  rights: DigitalRight[];
}
export interface EducationReceipt {
  userId?: string;
  operationId: string;
  actorId: string;
  actorName: string;
  createdAt: number;
  kind: string;
  reason: string;
  activityId?: number;
  rightId?: string;
  verificationReference?: string;
  paymentDeclared: boolean;
  accountedPayment: false;
  result: {
    revision: number;
    rightId?: string;
    startsAt?: number;
    endsAt?: number;
    action?: 'grant' | 'renewal' | 'revoke' | 'link' | 'presential';
    previousEnd?: number | null;
    revokedAt?: number;
  };
}
export interface EducationHistory {
  rows: EducationReceipt[];
  page: number;
  hasMore: boolean;
}
export interface DigitalPreview {
  revision: number;
  person: EducationPerson;
  activity: { id: number; name: string };
  previousEnd: number | null;
  startsAt: number;
  endsAt: number;
  expectedWindow: { startDate: string; endDate: string };
}
