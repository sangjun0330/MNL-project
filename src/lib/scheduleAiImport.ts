import type { ISODate } from "@/lib/date";
import type { CustomShiftDef } from "@/lib/model";
import type { Shift } from "@/lib/types";

export const MAX_SCHEDULE_IMPORT_IMAGE_BYTES = 6 * 1024 * 1024;

export type ScheduleAIImportMode = "detect" | "resolve_person";

export type ScheduleAIEntry = {
  isoDate: ISODate;
  semanticType: Shift;
  displayName: string;
  rawText: string;
};

export type ScheduleAIUnknownCode = {
  isoDate: ISODate;
  rawText: string;
};

export type ScheduleAIImportRequest = {
  mode: ScheduleAIImportMode;
  imageDataUrl: string;
  selectedPerson?: string;
  yearMonthHint?: string;
  locale?: "ko" | "en";
  customShiftTypes?: CustomShiftDef[];
};

export type ScheduleAIImportResponse = {
  status: "person_required" | "review_ready";
  yearMonth: string | null;
  people: string[];
  selectedPerson: string | null;
  schedule: Record<ISODate, ScheduleAIEntry>;
  unresolved: ScheduleAIUnknownCode[];
  warnings: string[];
  model: string;
};

export function isYearMonth(value: unknown): value is `${number}-${string}` {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value.trim());
}

export function normalizeYearMonth(value: unknown) {
  if (!isYearMonth(value)) return null;
  return value.trim() as `${number}-${string}`;
}

export function estimateDataUrlBytes(value: string) {
  const trimmed = String(value ?? "").trim();
  const commaIndex = trimmed.indexOf(",");
  if (!trimmed.startsWith("data:image/") || commaIndex <= 0) return null;
  const meta = trimmed.slice(0, commaIndex).toLowerCase();
  if (!meta.includes(";base64")) return null;
  const base64 = trimmed.slice(commaIndex + 1).replace(/\s+/g, "");
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
