"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
import type { SubscriptionApi } from "@/lib/billing/client";
import { getPlanDefinition, getSearchCreditMeta, type SearchCreditType } from "@/lib/billing/plans";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AnimatedCopyLabel } from "@/components/ui/AnimatedCopyLabel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { withReturnTo } from "@/lib/navigation";
import { buildStructuredCopyText, copyTextToClipboard } from "@/lib/structuredCopy";
import { useI18n } from "@/lib/useI18n";
import { createMemoBlock, sanitizeMemoDocument } from "@/lib/notebook";
import { useAppStore } from "@/lib/store";

const FLAT_CARD_CLASS = "rounded-[32px] border border-[#E8E8EC] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]";
const PAGE_TITLE_CLASS = "text-[24px] font-bold tracking-[-0.015em] text-ios-text md:text-[26px]";
const TOOL_LIST_LINK_CLASS =
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#E8E8EC] bg-white px-4 text-[12px] font-semibold leading-none text-ios-text";
const PRIMARY_FLAT_BTN =
  "h-11 rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 text-[14px] font-semibold text-[color:var(--rnest-accent)] shadow-none hover:border-[color:var(--rnest-accent)]";
const SECONDARY_FLAT_BTN =
  "h-11 rounded-full border border-[#E8E8EC] bg-white px-4 text-[14px] font-semibold text-ios-text shadow-none hover:bg-[#F7F7F8]";
const MESSAGE_USER_CLASS = "rounded-[24px] bg-[#F3F4F6] px-4 py-3 text-[15px] leading-6 text-ios-text";
const META_PILL_CLASS = "inline-flex items-center rounded-full border border-[#E8E8EC] bg-[#F7F7F8] px-3 py-1.5 text-[11px] font-semibold text-ios-sub";
const ACCENT_PILL_CLASS =
  "inline-flex items-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--rnest-accent)]";
const COMPOSER_ACTION_BTN_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E6E1F7] bg-white/78 text-ios-sub backdrop-blur-md transition hover:border-[color:var(--rnest-accent-border)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#E6E1F7] disabled:hover:bg-white/78 sm:h-11 sm:w-11";
const COMPOSER_SELECTOR_BTN_CLASS =
  "inline-flex h-10 min-w-[74px] items-center justify-center gap-1.5 rounded-full border border-[#DDD6F3] bg-white/90 px-2.5 text-[11.5px] font-semibold text-ios-text shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:border-[color:var(--rnest-accent-border)] hover:bg-white/94 disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:min-w-[82px] sm:px-3 sm:text-[12px]";
const COMPOSER_SEND_BTN_CLASS =
  "flex h-10 min-w-[48px] shrink-0 items-center justify-center rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)] px-2.5 text-white shadow-[0_12px_26px_rgba(123,111,208,0.22)] transition hover:bg-[color:var(--rnest-accent-strong)] disabled:cursor-not-allowed disabled:border-[#E6E1F7] disabled:bg-[#ECEAF5] disabled:text-[#A49DBD] disabled:shadow-none sm:h-11 sm:min-w-[52px] sm:px-3";
const STREAMING_CARD_CLASS =
  "rounded-[30px] border border-[#E7E8ED] bg-white px-5 py-4 text-[15px] leading-7 text-ios-text shadow-[0_18px_36px_rgba(15,23,42,0.04)]";
const OPEN_LAYOUT_CLASS =
  "relative min-h-[calc(100dvh-120px)] overflow-hidden bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#FAFAFB_42%,#F4F5F7_100%)]";
const MED_SAFETY_CLIENT_TIMEOUT_MS = 480_000;
const RETRY_WITH_DATA_MESSAGE = "네트워크가 불안정합니다. 데이터(모바일 네트워크)를 켠 뒤 다시 시도해 주세요.";
const MED_SAFETY_SESSION_STORAGE_KEY_BASE = "rnest-med-safety-session";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  model?: string;
  source?: "openai_live" | "openai_fallback";
  imageDataUrl?: string | null;
};

type AnalyzePayload = {
  answer: string;
  query: string;
  model: string;
  analyzedAt: number;
  source: "openai_live" | "openai_fallback";
  fallbackReason?: string | null;
  continuationToken?: string | null;
  startedFreshSession?: boolean;
  searchType: SearchCreditType;
  creditBucket: "included" | "extra" | null;
};

type AnswerSectionTone = "summary" | "action" | "warning" | "compare" | "neutral";

type AnswerSection = {
  title: string;
  lead: string;
  bodyLines: string[];
  tone: AnswerSectionTone;
};

type PersistedMedSafetySession = {
  messages: Message[];
  input: string;
  lastContinuationToken: string | null;
  lastSubmittedQuery: string;
  showSessionDecisionPrompt: boolean;
  updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canUseSessionStorage() {
  // Service consent flow requires server-only persistence for RNest health/AI state.
  return false;
}

function buildMedSafetySessionStorageKey(userId?: string | null) {
  return userId ? `${MED_SAFETY_SESSION_STORAGE_KEY_BASE}:${userId}` : MED_SAFETY_SESSION_STORAGE_KEY_BASE;
}

function purgeLegacyMedSafetySessionStorage() {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(MED_SAFETY_SESSION_STORAGE_KEY_BASE)) continue;
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }
}

function normalizePersistedMessage(value: unknown): Message | null {
  if (!isRecord(value)) return null;
  const role = value.role === "assistant" ? "assistant" : value.role === "user" ? "user" : null;
  const content = typeof value.content === "string" ? value.content : "";
  const timestamp = Number(value.timestamp);
  if (!role || !content || !Number.isFinite(timestamp)) return null;
  return {
    id: typeof value.id === "string" && value.id ? value.id : `${role}-${timestamp.toString(36)}`,
    role,
    content,
    timestamp,
    model: typeof value.model === "string" ? value.model : undefined,
    source:
      value.source === "openai_fallback" ? "openai_fallback" : value.source === "openai_live" ? "openai_live" : undefined,
    imageDataUrl: null,
  };
}

function readPersistedMedSafetySession(storageKey: string): PersistedMedSafetySession | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.map(normalizePersistedMessage).filter((message): message is Message => Boolean(message));
    if (!messages.some((message) => message.role === "assistant")) return null;
    return {
      messages,
      input: typeof parsed.input === "string" ? parsed.input : "",
      lastContinuationToken: typeof parsed.lastContinuationToken === "string" ? parsed.lastContinuationToken : null,
      lastSubmittedQuery: typeof parsed.lastSubmittedQuery === "string" ? parsed.lastSubmittedQuery : "",
      showSessionDecisionPrompt: parsed.showSessionDecisionPrompt === true,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

function writePersistedMedSafetySession(storageKey: string, session: PersistedMedSafetySession) {
  if (!canUseSessionStorage()) return;
  const sanitizedMessages = session.messages.map((message) => ({
    ...message,
    imageDataUrl: null,
  }));
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        ...session,
        messages: sanitizedMessages,
      })
    );
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

function clearPersistedMedSafetySession(storageKey: string) {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
}

function normalizeMultilineText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTime(value: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatCopyDateTime(value: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(
    date.getHours()
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseErrorMessage(raw: string, t: TranslateFn) {
  if (!raw) return t("질문 처리 중 오류가 발생했습니다.");
  const normalized = String(raw).toLowerCase();
  if (normalized.includes("login_required")) return t("로그인이 필요합니다");
  if (normalized.includes("invalid_origin") || normalized.includes("missing_origin") || normalized.includes("invalid_referer")) {
    return t("보안 검증에 실패했습니다. 앱을 새로고침한 뒤 다시 시도해 주세요.");
  }
  if (normalized.includes("insufficient_med_safety_credits"))
    return t("AI 검색 잔여 크레딧이 없습니다. 추가 크레딧을 구매하거나 Plus/Pro 플랜 크레딧을 충전한 뒤 다시 시도해 주세요.");
  if (normalized.includes("missing_supabase_env"))
    return t("서버 환경변수(SUPABASE)가 설정되지 않았습니다. 배포 환경변수를 확인해 주세요.");
  if (normalized.includes("missing_openai_api_key")) return t("AI API 키가 설정되지 않았습니다.");
  if (normalized.includes("query_required")) return t("질문을 입력해 주세요.");
  if (normalized.includes("sensitive_query_blocked")) return t("환자 식별정보를 제거한 뒤 다시 질문해 주세요.");
  if (normalized.includes("image_too_large")) return t("이미지 용량이 너무 큽니다. 6MB 이하로 다시 시도해 주세요.");
  if (normalized.includes("client_timeout"))
    return t("요청 처리 시간이 길어져 앱 대기 시간이 만료되었습니다. 잠시 후 다시 시도해 주세요.");
  if (normalized.includes("openai_timeout_total_budget"))
    return t("AI 응답 시간이 길어 내부 처리 제한 시간을 넘었습니다. 다시 시도해 주세요.");
  if (normalized.includes("openai_timeout_upstream"))
    return t("AI 서버 응답이 지연되어 시간 초과되었습니다. 잠시 후 다시 시도해 주세요.");
  if (normalized.includes("openai_timeout") || normalized.includes("aborted"))
    return t("요청 처리 중 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.");
  if (normalized.includes("openai_network")) return t(RETRY_WITH_DATA_MESSAGE);
  if (normalized.includes("openai_responses_401"))
    return t("AI API 키가 유효하지 않거나 만료되었습니다. 환경변수를 확인해 주세요.");
  if (normalized.includes("openai_responses_403_model_access")) {
    return t("현재 계정에서 AI 응답 권한을 확인해 주세요.");
  }
  if (normalized.includes("openai_responses_403")) {
    return t(RETRY_WITH_DATA_MESSAGE);
  }
  if (normalized.includes("openai_responses_404") || normalized.includes("model_not_found"))
    return t("AI 응답 설정을 확인해 주세요.");
  if (normalized.includes("openai_responses_429")) return t("요청 한도가 초과되었습니다. 잠시 후 다시 시도해 주세요.");
  if (normalized.includes("openai_responses_400_continuation"))
    return t("이전 대화 상태 동기화에 실패했습니다. 새 검색으로 다시 시도해 주세요.");
  if (normalized.includes("openai_responses_400_token_limit"))
    return t("AI 응답 길이 제한으로 요청이 중단되었습니다. 다시 시도해 주세요.");
  if (normalized.includes("openai_empty_text")) return t("AI 응답 본문이 비어 다시 시도했습니다. 잠시 후 다시 시도해 주세요.");
  if (normalized.includes("openai_stream_parse_failed")) return t("AI 응답을 끝까지 읽지 못했습니다. 다시 시도해 주세요.");
  if (/openai_responses_(408|409|425|500|502|503|504)/.test(normalized)) return t(RETRY_WITH_DATA_MESSAGE);
  if (normalized.includes("invalid_response_payload")) return t("서버 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.");
  return t("질문 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
}

function parseAnalyzePayload(payloadRaw: unknown): { ok: true; data: AnalyzePayload } | { ok: false; error: string } {
  if (!isRecord(payloadRaw)) return { ok: false, error: "invalid_response_payload" };
  if (payloadRaw.ok === false) return { ok: false, error: String(payloadRaw.error ?? "med_safety_analyze_failed") };

  const node = payloadRaw.ok === true && isRecord(payloadRaw.data) ? payloadRaw.data : payloadRaw;
  const answer = normalizeMultilineText(node.answer);
  const query = String(node.query ?? "").trim();
  const model = String(node.model ?? "").trim();
  const analyzedAt = Number(node.analyzedAt);
  if (!answer || !query || !model || !Number.isFinite(analyzedAt)) {
    return { ok: false, error: "invalid_response_payload" };
  }
  return {
    ok: true,
    data: {
      answer,
      query,
      model,
      analyzedAt,
      source: String(node.source ?? "") === "openai_fallback" ? "openai_fallback" : "openai_live",
      fallbackReason: node.fallbackReason == null ? null : String(node.fallbackReason),
      continuationToken: typeof node.continuationToken === "string" ? node.continuationToken : null,
      startedFreshSession: node.startedFreshSession === true,
      searchType: node.searchType === "premium" ? "premium" : "standard",
      creditBucket: node.creditBucket === "included" || node.creditBucket === "extra" ? node.creditBucket : null,
    },
  };
}

function getQuotaForSearchType(
  quota: SubscriptionApi["medSafetyQuota"] | null | undefined,
  searchType: SearchCreditType
) {
  return searchType === "premium" ? quota?.premium ?? null : quota?.standard ?? null;
}

function consumeOptimisticQuota(
  quota: SubscriptionApi["medSafetyQuota"] | null,
  searchType: SearchCreditType
): SubscriptionApi["medSafetyQuota"] | null {
  if (!quota) return quota;
  const target = getQuotaForSearchType(quota, searchType);
  if (!target || target.totalRemaining <= 0) return quota;

  const nextTarget = {
    includedRemaining: target.includedRemaining > 0 ? target.includedRemaining - 1 : target.includedRemaining,
    extraRemaining: target.includedRemaining > 0 ? target.extraRemaining : Math.max(0, target.extraRemaining - 1),
    totalRemaining: Math.max(0, target.totalRemaining - 1),
  };

  return {
    ...quota,
    standard: searchType === "standard" ? nextTarget : quota.standard,
    premium: searchType === "premium" ? nextTarget : quota.premium,
    totalRemaining: Math.max(0, quota.totalRemaining - 1),
  };
}

function shouldRetryAnalyzeError(status: number, rawError: string) {
  const error = String(rawError ?? "").toLowerCase();
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (
    /client_timeout|openai_network_|openai_timeout|openai_stream_|openai_empty_text|openai_responses_(408|409|425|429|500|502|503|504)/.test(
      error
    )
  )
    return true;
  if (/openai_responses_403/.test(error) && /(html|forbidden|proxy|firewall|blocked|access denied|cloudflare)/.test(error)) return true;
  return false;
}

async function waitMs(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function trackBillingEvent(eventName: string, planTierSnapshot: string, props?: Record<string, unknown>) {
  try {
    const res = await fetch("/api/billing/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        planTierSnapshot,
        props: props ?? null,
      }),
    });
    if (!res.ok) return;
  } catch {
    // Ignore analytics failures in search flow.
  }
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("invalid_image_data"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("image_read_failed"));
    reader.readAsDataURL(file);
  });
}

async function fetchAnalyzeWithTimeout(body: Record<string, unknown>, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("client_timeout"));
    }, timeoutMs);
  });
  try {
    const authHeaders = await getBrowserAuthHeaders();
    return (await Promise.race([
      fetch("/api/tools/med-safety/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      }),
      timeoutPromise,
    ])) as Response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  if (!block.trim()) return null;
  let eventName = "";
  const dataLines: string[] = [];
  for (const rawLine of block.split(/\r?\n/g)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  return {
    event: eventName,
    data: dataLines.join("\n"),
  };
}

async function parseAnalyzeStreamResponse(args: {
  response: Response;
  onDelta: (text: string) => void;
}): Promise<{ data: AnalyzePayload | null; error: string | null }> {
  const { response, onDelta } = args;
  const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/event-stream")) {
    const payloadRaw = (await response.json().catch(() => null)) as unknown;
    const parsed = parseAnalyzePayload(payloadRaw);
    if (parsed.ok) return { data: parsed.data, error: null };
    return { data: null, error: parsed.error };
  }

  if (!response.body) {
    const payloadRaw = (await response.json().catch(() => null)) as unknown;
    const parsed = parseAnalyzePayload(payloadRaw);
    if (parsed.ok) return { data: parsed.data, error: null };
    return { data: null, error: parsed.error };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let parsedData: AnalyzePayload | null = null;
  let parsedError: string | null = null;

  const handleBlock = (block: string) => {
    const parsedBlock = parseSseBlock(block);
    if (!parsedBlock) return;
    const payloadText = parsedBlock.data.trim();
    if (!payloadText || payloadText === "[DONE]") return;

    let payload: unknown = null;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      return;
    }

    const eventType = parsedBlock.event || String((payload as any)?.type ?? "");
    if (eventType === "delta") {
      const text = typeof (payload as any)?.text === "string" ? (payload as any).text : "";
      if (text) onDelta(text);
      return;
    }
    if (eventType === "error") {
      parsedError = String((payload as any)?.error ?? "med_safety_analyze_failed");
      return;
    }
    if (eventType === "result") {
      const parsed = parseAnalyzePayload(payload);
      if (parsed.ok) {
        parsedData = parsed.data;
      } else if (!parsedError) {
        parsedError = parsed.error;
      }
      return;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    while (true) {
      const blockEnd = buffer.indexOf("\n\n");
      if (blockEnd < 0) break;
      const block = buffer.slice(0, blockEnd);
      buffer = buffer.slice(blockEnd + 2);
      handleBlock(block);
    }
  }

  buffer += decoder.decode().replace(/\r\n/g, "\n");
  while (true) {
    const blockEnd = buffer.indexOf("\n\n");
    if (blockEnd < 0) break;
    const block = buffer.slice(0, blockEnd);
    buffer = buffer.slice(blockEnd + 2);
    handleBlock(block);
  }
  if (buffer.trim()) {
    handleBlock(buffer);
  }

  return { data: parsedData, error: parsedError };
}

function normalizeAnswerRawLine(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\t/g, "  ")
    .replace(/\s+$/g, "");
}

function cleanAnswerLine(value: string) {
  return normalizeAnswerRawLine(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestionInput(value: string) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripBulletPrefix(value: string) {
  return String(value ?? "")
    .trimStart()
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function stripHeadingAnnotations(value: string) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeSectionHeadingKey(value: string) {
  return stripHeadingAnnotations(
    stripBulletPrefix(cleanAnswerLine(value))
      .replace(/^[“"'`]+/, "")
      .replace(/[”"'`]+$/, "")
      .replace(/[:：?？]$/, "")
  ).toLowerCase();
}

const SECTION_TITLE_PATTERNS = [
  /^(핵심|핵심요약|핵심해석|핵심판단|요약|정의|임상의미|핵심질문)$/,
  /^(지금할일|즉시대응|즉시조치|바로할수있는조치|실무포인트|간호포인트|관찰포인트|확인포인트)$/,
  /^(확인할것|확인할수치|확인질문|추가로확인할것|추가로정확히해석하려면|추가로몇가지만확인해주시면)$/,
  /^(주의|위험|보고기준|호출기준|중단기준|중단\/보고\/호출기준|stoprule|escalation)$/,
  /^(원인후보|문제원인후보|원인|감별포인트)$/,
  /^(비교|차이|선택기준)$/,
  /^(해석|수치해석|기전|적응증|모니터링|투여\/간호핵심|투여\/모니터링핵심)$/,
  /^(sbar|간단sbar예시|보고문구|보고예시|sbar예시)$/,
  /^(페니라민주면되나요|항히스타민주면되나요|스테로이드도줘야하나요|에피네프린이먼저인상황인지가핵심입니다)$/,
];

function looksLikeStructuredAnswerLine(value: string) {
  const raw = String(value ?? "").trimStart();
  if (!raw) return false;
  if (/^[-*•·]\s+/.test(raw)) return true;
  if (/^\d+[.)]\s+/.test(raw)) return true;
  if (/^[A-Za-z][A-Za-z0-9/+ -]{0,12}:\s*/.test(raw)) return true;
  return false;
}

function looksLikeSectionHeading(
  value: string,
  context?: {
    previousNonEmptyLine?: string | null;
    nextNonEmptyLine?: string | null;
  }
) {
  const line = cleanAnswerLine(value);
  if (!line) return false;
  const normalized = stripBulletPrefix(line);
  if (!normalized) return false;
  if (looksLikeStructuredAnswerLine(line)) return false;

  const headingKey = normalizeSectionHeadingKey(normalized);
  if (!headingKey) return false;

  if (/[:：]$/.test(normalized) && headingKey.length <= 28) return true;
  if (/[?？]$/.test(normalized) && headingKey.length <= 28) return true;
  if (SECTION_TITLE_PATTERNS.some((pattern) => pattern.test(headingKey))) return true;

  const previousNonEmptyLine = cleanAnswerLine(context?.previousNonEmptyLine ?? "");
  const nextNonEmptyLine = cleanAnswerLine(context?.nextNonEmptyLine ?? "");
  const nextLooksStructured = looksLikeStructuredAnswerLine(nextNonEmptyLine);
  const startsNewBlock = !previousNonEmptyLine || nextLooksStructured;

  if (
    startsNewBlock &&
    headingKey.length <= 24 &&
    !/[.。]$/.test(normalized) &&
    !/니다$/.test(headingKey) &&
    !/습니다$/.test(headingKey)
  ) {
    return true;
  }

  return false;
}

function formatSectionTitle(value: string) {
  return stripBulletPrefix(cleanAnswerLine(value)).replace(/[:：]$/, "").trim() || "핵심";
}

function trimBlankAnswerLines(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && !cleanAnswerLine(lines[start])) start += 1;
  while (end > start && !cleanAnswerLine(lines[end - 1])) end -= 1;

  return lines.slice(start, end);
}

function buildAnswerSectionContent(lines: string[]) {
  const trimmedLines = trimBlankAnswerLines(lines.map(normalizeAnswerRawLine));
  if (!trimmedLines.length) return null;

  const [leadLine, ...bodyLines] = trimmedLines;
  const lead = stripBulletPrefix(leadLine) || cleanAnswerLine(leadLine);
  if (!lead) return null;

  return {
    lead,
    bodyLines,
  };
}

function getAnswerIndentLevel(value: string) {
  const leadingWhitespace = value.match(/^(\s*)/)?.[1] ?? "";
  return Math.min(3, Math.floor(leadingWhitespace.length / 2));
}

function parseAnswerBodyLine(value: string) {
  const raw = normalizeAnswerRawLine(value);
  if (!cleanAnswerLine(raw)) {
    return { kind: "blank" as const, content: "", level: 0 };
  }

  const bulletMatch = raw.match(/^(\s*)[-*•·]\s+(.*)$/);
  if (bulletMatch) {
    return {
      kind: "bullet" as const,
      content: bulletMatch[2].trim(),
      level: getAnswerIndentLevel(bulletMatch[1]),
    };
  }

  const numberedMatch = raw.match(/^(\s*)(\d+[.)])\s+(.*)$/);
  if (numberedMatch) {
    return {
      kind: "number" as const,
      marker: numberedMatch[2],
      content: numberedMatch[3].trim(),
      level: getAnswerIndentLevel(numberedMatch[1]),
    };
  }

  const labelMatch = raw.match(/^(\s*)([A-Za-z][A-Za-z0-9/+ -]{0,12}:)\s*(.*)$/);
  if (labelMatch) {
    return {
      kind: "label" as const,
      marker: labelMatch[2],
      content: labelMatch[3].trim(),
      level: getAnswerIndentLevel(labelMatch[1]),
    };
  }

  return {
    kind: "text" as const,
    content: raw.trim(),
    level: getAnswerIndentLevel(raw),
  };
}

function inferSectionTone(title: string, index: number): AnswerSectionTone {
  const normalized = String(title ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();

  if (index === 0 || /(핵심|요약|정의|임상의미)/.test(normalized)) return "summary";
  if (/(지금할일|즉시대응|조치|확인|실무포인트|간호포인트|sbar|페니라민|항히스타민|스테로이드)/.test(normalized)) return "action";
  if (/(주의|위험|보고|호출|중단|stop)/.test(normalized)) return "warning";
  if (/(비교|차이|선택기준)/.test(normalized)) return "compare";
  return "neutral";
}

function parseAnswerSections(value: string): AnswerSection[] {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n");

  const sections: AnswerSection[] = [];
  let currentTitle = "핵심";
  let currentLines: string[] = [];

  const pushCurrent = () => {
    const content = buildAnswerSectionContent(currentLines);
    if (!content) {
      currentLines = [];
      return;
    }
    sections.push({
      title: currentTitle,
      lead: content.lead,
      bodyLines: content.bodyLines,
      tone: inferSectionTone(currentTitle, sections.length),
    });
    currentLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const preservedLine = normalizeAnswerRawLine(rawLine);
    const line = cleanAnswerLine(preservedLine);
    if (!line) {
      currentLines.push("");
      continue;
    }

    let previousNonEmptyLine: string | null = null;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = cleanAnswerLine(lines[cursor]);
      if (!candidate) continue;
      previousNonEmptyLine = candidate;
      break;
    }

    let nextNonEmptyLine: string | null = null;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = cleanAnswerLine(lines[cursor]);
      if (!candidate) continue;
      nextNonEmptyLine = candidate;
      break;
    }

    if (looksLikeSectionHeading(line, { previousNonEmptyLine, nextNonEmptyLine })) {
      pushCurrent();
      currentTitle = formatSectionTitle(line);
      continue;
    }
    currentLines.push(preservedLine);
  }

  pushCurrent();

  if (sections.length) return sections;

  const fallbackContent = buildAnswerSectionContent(lines);
  if (!fallbackContent) {
    const rawText = String(value ?? "").trim();
    if (rawText) {
      return [{ title: "답변", lead: rawText, bodyLines: [], tone: "summary" }];
    }
    return [];
  }
  return [
    {
      title: "답변",
      lead: fallbackContent.lead,
      bodyLines: fallbackContent.bodyLines,
      tone: "summary",
    },
  ];
}

function sectionCardClass(tone: AnswerSectionTone) {
  if (tone === "summary") {
    return "rounded-[28px] border border-[#E4E8F1] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFF_100%)] px-5 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.04)]";
  }
  if (tone === "action") {
    return "rounded-[28px] border border-[#DCE8DE] bg-[linear-gradient(180deg,#FDFFFC_0%,#F6FBF4_100%)] px-5 py-4";
  }
  if (tone === "warning") {
    return "rounded-[28px] border border-[#F0DFC9] bg-[linear-gradient(180deg,#FFFDF9_0%,#FFF7EF_100%)] px-5 py-4";
  }
  if (tone === "compare") {
    return "rounded-[28px] border border-[#DFE6F0] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFD_100%)] px-5 py-4";
  }
  return "rounded-[28px] border border-[#E8E8EC] bg-[#FCFCFD] px-5 py-4";
}

function sectionTitleClass(tone: AnswerSectionTone) {
  if (tone === "summary") return "bg-[#EDF3FF] text-[#32568A]";
  if (tone === "action") return "bg-[#EAF6E8] text-[#2F6B36]";
  if (tone === "warning") return "bg-[#FFF0DE] text-[#9B5C1C]";
  if (tone === "compare") return "bg-[#EEF3FA] text-[#46617E]";
  return "bg-[#F2F3F5] text-ios-sub";
}

function AssistantAnswerSections({ content }: { content: string }) {
  const sections = parseAnswerSections(content);
  if (!sections.length) {
    return <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ios-text">{content}</div>;
  }

  const leadTextClass = "whitespace-pre-wrap break-words text-[15.5px] font-normal leading-7 tracking-[-0.01em] text-ios-text";
  const bodyTextClass = "text-[15px] leading-7 text-ios-text/90";

  return (
    <div className="space-y-4">
      {sections.map((section, sectionIndex) => (
        <section key={`${section.title}-${sectionIndex}`} className={sectionCardClass(section.tone)}>
          <div
            className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.01em] ${sectionTitleClass(
              section.tone
            )}`}
          >
            {section.title}
          </div>
          <div className="mt-3">
            <div className={leadTextClass}>
              {section.lead}
            </div>
            {section.bodyLines.length > 0 ? (
              <div className="mt-4 flex flex-col gap-1.5">
                {section.bodyLines.map((line, lineIndex) => {
                  const parsedLine = parseAnswerBodyLine(line);

                  if (parsedLine.kind === "blank") {
                    return <div key={`${section.title}-${lineIndex}`} className="h-3" aria-hidden="true" />;
                  }

                  const indentStyle = parsedLine.level ? { marginLeft: `${parsedLine.level * 18}px` } : undefined;

                  if (parsedLine.kind === "bullet") {
                    return (
                      <div
                        key={`${section.title}-${lineIndex}`}
                        className={`flex items-start gap-3 ${bodyTextClass}`}
                        style={indentStyle}
                      >
                        <span className="mt-[11px] h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-50" aria-hidden="true" />
                        <div className="min-w-0 whitespace-pre-wrap break-words">{parsedLine.content}</div>
                      </div>
                    );
                  }

                  if (parsedLine.kind === "number") {
                    return (
                      <div
                        key={`${section.title}-${lineIndex}`}
                        className={`flex items-start gap-3 ${bodyTextClass}`}
                        style={indentStyle}
                      >
                        <span className="min-w-[20px] shrink-0 font-semibold text-ios-text">{parsedLine.marker}</span>
                        <div className="min-w-0 whitespace-pre-wrap break-words">{parsedLine.content}</div>
                      </div>
                    );
                  }

                  if (parsedLine.kind === "label") {
                    return (
                      <div
                        key={`${section.title}-${lineIndex}`}
                        className={`flex items-start gap-3 ${bodyTextClass}`}
                        style={indentStyle}
                      >
                        <span className="min-w-[24px] shrink-0 font-semibold text-[color:var(--rnest-accent)]">{parsedLine.marker}</span>
                        <div className="min-w-0 whitespace-pre-wrap break-words">{parsedLine.content}</div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`${section.title}-${lineIndex}`}
                      className={`whitespace-pre-wrap break-words ${bodyTextClass}`}
                      style={indentStyle}
                    >
                      {parsedLine.content}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ToolMedSafetyPage() {
  const router = useRouter();
  const store = useAppStore();
  const { t, lang } = useI18n();
  const { user, status: authStatus } = useAuthState();
  const { loading: billingLoading, subscription, reload: reloadBilling } = useBillingAccess();
  const [mounted, setMounted] = useState(false);
  const [didRestoreSession, setDidRestoreSession] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [lastContinuationToken, setLastContinuationToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [showSessionDecisionPrompt, setShowSessionDecisionPrompt] = useState(false);
  const [optimisticQuota, setOptimisticQuota] = useState<SubscriptionApi["medSafetyQuota"] | null>(null);
  const [selectedSearchType, setSelectedSearchType] = useState<SearchCreditType | null>(null);
  const [isSearchTypeMenuOpen, setIsSearchTypeMenuOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isComposerDragOver, setIsComposerDragOver] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const restoredSessionKeyRef = useRef<string | null>(null);
  const searchTypeMenuRef = useRef<HTMLDivElement | null>(null);

  const subscriptionMedSafetyQuota = subscription?.medSafetyQuota ?? null;
  useEffect(() => {
    setOptimisticQuota(subscriptionMedSafetyQuota);
  }, [subscriptionMedSafetyQuota]);

  useEffect(() => {
    if (!subscriptionMedSafetyQuota) return;
    setSelectedSearchType((current) => current ?? subscriptionMedSafetyQuota.recommendedDefaultSearchType);
  }, [subscriptionMedSafetyQuota]);

  const medSafetyQuota = optimisticQuota ?? subscriptionMedSafetyQuota;
  const activeTier = subscription?.tier ?? "free";
  const isFreePlan = activeTier === "free";
  const activeSearchType = selectedSearchType ?? medSafetyQuota?.recommendedDefaultSearchType ?? "standard";
  const activeSearchMeta = getSearchCreditMeta(activeSearchType);
  const selectedSearchQuota = getQuotaForSearchType(medSafetyQuota, activeSearchType);
  const selectedQuotaRemaining = Math.max(0, Number(selectedSearchQuota?.totalRemaining ?? 0));
  const alternateSearchType: SearchCreditType = activeSearchType === "premium" ? "standard" : "premium";
  const alternateQuotaRemaining = Math.max(0, Number(getQuotaForSearchType(medSafetyQuota, alternateSearchType)?.totalRemaining ?? 0));
  const standardQuotaRemaining = Math.max(0, Number(medSafetyQuota?.standard.totalRemaining ?? 0));
  const premiumQuotaRemaining = Math.max(0, Number(medSafetyQuota?.premium.totalRemaining ?? 0));
  const activePlanTitle = getPlanDefinition(activeTier).title;
  const billingActionHref = isFreePlan
    ? withReturnTo("/settings/billing/upgrade", "/tools/med-safety")
    : `${withReturnTo("/settings/billing/upgrade", "/tools/med-safety")}#search-credits`;
  const medSafetySessionStorageKey = buildMedSafetySessionStorageKey(user?.userId ?? null);
  const quotaKnown = authStatus === "authenticated" && !billingLoading && !!medSafetyQuota;
  const canAsk = authStatus === "authenticated" && (!quotaKnown || selectedQuotaRemaining > 0);
  const hasConversation = messages.length > 0 || Boolean(streamingText);
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user") ?? null;
  const hasTypedInput = normalizeQuestionInput(input).length > 0;
  const isComposerLocked = showSessionDecisionPrompt;
  const canSubmit = !isComposerLocked && !isLoading && canAsk && (hasTypedInput || Boolean(selectedImage));
  const latestAnswerSummary = lastAssistantMessage ? parseAnswerSections(lastAssistantMessage.content)[0]?.lead ?? "" : "";
  const latestCopyText = lastAssistantMessage
    ? buildStructuredCopyText({
        title: lastSubmittedQuery || lastUserMessage?.content || t("AI 임상 검색 결과"),
        metaLines: [
          `${t("분석 시각")}: ${formatCopyDateTime(lastAssistantMessage.timestamp)}`,
          `${t("유형")}: ${t("임상 질문")}`,
        ],
        sections: [
          { title: t("요약"), body: latestAnswerSummary || lastAssistantMessage.content },
          { title: t("상세 결과"), body: lastAssistantMessage.content },
        ],
      })
    : "";

  useEffect(() => {
    setMounted(true);
    purgeLegacyMedSafetySessionStorage();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (authStatus === "loading") return;

    if (authStatus !== "authenticated" || !user?.userId) {
      setDidRestoreSession(true);
      return;
    }

    if (restoredSessionKeyRef.current === medSafetySessionStorageKey) {
      setDidRestoreSession(true);
      return;
    }

    const persisted = readPersistedMedSafetySession(medSafetySessionStorageKey);
    if (persisted) {
      setMessages(persisted.messages);
      setInput(persisted.input);
      setStreamingText("");
      setLastContinuationToken(persisted.lastContinuationToken);
      setError(null);
      setLastSubmittedQuery(persisted.lastSubmittedQuery);
      setSelectedImage(null);
      setSelectedImageName("");
      setShowSessionDecisionPrompt(persisted.showSessionDecisionPrompt);
    } else if (restoredSessionKeyRef.current && restoredSessionKeyRef.current !== medSafetySessionStorageKey) {
      setMessages([]);
      setInput("");
      setStreamingText("");
      setLastContinuationToken(null);
      setError(null);
      setLastSubmittedQuery("");
      setSelectedImage(null);
      setSelectedImageName("");
      setShowSessionDecisionPrompt(false);
    }

    restoredSessionKeyRef.current = medSafetySessionStorageKey;
    setDidRestoreSession(true);
  }, [mounted, authStatus, user?.userId, medSafetySessionStorageKey]);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    if (!isSearchTypeMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!searchTypeMenuRef.current?.contains(event.target as Node | null)) {
        setIsSearchTypeMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isSearchTypeMenuOpen]);

  useEffect(() => {
    if (!threadEndRef.current) return;
    threadEndRef.current.scrollIntoView({ block: "end" });
  }, [messages, streamingText, error]);

  useEffect(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [input]);

  useEffect(() => {
    if (!isComposerLocked) return;
    composerInputRef.current?.blur();
    setIsComposerFocused(false);
    setIsComposerDragOver(false);
    setIsSearchTypeMenuOpen(false);
  }, [isComposerLocked]);

  useEffect(() => {
    if (!mounted || !didRestoreSession) return;
    if (authStatus !== "authenticated" || !user?.userId) return;
    if (isLoading || streamingText) return;

    const hasPersistableSession =
      messages.some((message) => message.role === "assistant") ||
      input.trim().length > 0 ||
      Boolean(lastContinuationToken) ||
      Boolean(lastSubmittedQuery) ||
      showSessionDecisionPrompt;

    if (!hasPersistableSession) {
      clearPersistedMedSafetySession(medSafetySessionStorageKey);
      return;
    }

    writePersistedMedSafetySession(medSafetySessionStorageKey, {
      messages,
      input,
      lastContinuationToken,
      lastSubmittedQuery,
      showSessionDecisionPrompt,
      updatedAt: Date.now(),
    });
  }, [
    mounted,
    didRestoreSession,
    authStatus,
    user?.userId,
    medSafetySessionStorageKey,
    messages,
    input,
    lastContinuationToken,
    lastSubmittedQuery,
    showSessionDecisionPrompt,
    isLoading,
    streamingText,
  ]);

  function focusComposerSoon() {
    window.setTimeout(() => {
      composerInputRef.current?.focus();
    }, 30);
  }

  function resetConversation() {
    setMessages([]);
    setInput("");
    setStreamingText("");
    setError(null);
    setLastContinuationToken(null);
    setLastSubmittedQuery("");
    setSelectedImage(null);
    setSelectedImageName("");
    setShowSessionDecisionPrompt(false);
    clearPersistedMedSafetySession(medSafetySessionStorageKey);
  }

  function continueCurrentSession() {
    setShowSessionDecisionPrompt(false);
    focusComposerSoon();
  }

  function startNewQuestionFlow() {
    setShowSessionDecisionPrompt(false);
    resetConversation();
    window.scrollTo({ top: 0, behavior: "smooth" });
    focusComposerSoon();
  }

  async function selectImageFile(file: File) {
    if (isComposerLocked) return;
    if (!file.type.startsWith("image/")) {
      setError(t("이미지 파일만 첨부할 수 있습니다."));
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setError(t("이미지 용량이 너무 큽니다. 6MB 이하로 다시 시도해 주세요."));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSelectedImage(dataUrl);
      setSelectedImageName(file.name || t("첨부 이미지"));
      setError(null);
      focusComposerSoon();
    } catch {
      setError(t("이미지를 읽지 못했습니다. 다시 시도해 주세요."));
    }
  }

  function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void selectImageFile(file);
    event.target.value = "";
  }

  function removeSelectedImage() {
    setSelectedImage(null);
    setSelectedImageName("");
    focusComposerSoon();
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (isComposerLocked) return;
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    void selectImageFile(file);
  }

  function handleComposerDrop(event: React.DragEvent<HTMLDivElement>) {
    if (isComposerLocked) return;
    event.preventDefault();
    event.stopPropagation();
    setIsComposerDragOver(false);
    const file = Array.from(event.dataTransfer.files ?? []).find((entry) => entry.type.startsWith("image/"));
    if (!file) return;
    void selectImageFile(file);
  }

  function applyOptimisticQuotaConsume(searchType: SearchCreditType) {
    setOptimisticQuota((prev) => consumeOptimisticQuota(prev, searchType));
  }

  async function copyLatestAnswer() {
    if (!latestCopyText) return;
    try {
      const copied = await copyTextToClipboard(latestCopyText);
      if (copied) setCopiedKey("latest-answer");
      setCopyMessage(copied ? t("답변을 복사했습니다.") : t("클립보드를 사용할 수 없습니다."));
    } catch {
      setCopyMessage(t("복사에 실패했습니다."));
    }
  }

  async function submitQuestion(forcedQuery?: string) {
    if (isLoading) return;
    if (isComposerLocked) return;
    setIsSearchTypeMenuOpen(false);
    if (authStatus !== "authenticated") {
      setError(t("로그인이 필요합니다"));
      return;
    }
    if (quotaKnown && selectedQuotaRemaining <= 0) {
      setError(
        alternateQuotaRemaining > 0
          ? t(
              isFreePlan
                ? "선택한 검색의 잔여 크레딧이 없습니다. 채팅바의 검색 선택에서 다른 검색으로 바꾸거나, 모두 소진했다면 Plus 또는 Pro로 업그레이드해 주세요."
                : "선택한 검색의 잔여 크레딧이 없습니다. 채팅바의 검색 선택에서 다른 검색으로 바꾸거나 추가 크레딧을 구매해 주세요."
            )
          : t(
              isFreePlan
                ? "Free 체험 크레딧이 모두 소진되었습니다. Plus 또는 Pro로 업그레이드한 뒤 다시 시도해 주세요."
                : "AI 검색 잔여 크레딧이 없습니다. 추가 크레딧을 구매하거나 Plus/Pro 플랜 크레딧을 충전한 뒤 다시 시도해 주세요."
            )
      );
      return;
    }

    const typedQuestion = normalizeQuestionInput(String(forcedQuery ?? input));
    const imageToSend = selectedImage;
    const question = typedQuestion || (imageToSend ? t("첨부한 이미지를 임상적으로 설명하고 주의점과 대응 포인트를 알려 주세요.") : "");
    if (!question) {
      setError(t("질문을 입력해 주세요."));
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now().toString(36)}`,
      role: "user",
      content: typedQuestion || t("이미지와 함께 질문을 보냈습니다."),
      timestamp: Date.now(),
      imageDataUrl: imageToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSelectedImage(null);
    setSelectedImageName("");
    setIsLoading(true);
    setStreamingText("");
    setError(null);
    setShowSessionDecisionPrompt(false);
    setLastSubmittedQuery(question);

    try {
      const maxClientRetries = 1;
      let response: Response | null = null;
      let normalizedData: AnalyzePayload | null = null;
      let finalError = "med_safety_analyze_failed";

      for (let attempt = 0; attempt <= maxClientRetries; attempt += 1) {
        try {
          response = await fetchAnalyzeWithTimeout(
            {
              query: question,
              locale: lang,
              stream: true,
              searchType: activeSearchType,
              continuationToken: lastContinuationToken ?? undefined,
              ...(imageToSend ? { imageDataUrl: imageToSend } : {}),
            },
            MED_SAFETY_CLIENT_TIMEOUT_MS
          );

          const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
          if (response.ok && contentType.includes("text/event-stream")) {
            const streamed = await parseAnalyzeStreamResponse({
              response,
              onDelta: (text) => {
                if (!text) return;
                setStreamingText((prev) => `${prev}${text}`);
              },
            });
            if (streamed.data) {
              normalizedData = streamed.data;
              break;
            }
            finalError = streamed.error ?? "stream_result_missing";
          } else {
            const payloadRaw = (await response.json().catch(() => null)) as unknown;
            const parsedPayload = parseAnalyzePayload(payloadRaw);
            if (response.ok && parsedPayload.ok) {
              normalizedData = parsedPayload.data;
              break;
            }
            finalError = parsedPayload.ok ? "invalid_response_payload" : parsedPayload.error;
          }
          if (!shouldRetryAnalyzeError(response.status, finalError) || attempt >= maxClientRetries) break;
        } catch (cause: any) {
          finalError = String(cause?.message ?? "network_error");
          if (attempt >= maxClientRetries) break;
        }

        setStreamingText("");
        await waitMs(Math.min(2200, 500 * (attempt + 1)) + Math.floor(Math.random() * 180));
      }

      if (!response?.ok || !normalizedData) {
        setStreamingText("");
        if (String(finalError).toLowerCase().includes("insufficient_med_safety_credits")) {
          setError(
            alternateQuotaRemaining > 0
              ? t(
                  isFreePlan
                    ? "선택한 검색의 잔여 크레딧이 없습니다. 채팅바의 검색 선택에서 다른 검색으로 바꾸거나, 모두 소진했다면 Plus 또는 Pro로 업그레이드해 주세요."
                    : "선택한 검색의 잔여 크레딧이 없습니다. 채팅바의 검색 선택에서 다른 검색으로 바꾸거나 추가 크레딧을 구매해 주세요."
                )
              : t(
                  isFreePlan
                    ? "Free 체험 크레딧이 모두 소진되었습니다. Plus 또는 Pro로 업그레이드한 뒤 다시 시도해 주세요."
                    : "AI 검색 잔여 크레딧이 없습니다. 추가 크레딧을 구매하거나 Plus/Pro 플랜 크레딧을 충전한 뒤 다시 시도해 주세요."
                )
          );
        } else {
          setError(parseErrorMessage(finalError, t));
        }
        return;
      }

      setStreamingText("");
      const assistantMessage: Message = {
        id: `assistant-${normalizedData.analyzedAt.toString(36)}`,
        role: "assistant",
        content: normalizedData.answer,
        timestamp: normalizedData.analyzedAt,
        model: normalizedData.model,
        source: normalizedData.source,
      };
      setMessages((prev) => (normalizedData.startedFreshSession ? [userMessage, assistantMessage] : [...prev, assistantMessage]));
      setLastContinuationToken(normalizedData.continuationToken ?? null);
      setShowSessionDecisionPrompt(true);

      if (normalizedData.source === "openai_fallback") {
        setError(
          `${parseErrorMessage(String(normalizedData.fallbackReason ?? "openai_fallback"), t)} ${t("기본 안전 모드 답변을 표시합니다.")}`
        );
      } else {
        applyOptimisticQuotaConsume(normalizedData.searchType);
        setError(null);
      }
    } catch (cause: any) {
      setStreamingText("");
      setError(parseErrorMessage(String(cause?.message ?? "med_safety_analyze_failed"), t));
    } finally {
      setIsLoading(false);
      void reloadBilling();
    }
  }

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-3 pb-24 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pr-1">
            <div className={PAGE_TITLE_CLASS}>{t("AI 임상 검색")}</div>
            <div className="mt-1 text-[13px] leading-6 text-ios-sub">{t("간호 현장에서 약물, 기구, 수치, 절차, 상황 질문을 바로 물어보세요.")}</div>
          </div>
          <Link href="/tools" className={TOOL_LIST_LINK_CLASS}>
            {t("툴 목록")}
          </Link>
        </div>
        <Card className={`p-6 ${FLAT_CARD_CLASS}`}>
          <div className="text-[18px] font-bold text-ios-text">{t("페이지 준비 중...")}</div>
        </Card>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-3 pb-24 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pr-1">
            <div className={PAGE_TITLE_CLASS}>{t("AI 임상 검색")}</div>
            <div className="mt-1 text-[13px] leading-6 text-ios-sub">{t("간호 현장에서 약물, 기구, 수치, 절차, 상황 질문을 바로 물어보세요.")}</div>
          </div>
          <Link href="/tools" className={TOOL_LIST_LINK_CLASS}>
            {t("툴 목록")}
          </Link>
        </div>
        <Card className={`p-6 ${FLAT_CARD_CLASS}`}>
          <div className="text-[19px] font-bold text-ios-text">{t("로그인이 필요합니다")}</div>
          <div className="mt-2 text-[14px] leading-6 text-ios-sub">{t("AI 검색 사용 횟수는 계정 단위로 관리됩니다. 로그인 후 이용해 주세요.")}</div>
          <Button variant="secondary" className={`${PRIMARY_FLAT_BTN} mt-5`} onClick={() => router.push("/settings/account")}>
            {t("로그인/계정 설정")}
          </Button>
        </Card>
      </div>
    );
  }

  if (billingLoading) {
    return (
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-3 pb-24 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pr-1">
            <div className={PAGE_TITLE_CLASS}>{t("AI 임상 검색")}</div>
            <div className="mt-1 text-[13px] leading-6 text-ios-sub">{t("간호 현장에서 약물, 기구, 수치, 절차, 상황 질문을 바로 물어보세요.")}</div>
          </div>
          <Link href="/tools" className={TOOL_LIST_LINK_CLASS}>
            {t("툴 목록")}
          </Link>
        </div>
        <Card className={`p-6 ${FLAT_CARD_CLASS}`}>
          <div className="text-[18px] font-bold text-ios-text">{t("사용량 상태 확인 중...")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("AI 검색 잔여 횟수를 불러오고 있습니다.")}</div>
        </Card>
      </div>
    );
  }

  function buildMedSafetyMemoBlocks(
    query: string,
    answer: string,
    summary: string
  ) {
    const blocks: ReturnType<typeof createMemoBlock>[] = []

    blocks.push(
      createMemoBlock("callout", {
        text: "⚠️ AI 참고 정보 — 의료 판단 대체 불가",
        detailText:
          "본 결과는 참고용 자동 생성 정보이며 의료행위 판단의 근거로 사용할 수 없습니다. 모든 처치는 병원 지침, 처방, 의료진 확인을 우선해 결정해 주세요.",
      })
    )
    blocks.push(createMemoBlock("heading", { text: "질문" }))
    blocks.push(createMemoBlock("quote", { text: query || "—" }))

    if (summary && summary.trim() && summary !== query) {
      blocks.push(createMemoBlock("divider"))
      blocks.push(createMemoBlock("heading", { text: "요약" }))
      blocks.push(createMemoBlock("paragraph", { text: summary.trim() }))
    }

    blocks.push(createMemoBlock("divider"))
    blocks.push(createMemoBlock("heading", { text: "AI 분석 결과" }))

    const rawLines = (answer || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())

    let currentSectionTitle = ""
    let currentItems: string[] = []

    const flushSection = () => {
      if (currentSectionTitle) {
        blocks.push(createMemoBlock("paragraph", { text: currentSectionTitle }))
      }
      for (const ln of currentItems) {
        if (!ln) continue
        const cleaned = ln.replace(/^[-*•·]\s+/, "").replace(/^\d+[.)]\s+/, "").trim()
        if (cleaned) blocks.push(createMemoBlock("bulleted", { text: cleaned }))
      }
      currentItems = []
      currentSectionTitle = ""
    }

    for (const line of rawLines) {
      if (!line) { currentItems.push(""); continue }
      if (/[:：]$/.test(line) && line.replace(/[:：]$/, "").trim().length <= 56) {
        flushSection()
        currentSectionTitle = "▸ " + line.replace(/[:：]$/, "").trim()
        continue
      }
      currentItems.push(line)
    }
    flushSection()

    blocks.push(createMemoBlock("divider"))
    blocks.push(
      createMemoBlock("paragraph", {
        text: `🤖 AI 임상 검색 · ${new Date().toLocaleDateString("ko-KR")} · RNest`,
      })
    )
    return blocks
  }

  function saveLastAnswerToMemo() {
    if (!lastAssistantMessage) return
    const query = lastUserMessage?.content || lastSubmittedQuery || ""
    const answer = lastAssistantMessage.content || ""
    const summary = latestAnswerSummary || ""
    const title = (lastSubmittedQuery || query || t("AI 임상 검색 결과")).slice(0, 80)

    const blocks = buildMedSafetyMemoBlocks(query, answer, summary)
    const doc = sanitizeMemoDocument({
      title,
      icon: "book",
      blocks,
      tags: ["AI검색"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const latestMemo = store.getState().memo
    store.setMemoState({
      ...latestMemo,
      documents: { ...latestMemo.documents, [doc.id]: doc },
      recent: [doc.id, ...latestMemo.recent.filter((id) => id !== doc.id)].slice(0, 20),
    })

    if (typeof window !== "undefined") {
      try { sessionStorage.setItem("rnest_notebook_open", doc.id) } catch {}
    }
    router.push("/tools/notebook")
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />

      <div
        className="mx-auto w-full max-w-[1120px] px-1 pt-4 transition-[padding-bottom] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-2"
        style={{
          paddingBottom: showSessionDecisionPrompt
            ? "calc(228px + env(safe-area-inset-bottom))"
            : "calc(260px + env(safe-area-inset-bottom))",
        }}
      >
        <div className={`px-3 py-3 sm:px-4 ${OPEN_LAYOUT_CLASS}`}>
          <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(255,255,255,0))]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-1">
                <div className={PAGE_TITLE_CLASS}>{t("AI 임상 검색")}</div>
                <div className="mt-1 text-[13px] leading-6 text-ios-sub">{t("간호 현장에서 약물, 기구, 수치, 절차, 상황 질문을 바로 물어보세요.")}</div>
              </div>
              <Link href="/tools" className={TOOL_LIST_LINK_CLASS}>
                {t("툴 목록")}
              </Link>
            </div>

            <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[#DCE6F2] bg-[#F5F8FD] px-3 py-1.5 text-[11px] font-semibold text-[#24415D]">
                  {t("기본")}: {standardQuotaRemaining}
                </span>
                <span className={ACCENT_PILL_CLASS}>
                  {t("프리미엄")}: {premiumQuotaRemaining}
                </span>
                <span className={META_PILL_CLASS}>
                  {t("플랜")}: {activePlanTitle}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={billingActionHref}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#E8E8EC] bg-white px-4 text-[12.5px] font-semibold text-ios-text"
                >
                  {t(isFreePlan ? "플랜 보기" : "추가 크레딧 구매")}
                </Link>
                {hasConversation && lastAssistantMessage ? (
                  <button type="button" onClick={() => void copyLatestAnswer()} className={SECONDARY_FLAT_BTN}>
                    <AnimatedCopyLabel copied={copiedKey === "latest-answer"} label={t("복사")} />
                  </button>
                ) : null}
                {hasConversation && lastAssistantMessage ? (
                  <button type="button" onClick={saveLastAnswerToMemo} className={PRIMARY_FLAT_BTN}>
                    {t("메모에 정리하기")}
                  </button>
                ) : null}
                {hasConversation ? (
                  <button type="button" onClick={resetConversation} className={SECONDARY_FLAT_BTN}>
                    {t("새 검색")}
                  </button>
                ) : null}
                <Link
                  href="/tools/med-safety/recent"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#E8E8EC] bg-white px-4 text-[12.5px] font-semibold text-ios-text"
                >
                  {t("최근 기록")}
                </Link>
              </div>
            </div>

            {quotaKnown && selectedQuotaRemaining <= 0 ? (
              <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50/92 px-4 py-3 text-[13px] font-semibold leading-6 text-amber-700">
                <div>
                  {alternateQuotaRemaining > 0
                    ? t(
                        isFreePlan
                          ? "선택한 검색 크레딧이 없습니다. 채팅바의 검색 선택에서 다른 검색으로 바꾸거나, 모두 소진했다면 Plus 또는 Pro로 업그레이드해 주세요."
                          : "선택한 검색 크레딧이 없습니다. 채팅바의 검색 선택에서 다른 검색으로 바꾸거나 추가 크레딧을 구매해 주세요."
                      )
                    : t(
                        isFreePlan
                          ? "남은 Free 체험 크레딧이 없습니다. Plus 또는 Pro로 업그레이드한 뒤 다시 이용해 주세요."
                          : "남은 AI 검색 크레딧이 없습니다. 추가 크레딧을 구매하거나 Plus/Pro 플랜 크레딧을 충전한 뒤 다시 이용해 주세요."
                      )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alternateQuotaRemaining > 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedSearchType(alternateSearchType)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-amber-300 bg-white px-4 text-[12.5px] font-semibold text-amber-700"
                    >
                      {t("{type}로 전환", { type: getSearchCreditMeta(alternateSearchType).title })}
                    </button>
                  ) : null}
                  <Link
                    href={billingActionHref}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-amber-300 bg-white px-4 text-[12.5px] font-semibold text-amber-700"
                  >
                    {t(isFreePlan ? "플랜 보기" : "추가 크레딧 구매하기")}
                  </Link>
                </div>
              </div>
            ) : null}

            {!hasConversation ? (
              <div className="flex min-h-[calc(100dvh-360px)] flex-col justify-between pb-6 pt-10">
                <div className="mx-auto flex flex-1 max-w-[760px] flex-col items-center justify-center text-center">
                  <div className="text-[34px] font-bold tracking-[-0.05em] text-ios-text sm:text-[48px]">{t("무엇이든 물어보세요")}</div>
                  <div className="mt-4 text-[17px] leading-8 text-ios-sub sm:text-[18px]">
                    {t("약물, 기구, 검사 수치, 간호 절차, 상황 대응까지 한 번에 질문할 수 있습니다.")}
                  </div>
                </div>

                <div className="mx-auto mt-8 w-full max-w-[900px] px-1 text-[12.5px] leading-6 text-ios-sub">
                  {t(
                    "본 결과는 참고용 자동 생성 정보이며 의료행위 판단의 근거로 사용할 수 없습니다. 모든 처치는 병원 지침, 처방, 의료진 확인을 우선해 결정해 주세요."
                  )}
                </div>
              </div>
            ) : (
              <div className="mx-auto mt-8 w-full max-w-[900px] pb-10">
                <div className="space-y-9">
                  {messages.map((message) => (
                    <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div className={message.role === "user" ? "max-w-[86%] sm:max-w-[72%]" : "w-full max-w-[860px] min-w-0"}>
                        {message.role === "user" ? (
                          <div className={MESSAGE_USER_CLASS}>
                            {message.imageDataUrl ? (
                              <div className="mb-3 overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
                                <img src={message.imageDataUrl} alt="" className="max-h-[280px] w-full object-cover" />
                              </div>
                            ) : null}
                            <div className="whitespace-pre-wrap break-words text-[16px] leading-7">{message.content}</div>
                          </div>
                        ) : (
                          <AssistantAnswerSections content={message.content} />
                        )}
                        <div
                          className={`mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-ios-sub ${
                            message.role === "user" ? "justify-end" : ""
                          }`}
                        >
                          <span>{message.role === "user" ? t("나") : t("AI")}</span>
                          <span>{formatTime(message.timestamp)}</span>
                          {message.source === "openai_fallback" ? <span>{t("기본 안전 모드")}</span> : null}
                          {message.role === "assistant" && message.id === lastAssistantMessage?.id ? (
                            <button
                              type="button"
                              onClick={saveLastAnswerToMemo}
                              className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[11px] font-semibold text-[color:var(--rnest-accent)] transition hover:opacity-80"
                            >
                              <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3" aria-hidden="true">
                                <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                <path d="M10 2v3H6V2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                                <path d="M4 11h8M4 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                              </svg>
                              {t("메모에 정리하기")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}

                  {streamingText ? (
                    <div className="flex justify-start">
                      <div className="w-full max-w-[860px] min-w-0">
                        <div className={STREAMING_CARD_CLASS}>
                          <div className="whitespace-pre-wrap break-words">{streamingText}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-ios-sub">
                          <span>{t("AI")}</span>
                          <span>{t("작성 중...")}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div ref={threadEndRef} />
                </div>

                <div className="mx-auto mt-8 w-full px-1 text-[12.5px] leading-6 text-ios-sub">
                  {t(
                    "본 결과는 참고용 자동 생성 정보이며 의료행위 판단의 근거로 사용할 수 없습니다. 모든 처치는 병원 지침, 처방, 의료진 확인을 우선해 결정해 주세요."
                  )}
                </div>
              </div>
            )}

            {error ? (
              <div className="mx-auto mt-4 w-full max-w-[900px]">
                <div className="rounded-[24px] border border-red-200 bg-red-50/92 px-4 py-4 text-[14px] font-semibold leading-6 text-red-700">
                  {error}
                </div>
                {lastSubmittedQuery ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void submitQuestion(lastSubmittedQuery)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-red-200 bg-white px-4 text-[12.5px] font-semibold text-red-700"
                    >
                      {t("같은 질문 다시 시도")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-[env(safe-area-inset-bottom)] pt-8">
        <div className="pointer-events-auto mx-auto w-full max-w-[892px] px-2 pb-2 sm:px-4 sm:pb-3">
          <div
            className={`overflow-hidden rounded-[28px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showSessionDecisionPrompt ? "max-h-[120px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 translate-y-5 opacity-0"
            }`}
            aria-hidden={!showSessionDecisionPrompt}
          >
            <div className="pb-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={startNewQuestionFlow}
                  className="min-h-[62px] rounded-[20px] border border-[#E8E8EC] bg-white/98 px-4 py-3 text-left shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                >
                  <div className="text-[14px] font-semibold text-ios-text">{t("다른 질문하기")}</div>
                  <div className="mt-1 text-[11px] leading-5 text-ios-sub">{t("새 주제로 새로 시작")}</div>
                </button>
                <button
                  type="button"
                  onClick={continueCurrentSession}
                  className="min-h-[62px] rounded-[20px] border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-3 text-left shadow-[0_12px_28px_rgba(123,111,208,0.14)]"
                >
                  <div className="text-[14px] font-semibold text-[color:var(--rnest-accent)]">{t("이 결과에 대한 질문하기")}</div>
                  <div className="mt-1 text-[11px] leading-5 text-[color:var(--rnest-accent)]/80">{t("같은 흐름으로 이어서 질문")}</div>
                </button>
              </div>
            </div>
          </div>
          <div
            className={`rounded-[28px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showSessionDecisionPrompt
                ? "pointer-events-none max-h-0 translate-y-6 overflow-hidden opacity-0"
                : "max-h-[360px] translate-y-0 overflow-visible opacity-100"
            }`}
            aria-hidden={showSessionDecisionPrompt}
          >
            <div
              className={`rounded-[28px] border px-3 pb-2 pt-2 shadow-[0_16px_42px_rgba(15,23,42,0.24)] transition sm:px-4 ${
                isComposerDragOver
                  ? "border-[color:var(--rnest-accent)] bg-white/92 backdrop-blur-2xl"
                  : isComposerFocused
                  ? "border-[color:var(--rnest-accent-border)] bg-white/88 backdrop-blur-2xl"
                  : "border-white/70 bg-white/78 backdrop-blur-2xl"
              }`}
              onDragEnter={(event) => {
                if (isComposerLocked) return;
                event.preventDefault();
                event.stopPropagation();
                setIsComposerDragOver(true);
              }}
              onDragOver={(event) => {
                if (isComposerLocked) return;
                event.preventDefault();
                event.stopPropagation();
                if (!isComposerDragOver) setIsComposerDragOver(true);
              }}
              onDragLeave={(event) => {
                if (isComposerLocked) return;
                event.preventDefault();
                event.stopPropagation();
                const currentTarget = event.currentTarget;
                if (!currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsComposerDragOver(false);
                }
              }}
              onDrop={handleComposerDrop}
            >
              {selectedImage ? (
                <div className="mb-2 flex items-center gap-3 rounded-[20px] border border-[#EAE6F6] bg-white/86 px-3 py-2.5">
                  <img src={selectedImage} alt="" className="h-12 w-12 rounded-[14px] object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ios-text">{selectedImageName}</div>
                    <div className="mt-0.5 text-[11px] text-ios-sub">{t("질문과 함께 전송됩니다.")}</div>
                  </div>
                  <button
                    type="button"
                    onClick={removeSelectedImage}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5F3FA] text-ios-sub transition hover:bg-[#EEEAF8] hover:text-[color:var(--rnest-accent)]"
                    aria-label={t("이미지 제거")}
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <div className="flex min-h-[56px] flex-1 items-end rounded-[22px] border border-[#ECE7F7] bg-white/88 px-3 py-3 transition focus-within:border-[color:var(--rnest-accent-border)] focus-within:bg-white sm:px-4">
                    <textarea
                      ref={composerInputRef}
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onPaste={handleComposerPaste}
                      onFocus={() => setIsComposerFocused(true)}
                      onBlur={() => setIsComposerFocused(false)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          void submitQuestion();
                        }
                      }}
                      rows={1}
                      className="max-h-[220px] min-h-[28px] flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 text-[16px] leading-7 text-ios-text shadow-none outline-none placeholder:text-ios-sub disabled:cursor-not-allowed disabled:text-ios-sub"
                      placeholder={hasConversation ? t("예: 그럼 중심정맥으로만 줘야 하나요?") : t("예: norepinephrine 투여 시 주의사항이 뭐야?")}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={t("임상 질문 입력")}
                      disabled={isComposerLocked}
                    />
                  </div>
                  <button
                    type="button"
                    className={`${COMPOSER_SEND_BTN_CLASS} h-[56px] min-w-[56px] self-stretch rounded-[22px] px-0 sm:min-w-[60px]`}
                    onClick={() => void submitQuestion()}
                    disabled={!canSubmit}
                    aria-label={isLoading ? t("질문 중...") : t("보내기")}
                  >
                    {isLoading ? (
                      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={COMPOSER_ACTION_BTN_CLASS}
                    disabled={isComposerLocked}
                    aria-label={t("이미지 첨부")}
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <div ref={searchTypeMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsSearchTypeMenuOpen((current) => !current)}
                      className={COMPOSER_SELECTOR_BTN_CLASS}
                      disabled={isComposerLocked}
                      aria-haspopup="menu"
                      aria-expanded={isSearchTypeMenuOpen}
                      aria-label={t("모델 선택")}
                    >
                      <span>{t(activeSearchMeta.shortTitle)}</span>
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-ios-sub" aria-hidden="true">
                        <path d="M5 7.5l5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {isSearchTypeMenuOpen ? (
                      <div className="absolute bottom-[calc(100%+10px)] left-0 z-[80] w-[220px] max-w-[calc(100vw-32px)] rounded-[24px] border border-[#DCD7F1] bg-[rgba(247,244,255,0.82)] p-2.5 shadow-[0_22px_40px_rgba(15,23,42,0.18)] backdrop-blur-[22px]">
                        <div className="space-y-2">
                          {(["standard", "premium"] as const).map((type) => {
                            const meta = getSearchCreditMeta(type);
                            const active = activeSearchType === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => {
                                  setSelectedSearchType(type);
                                  setIsSearchTypeMenuOpen(false);
                                  if (type !== activeSearchType) {
                                    void trackBillingEvent("search_mode_selected", subscription?.tier ?? "free", {
                                      searchType: type,
                                      source: "med_safety_composer_picker",
                                    });
                                  }
                                }}
                                className={`flex w-full items-start justify-between gap-3 rounded-[18px] border px-3 py-3 text-left backdrop-blur-md transition ${
                                  active
                                    ? "border-[#CFC6F5] bg-[rgba(255,255,255,0.72)] shadow-[0_12px_28px_rgba(123,111,208,0.14)]"
                                    : "border-transparent bg-[rgba(255,255,255,0.34)] hover:border-[#E2DCF7] hover:bg-[rgba(255,255,255,0.55)]"
                                }`}
                                aria-pressed={active}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className={`text-[13px] font-semibold ${active ? "text-[color:var(--rnest-accent)]" : "text-ios-text"}`}>
                                    {t(meta.title)}
                                  </div>
                                  <div className="mt-0.5 text-[11.5px] leading-5 text-ios-sub">{t(meta.description)}</div>
                                </div>
                                <span
                                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                    active
                                      ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)] text-white"
                                      : "border-[#D7DCEA] bg-white text-transparent"
                                  }`}
                                  aria-hidden="true"
                                >
                                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                                    <path
                                      fillRule="evenodd"
                                      d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.26a1 1 0 0 1-1.42 0L3.29 9.165a1 1 0 1 1 1.42-1.408l4.09 4.123 6.49-6.543a1 1 0 0 1 1.414-.006z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="mt-2 px-1 text-[11px] text-ios-sub">
                <span>{t("환자 이름, 등록번호, 연락처 등 식별정보는 입력하지 마세요.")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {copyMessage ? (
        <div className="pointer-events-none fixed bottom-[calc(130px+env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full bg-black px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          {copyMessage}
        </div>
      ) : null}
    </>
  );
}

export default ToolMedSafetyPage;
