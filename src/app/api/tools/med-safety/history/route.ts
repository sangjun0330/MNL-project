import { NextResponse } from "next/server";
import { loadAIContent } from "@/lib/server/aiContentStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { jsonNoStore } from "@/lib/server/requestSecurity";
import type { SubscriptionSnapshot } from "@/lib/server/billingStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const MED_SAFETY_RECENT_LIMIT_FREE = 5;
const MED_SAFETY_RECENT_LIMIT_PRO = 10;
const DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS = 30;
const MIN_MED_SAFETY_HISTORY_RETENTION_DAYS = 1;
const MAX_MED_SAFETY_HISTORY_RETENTION_DAYS = 90;

type HistoryRecord = {
  id: string;
  savedAt: number;
  language: "ko" | "en";
  request: {
    query: string;
    mode: "ward" | "er" | "icu";
    situation: "general" | "pre_admin" | "during_admin" | "event_response";
    queryIntent: "medication" | "device" | "scenario" | null;
  };
  result: {
    resultKind: "medication" | "device" | "scenario";
    oneLineConclusion: string;
    searchAnswer: string;
    generatedText: string;
    analyzedAt: number;
    item: {
      name: string;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMode(value: unknown): "ward" | "er" | "icu" {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "er") return "er";
  if (raw === "icu") return "icu";
  return "ward";
}

function normalizeSituation(value: unknown): "general" | "pre_admin" | "during_admin" | "event_response" {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "pre_admin") return "pre_admin";
  if (raw === "during_admin") return "during_admin";
  if (raw === "event_response") return "event_response";
  return "general";
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
    if (Boolean(resultNode.notFound)) continue;
    const id = String(raw.id ?? "").trim();
    if (!id) continue;
    const analyzedAt = Number(resultNode.analyzedAt);
    const savedAtRaw = Number(raw.savedAt);
    const savedAt = Number.isFinite(savedAtRaw) && savedAtRaw > 0 ? savedAtRaw : Number.isFinite(analyzedAt) ? analyzedAt : Date.now();
    if (savedAt < now - retentionMs) continue;
    const searchAnswer = String(resultNode.searchAnswer ?? "").trim();
    const generatedText = String(resultNode.generatedText ?? "").trim();
    if (!searchAnswer && !generatedText) continue;
    const itemNode = isRecord(resultNode.item) ? resultNode.item : {};
    out.push({
      id,
      savedAt,
      language: String(raw.language ?? "").toLowerCase() === "en" ? "en" : "ko",
      request: {
        query: String(requestNode.query ?? "").trim(),
        mode: normalizeMode(requestNode.mode),
        situation: normalizeSituation(requestNode.situation),
        queryIntent: normalizeQueryIntent(requestNode.queryIntent),
      },
      result: {
        resultKind: normalizeResultKind(resultNode.resultKind),
        oneLineConclusion: String(resultNode.oneLineConclusion ?? "").trim(),
        searchAnswer,
        generatedText,
        analyzedAt: Number.isFinite(analyzedAt) && analyzedAt > 0 ? analyzedAt : savedAt,
        item: {
          name: String(itemNode.name ?? "").trim() || "조회 결과",
        },
      },
    });
  }
  return out
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, normalizedLimit);
}

export async function GET(req: Request) {
  try {
    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
    }

    const row = await loadAIContent(userId).catch(() => null);
    const data = isRecord(row?.data) ? row?.data : {};
    const subscription = await safeLoadSubscription(userId);
    const historyLimit = subscription?.hasPaidAccess ? MED_SAFETY_RECENT_LIMIT_PRO : MED_SAFETY_RECENT_LIMIT_FREE;
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
  } catch {
    return jsonNoStore(
      {
        ok: false,
        error: "med_safety_history_failed",
      },
      { status: 500 }
    );
  }
}
