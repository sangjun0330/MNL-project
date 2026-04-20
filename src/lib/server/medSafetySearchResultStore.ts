import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { Json } from "@/types/supabase";

type MedSafetySearchResultRow = {
  user_id: string;
  query: string;
  query_hash: string;
  search_type: string;
  language: string;
  model: string;
  route_decision: Json | null;
  grounding_summary: Json | null;
  answer_schema: Json;
  quality: Json | null;
  verifier_flags: Json | null;
  latency_ms: number | null;
  token_usage: Json | null;
  user_feedback: Json | null;
  created_at: string;
};

function isMissingTableError(error: any, table: string) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  if (code === "42P01" || code === "42703") return true;
  return message.includes(table);
}

function clampText(value: unknown, max = 4000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, max);
}

export function hashMedSafetyQuery(query: string) {
  let hash = 2166136261;
  for (const char of query) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `msq_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function appendMedSafetySearchResult(input: {
  userId: string;
  query: string;
  searchType: "standard" | "premium";
  language: "ko" | "en";
  model: string;
  routeDecision: Json | null;
  groundingSummary: Json | null;
  answerSchema: Json;
  quality: Json | null;
  verifierFlags: Json | null;
  latencyMs: number | null;
  tokenUsage: Json | null;
  userFeedback?: Json | null;
}) {
  const admin = getSupabaseAdmin() as any;
  const row: MedSafetySearchResultRow = {
    user_id: input.userId,
    query: clampText(input.query, 2400),
    query_hash: hashMedSafetyQuery(input.query),
    search_type: input.searchType,
    language: input.language,
    model: clampText(input.model, 80),
    route_decision: input.routeDecision,
    grounding_summary: input.groundingSummary,
    answer_schema: input.answerSchema,
    quality: input.quality,
    verifier_flags: input.verifierFlags,
    latency_ms: typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs) ? Math.max(0, Math.round(input.latencyMs)) : null,
    token_usage: input.tokenUsage,
    user_feedback: input.userFeedback ?? null,
    created_at: new Date().toISOString(),
  };

  const { error } = await admin.from("med_safety_search_results").insert(row);
  if (!error) return;
  if (isMissingTableError(error, "med_safety_search_results")) return;
  throw error;
}

export async function readMedSafetySearchQualitySummary(rangeDays = 30): Promise<{
  officialCitationRate: number;
  unsupportedClaimRate: number;
  verificationFailRate: number;
  groundingMissRate: number;
  highRiskQueryShare: number;
  totalResults: number;
}> {
  const safeRangeDays = Math.max(7, Math.min(180, Math.round(rangeDays)));
  const sinceIso = new Date(Date.now() - safeRangeDays * 24 * 60 * 60 * 1000).toISOString();
  const admin = getSupabaseAdmin() as any;
  const { data, error } = await admin
    .from("med_safety_search_results")
    .select("quality, created_at")
    .gte("created_at", sinceIso);
  if (error) {
    if (isMissingTableError(error, "med_safety_search_results")) {
      return {
        officialCitationRate: 0,
        unsupportedClaimRate: 0,
        verificationFailRate: 0,
        groundingMissRate: 0,
        highRiskQueryShare: 0,
        totalResults: 0,
      };
    }
    throw error;
  }

  const rows = Array.isArray(data) ? (data as Array<{ quality?: Json | null }>) : [];
  if (!rows.length) {
    return {
      officialCitationRate: 0,
      unsupportedClaimRate: 0,
      verificationFailRate: 0,
      groundingMissRate: 0,
      highRiskQueryShare: 0,
      totalResults: 0,
    };
  }

  let officialCitationRateSum = 0;
  let unsupportedClaims = 0;
  let totalClaims = 0;
  let verificationFails = 0;
  let groundingMisses = 0;
  let highRiskCount = 0;

  rows.forEach((row) => {
    const quality = row.quality && typeof row.quality === "object" && !Array.isArray(row.quality) ? (row.quality as Record<string, Json>) : null;
    officialCitationRateSum += Number(quality?.official_citation_rate ?? 0) || 0;
    unsupportedClaims += Number(quality?.unsupported_claim_count ?? 0) || 0;
    totalClaims += Number(quality?.total_claim_count ?? 0) || 0;
    if (quality?.verification_run === true && quality?.verification_passed === false) verificationFails += 1;
    if (quality?.grounded === false) groundingMisses += 1;
    if (quality?.high_risk === true) highRiskCount += 1;
  });

  return {
    officialCitationRate: Number((officialCitationRateSum / rows.length).toFixed(4)),
    unsupportedClaimRate: totalClaims > 0 ? Number((unsupportedClaims / totalClaims).toFixed(4)) : 0,
    verificationFailRate: Number((verificationFails / rows.length).toFixed(4)),
    groundingMissRate: Number((groundingMisses / rows.length).toFixed(4)),
    highRiskQueryShare: Number((highRiskCount / rows.length).toFixed(4)),
    totalResults: rows.length,
  };
}
