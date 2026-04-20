import { NextResponse } from "next/server";
import { mergeMedSafetySources, type MedSafetyGroundingMode, type MedSafetyGroundingStatus, type MedSafetySource } from "@/lib/medSafetySources";
import { canonicalizeMedSafetyAnswerText, normalizeMedSafetyAnswerText } from "@/lib/medSafetyAnswerSections";
import type { SubscriptionSnapshot } from "@/lib/server/billingStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MED_SAFETY_RECENT_LIMIT_FREE = 5;
const MED_SAFETY_RECENT_LIMIT_PRO = 20;
const DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS = 30;
const MIN_MED_SAFETY_HISTORY_RETENTION_DAYS = 1;
const MAX_MED_SAFETY_HISTORY_RETENTION_DAYS = 90;

type HistoryRecord = {
  id: string;
  savedAt: number;
  language: "ko" | "en";
  request: {
    query: string;
    mode?: "ward" | "er" | "icu" | null;
    situation?: "general" | "pre_admin" | "during_admin" | "event_response" | null;
    queryIntent?: "medication" | "device" | "scenario" | null;
  };
  result: {
    title: string;
    summary: string;
    answer: string;
    analyzedAt: number;
    resultKind: "medication" | "device" | "scenario";
    model?: string | null;
    source?: "openai_live" | "openai_fallback";
    sources: MedSafetySource[];
    groundingMode: MedSafetyGroundingMode;
    groundingStatus: MedSafetyGroundingStatus;
    groundingError?: string | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMode(value: unknown): "ward" | "er" | "icu" | null {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "er") return "er";
  if (raw === "icu") return "icu";
  if (raw === "ward") return "ward";
  return null;
}

function normalizeSituation(value: unknown): "general" | "pre_admin" | "during_admin" | "event_response" | null {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "pre_admin") return "pre_admin";
  if (raw === "during_admin") return "during_admin";
  if (raw === "event_response") return "event_response";
  if (raw === "general") return "general";
  return null;
}

function normalizeQueryIntent(value: unknown): "medication" | "device" | "scenario" | null {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "medication" || raw === "device" || raw === "scenario") return raw;
  return null;
}

function normalizeResultKind(value: unknown): "medication" | "device" | "scenario" {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "medication" || raw === "device" || raw === "scenario") return raw;
  return "scenario";
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function firstMeaningfulLine(value: string) {
  const line = normalizeText(value)
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);
  return line ? line.replace(/^[-*•·]\s*/, "") : "";
}

async function safeLoadSubscription(userId: string): Promise<SubscriptionSnapshot | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;
    const { readSubscription } = await import("@/lib/server/billingStore");
    return await readSubscription(userId);
  } catch {
    return null;
  }
}

function jsonNoStoreFallback(body: unknown, init: { status: number } = { status: 200 }) {
  return NextResponse.json(body, {
    status: init.status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function normalizeHistory(value: unknown, limit = MED_SAFETY_RECENT_LIMIT_FREE) {
  const normalizedLimit = Math.max(MED_SAFETY_RECENT_LIMIT_FREE, Math.min(MED_SAFETY_RECENT_LIMIT_PRO, Math.round(limit)));
  const retentionDaysRaw = Number(process.env.MED_SAFETY_HISTORY_RETENTION_DAYS ?? DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS);
  const retentionDays = Number.isFinite(retentionDaysRaw)
    ? Math.max(MIN_MED_SAFETY_HISTORY_RETENTION_DAYS, Math.min(MAX_MED_SAFETY_HISTORY_RETENTION_DAYS, Math.round(retentionDaysRaw)))
    : DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (!Array.isArray(value)) return [] as HistoryRecord[];

  const out: HistoryRecord[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const resultNode = isRecord(raw.result) ? raw.result : null;
    const requestNode = isRecord(raw.request) ? raw.request : {};
    if (!resultNode) continue;

    const id = String(raw.id ?? "").trim();
    if (!id) continue;

    const analyzedAtRaw = Number(resultNode.analyzedAt);
    const savedAtRaw = Number(raw.savedAt);
    const savedAt = Number.isFinite(savedAtRaw) && savedAtRaw > 0 ? savedAtRaw : Number.isFinite(analyzedAtRaw) ? analyzedAtRaw : Date.now();
    if (savedAt < now - retentionMs) continue;

    const query = normalizeText(requestNode.query ?? resultNode.query);
    const modernAnswer = canonicalizeMedSafetyAnswerText(normalizeMedSafetyAnswerText(resultNode.answer));
    const legacyAnswer = canonicalizeMedSafetyAnswerText(normalizeMedSafetyAnswerText(resultNode.searchAnswer ?? resultNode.generatedText));
    const answer = modernAnswer || legacyAnswer;
    if (!answer) continue;

    const legacyItemNode = isRecord(resultNode.item) ? resultNode.item : {};
    const title = normalizeText(resultNode.title ?? legacyItemNode.name) || query || "AI 임상 검색";
    const summary =
      normalizeText(resultNode.summary ?? resultNode.oneLineConclusion) ||
      firstMeaningfulLine(answer) ||
      query ||
      "질문 기록";

    out.push({
      id,
      savedAt,
      language: String(raw.language ?? "").toLowerCase() === "en" ? "en" : "ko",
      request: {
        query,
        mode: normalizeMode(requestNode.mode),
        situation: normalizeSituation(requestNode.situation),
        queryIntent: normalizeQueryIntent(requestNode.queryIntent),
      },
      result: {
        title,
        summary,
        answer,
        analyzedAt: Number.isFinite(analyzedAtRaw) && analyzedAtRaw > 0 ? analyzedAtRaw : savedAt,
        resultKind: normalizeResultKind(resultNode.resultKind),
        model: typeof resultNode.model === "string" ? resultNode.model : null,
        source: String(resultNode.source ?? "") === "openai_fallback" ? "openai_fallback" : "openai_live",
        sources: mergeMedSafetySources(Array.isArray(resultNode.sources) ? (resultNode.sources as MedSafetySource[]) : []),
        groundingMode:
          resultNode.groundingMode === "premium_web" || resultNode.groundingMode === "official_search"
            ? resultNode.groundingMode
            : "none",
        groundingStatus:
          resultNode.groundingStatus === "ok" || resultNode.groundingStatus === "failed" ? resultNode.groundingStatus : "none",
        groundingError: typeof resultNode.groundingError === "string" ? resultNode.groundingError : null,
      },
    });
  }

  return out
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, normalizedLimit);
}

export async function GET(req: Request) {
  try {
    const { loadAIContent } = await import("@/lib/server/aiContentStore");
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId");
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
    const { getPlanDefinition } = await import("@/lib/billing/plans");
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore");

    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
    }
    if (!(await userHasCompletedServiceConsent(userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 });
    }

    const row = await loadAIContent(userId).catch(() => null);
    const data = isRecord(row?.data) ? row.data : {};
    const subscription = await safeLoadSubscription(userId);
    const historyLimit =
      subscription?.hasPaidAccess && subscription.tier !== "free"
        ? getPlanDefinition(subscription.tier).medSafetyHistoryLimit
        : getPlanDefinition("free").medSafetyHistoryLimit;
    const items = normalizeHistory(data.medSafetyRecent, historyLimit);

    return jsonNoStore(
      {
        ok: true,
        data: {
          historyLimit,
          items,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    try {
      console.error("[MedSafetyHistory] failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Ignore logging failures.
    }
    return jsonNoStoreFallback(
      {
        ok: false,
        error: "med_safety_history_failed",
      },
      { status: 500 }
    );
  }
}
