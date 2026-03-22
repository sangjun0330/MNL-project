import type { AIRecoveryResult } from "@/lib/aiRecovery";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { ProfileSettings } from "@/lib/model";
import type { PlannerContext } from "@/lib/recoveryPlanner";
import type { RecoveryPhase } from "@/lib/recoveryPhases";
import type { Shift } from "@/lib/types";
import type { RecoveryCategory, RecoverySeverity } from "@/lib/aiRecovery";

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

const RECOVERY_CATEGORIES = new Set<RecoveryCategory>([
  "sleep",
  "shift",
  "caffeine",
  "menstrual",
  "stress",
  "activity",
]);

const RECOVERY_SEVERITIES = new Set<RecoverySeverity>(["info", "caution", "warning"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeSection(value: unknown) {
  if (!isRecord(value)) return null;
  const categoryRaw = value.category;
  if (typeof categoryRaw !== "string" || !RECOVERY_CATEGORIES.has(categoryRaw as RecoveryCategory)) return null;
  const severityRaw = value.severity;
  return {
    category: categoryRaw as RecoveryCategory,
    severity:
      typeof severityRaw === "string" && RECOVERY_SEVERITIES.has(severityRaw as RecoverySeverity)
        ? (severityRaw as RecoverySeverity)
        : "info",
    title: asString(value.title),
    description: asString(value.description),
    tips: asStringArray(value.tips, 6),
  };
}

function normalizeCompoundAlert(value: unknown) {
  if (!isRecord(value)) return null;
  const message = asString(value.message);
  const factors = asStringArray(value.factors, 5);
  if (!message && !factors.length) return null;
  return { factors, message };
}

function normalizeWeeklySummary(value: unknown) {
  if (!isRecord(value)) return null;
  const topDrains = Array.isArray(value.topDrains)
    ? value.topDrains
        .map((item) => {
          if (!isRecord(item)) return null;
          const label = asString(item.label);
          const pct = Number(item.pct);
          if (!label || !Number.isFinite(pct)) return null;
          return {
            label,
            pct: Math.max(0, Math.min(100, Math.round(pct))),
          };
        })
        .filter((item): item is { label: string; pct: number } => Boolean(item))
        .slice(0, 3)
    : [];
  const personalInsight = asString(value.personalInsight);
  const nextWeekPreview = asString(value.nextWeekPreview);
  const avgBattery = Number(value.avgBattery);
  const prevAvgBattery = Number(value.prevAvgBattery);
  if (!topDrains.length && !personalInsight && !nextWeekPreview) return null;
  return {
    avgBattery: Number.isFinite(avgBattery) ? Math.max(0, Math.min(100, Math.round(avgBattery))) : 0,
    prevAvgBattery: Number.isFinite(prevAvgBattery) ? Math.max(0, Math.min(100, Math.round(prevAvgBattery))) : 0,
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

export function normalizeAIRecoveryResult(value: unknown): AIRecoveryResult | null {
  if (!isRecord(value)) return null;
  const headline = asString(value.headline);
  const sections = Array.isArray(value.sections)
    ? value.sections
        .map((item) => normalizeSection(item))
        .filter((item): item is NonNullable<ReturnType<typeof normalizeSection>> => Boolean(item))
    : [];
  const compoundAlert = normalizeCompoundAlert(value.compoundAlert);
  const weeklySummary = normalizeWeeklySummary(value.weeklySummary);
  if (!headline && !sections.length && !compoundAlert?.message && !weeklySummary) return null;
  return {
    headline,
    compoundAlert,
    sections,
    weeklySummary,
  };
}

export function isValidAIRecoveryPayload(
  payload: AIRecoveryPayload | null | undefined,
  language?: Language,
  phase?: RecoveryPhase
): payload is AIRecoveryPayload {
  if (!payload) return false;
  if (language && payload.language !== language) return false;
  if (phase && payload.phase !== phase) return false;
  if (payload.engine === "openai" && !payload.generatedText?.trim()) return false;
  return Boolean(normalizeAIRecoveryResult(payload.result));
}
