import type { Cents } from '@/lib/money';
import type { Bps, OddMilli } from '@/lib/numbers';
import type { IsoDate } from '@/lib/datetime';

export type UserRole = 'ADMIN' | 'PARTNER';
export type EntryStatus = 'OPEN' | 'GREEN' | 'RED' | 'VOID' | 'CASHOUT';
export type TransactionKind = 'CONTRIBUTION' | 'WITHDRAWAL';
export type RiskBase = 'CURRENT' | 'MONTH_START' | 'INITIAL';
export type LimitPolicy = 'BLOCK' | 'WARN';
export type GoalMode = 'AUTO' | 'MANUAL';

export const ENTRY_STATUSES: readonly EntryStatus[] = ['OPEN', 'GREEN', 'RED', 'VOID', 'CASHOUT'];

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  OPEN: 'Aberta',
  GREEN: 'Green',
  RED: 'Red',
  VOID: 'Void',
  CASHOUT: 'Cashout',
};

export const TRANSACTION_KIND_LABEL: Record<TransactionKind, string> = {
  CONTRIBUTION: 'Aporte',
  WITHDRAWAL: 'Retirada',
};

export const RISK_BASE_LABEL: Record<RiskBase, string> = {
  CURRENT: 'Banca atual',
  MONTH_START: 'Banca no início do mês',
  INITIAL: 'Banca inicial configurada',
};

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  PARTNER: 'Sócio',
};

/** Configurações da banca — nenhum valor de negócio é fixo no código. */
export interface BankrollSettings {
  bankrollId: string;
  initialBankrollCents: Cents;
  monthlyGoalCents: Cents;
  targetBankrollCents: Cents;
  activeDays: number;
  dailyGoalMode: GoalMode;
  dailyGoalCents: Cents;
  riskBase: RiskBase;
  maxRiskPerEntryBps: Bps;
  maxStakeCapCents: Cents | null;
  dailyStopBps: Bps;
  weeklyStopBps: Bps;
  monthlyStopBps: Bps;
  stakeLimitPolicy: LimitPolicy;
  stopLimitPolicy: LimitPolicy;
  partnersCanCreateEntries: boolean;
  updatedAt: string;
}

export interface Bankroll {
  id: string;
  name: string;
  timezone: string;
  currency: string;
}

export interface Member {
  id: string;
  bankrollId: string;
  userId: string | null;
  displayName: string;
  shareBps: Bps;
  initialContributionCents: Cents;
  canCreateEntries: boolean;
  isActive: boolean;
  joinedOn: IsoDate;
  userEmail?: string | null;
  userRole?: UserRole | null;
  userIsActive?: boolean | null;
}

export interface Entry {
  id: string;
  bankrollId: string;
  memberId: string;
  memberName: string;
  createdByUserId: string | null;
  createdByName: string | null;
  occurredOn: IsoDate;
  occurredAtTime: string;
  sport: string;
  event: string;
  market: string;
  oddMilli: OddMilli;
  stakeCents: Cents;
  status: EntryStatus;
  payoutCents: Cents;
  profitCents: Cents;
  note: string | null;
  riskOverride: boolean;
  riskOverrideReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  bankrollId: string;
  memberId: string | null;
  memberName: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  kind: TransactionKind;
  amountCents: Cents;
  occurredOn: IsoDate;
  note: string | null;
  createdAt: string;
}

export interface MonthlyGoal {
  bankrollId: string;
  year: number;
  month: number;
  goalCents: Cents;
  activeDays: number;
  dailyGoalCents: Cents;
  targetBankrollCents: Cents;
}

export interface AuditLog {
  id: string;
  bankrollId: string | null;
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: UserRole;
  /** Dono da banca: único que altera banca inicial e metas. */
  isOwner: boolean;
  /** Conta ainda usa a senha padrão — precisa trocar antes de continuar. */
  mustChangePassword: boolean;
  bankrollId: string;
  memberId: string | null;
  canCreateEntries: boolean;
}
