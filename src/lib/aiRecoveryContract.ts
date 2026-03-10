import type { AIRecoveryResult } from "@/lib/aiRecovery";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { ProfileSettings } from "@/lib/model";
import type { PlannerContext } from "@/lib/recoveryPlanner";
import type { RecoveryPhase } from "@/lib/recoveryPhases";
import type { Shift } from "@/lib/types";

export type AIRecoveryPayload = {
  dateISO: ISODate;
  language: Language;
  phase: RecoveryPhase;
  todayShift: Shift;
  nextShift: Shift | null;
  todayVitalScore: number | null;
  source: "supabase" | "local";
  engine: "openai" | "rule";
  model: string | null;
  debug?: string | null;
  generatedText?: string;
  plannerContext?: PlannerContext;
  profileSnapshot?: Pick<ProfileSettings, "chronotype" | "caffeineSensitivity">;
  result: AIRecoveryResult;
};

export type AIRecoveryApiSuccess = {
  ok: true;
  data: AIRecoveryPayload | null;
};

export type AIRecoveryApiError = {
  ok: false;
  error: string;
};
