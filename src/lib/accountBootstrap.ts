import type { AIRecoverySlot, AIRecoveryTodaySlots } from "@/lib/aiRecovery";
import type { AppState } from "@/lib/model";

export type RecoverySummary = {
  dateISO: string;
  headline: string | null;
  latestSlot: AIRecoverySlot | null;
  pendingOrderTitle: string | null;
  ordersCompleted: boolean;
  hasAnySession: boolean;
  todaySlots: AIRecoveryTodaySlots;
};

export type BootstrapPayload = {
  onboardingCompleted: boolean;
  consentCompleted: boolean;
  hasStoredState: boolean;
  consent?: unknown | null;
  state: AppState | null;
  stateRevision: number | null;
  bootstrapRevision: number | null;
  updatedAt: number | null;
  recoverySummary: RecoverySummary | null;
  degraded?: boolean;
};
