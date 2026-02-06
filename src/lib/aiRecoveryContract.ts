import type { AIRecoveryResult } from "@/lib/aiRecovery";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { Shift } from "@/lib/types";

export type AIRecoveryPayload = {
  dateISO: ISODate;
  language: Language;
  todayShift: Shift;
  nextShift: Shift | null;
  todayVitalScore: number | null;
  source: "supabase" | "local";
  engine: "openai" | "rule";
  model: string | null;
  result: AIRecoveryResult;
};

export type AIRecoveryApiSuccess = {
  ok: true;
  data: AIRecoveryPayload;
};

export type AIRecoveryApiError = {
  ok: false;
  error: string;
};
