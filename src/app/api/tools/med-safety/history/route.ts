import { NextResponse } from "next/server";
import { loadAIContent } from "@/lib/server/aiContentStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const MED_SAFETY_RECENT_LIMIT = 10;

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

function normalizeHistory(value: unknown) {
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
    .slice(0, MED_SAFETY_RECENT_LIMIT);
}

export async function GET(req: Request) {
  try {
    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
    }

    const row = await loadAIContent(userId).catch(() => null);
    const data = isRecord(row?.data) ? row?.data : {};
    const items = normalizeHistory(data.medSafetyRecent);

    return NextResponse.json(
      {
        ok: true,
        data: {
          items,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message ?? "med_safety_history_failed"),
      },
      { status: 500 }
    );
  }
}
