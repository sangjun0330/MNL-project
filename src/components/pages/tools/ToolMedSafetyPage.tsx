"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { requestPlanCheckout } from "@/lib/billing/client";
import { getCheckoutProductDefinition } from "@/lib/billing/plans";
import { BillingCheckoutSheet } from "@/components/billing/BillingCheckoutSheet";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { copyTextToClipboard } from "@/lib/structuredCopy";
import { useI18n } from "@/lib/useI18n";

const FLAT_CARD_CLASS = "rounded-[32px] border border-[#E8E8EC] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.04)]";
const PAGE_TITLE_CLASS = "text-[24px] font-bold tracking-[-0.015em] text-ios-text md:text-[26px]";
const TOOL_LIST_LINK_CLASS =
  "inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#E8E8EC] bg-white px-4 text-[12px] font-semibold leading-none text-ios-text";
const PRIMARY_FLAT_BTN =
  "h-11 rounded-full border border-black bg-black px-4 text-[14px] font-semibold text-white shadow-none hover:bg-black";
const SECONDARY_FLAT_BTN =
  "h-11 rounded-full border border-[#E8E8EC] bg-white px-4 text-[14px] font-semibold text-ios-text shadow-none hover:bg-[#F7F7F8]";
const MESSAGE_USER_CLASS = "rounded-[24px] bg-[#F3F4F6] px-4 py-3 text-[15px] leading-6 text-ios-text";
const MESSAGE_ASSISTANT_CLASS = "rounded-[28px] bg-[#FBFBFC] px-5 py-4 text-[15px] leading-7 text-ios-text";
const META_PILL_CLASS = "inline-flex items-center rounded-full border border-[#E8E8EC] bg-[#F7F7F8] px-3 py-1.5 text-[11px] font-semibold text-ios-sub";
const QUICK_CHIP_CLASS =
  "inline-flex items-center rounded-full border border-[#E8E8EC] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-ios-text transition hover:bg-[#F7F7F8]";
const CANVAS_SURFACE_CLASS = "rounded-[28px] border border-[#ECECF0] bg-[#FBFBFC] p-3 sm:p-4";
const MED_SAFETY_CLIENT_TIMEOUT_MS = 480_000;
const RETRY_WITH_DATA_MESSAGE = "네트워크가 불안정합니다. 데이터(모바일 네트워크)를 켠 뒤 다시 시도해 주세요.";
const QUICK_PROMPTS = [
  "norepinephrine이 뭐야?",
  "heparin vs enoxaparin 차이",
  "pump occlusion 알람 대응",
  "중심정맥관 드레싱 언제 교체해?",
];

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  model?: string;
  source?: "openai_live" | "openai_fallback";
};

type AnalyzePayload = {
  answer: string;
  query: string;
  model: string;
  analyzedAt: number;
  source: "openai_live" | "openai_fallback";
  fallbackReason?: string | null;
  responseId?: string | null;
  conversationId?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parseErrorMessage(raw: string, t: TranslateFn) {
  if (!raw) return t("질문 처리 중 오류가 발생했습니다.");
  const normalized = String(raw).toLowerCase();
  if (normalized.includes("login_required")) return t("로그인이 필요합니다");
  if (normalized.includes("invalid_origin") || normalized.includes("missing_origin") || normalized.includes("invalid_referer")) {
    return t("보안 검증에 실패했습니다. 앱을 새로고침한 뒤 다시 시도해 주세요.");
  }
  if (normalized.includes("insufficient_med_safety_credits"))
    return t("AI 검색 잔여 크레딧이 없습니다. 크레딧 10회를 구매하거나 Pro 기본 크레딧이 초기화된 뒤 다시 시도해 주세요.");
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
    return t("현재 계정에 gpt-5.2 모델 접근 권한이 없습니다. API 계정 권한을 확인해 주세요.");
  }
  if (normalized.includes("openai_responses_403")) {
    return t(RETRY_WITH_DATA_MESSAGE);
  }
  if (normalized.includes("openai_responses_404") || normalized.includes("model_not_found"))
    return t("gpt-5.2 모델을 찾을 수 없습니다. API 설정과 계정 권한을 확인해 주세요.");
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
      responseId: typeof node.responseId === "string" ? node.responseId : null,
      conversationId: typeof node.conversationId === "string" ? node.conversationId : null,
    },
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
    return (await Promise.race([
      fetch("/api/tools/med-safety/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

export function ToolMedSafetyPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { status: authStatus, user } = useAuthState();
  const { loading: billingLoading, subscription, reload: reloadBilling } = useBillingAccess();
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [lastConversationId, setLastConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [creditPaying, setCreditPaying] = useState(false);
  const [creditCheckoutSheetOpen, setCreditCheckoutSheetOpen] = useState(false);
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const creditPack = getCheckoutProductDefinition("credit10");
  const medSafetyQuota = subscription?.medSafetyQuota;
  const quotaRemaining = Math.max(0, Number(medSafetyQuota?.totalRemaining ?? 0));
  const dailyRemaining = Math.max(0, Number(medSafetyQuota?.dailyRemaining ?? 0));
  const extraCredits = Math.max(0, Number(medSafetyQuota?.extraCredits ?? 0));
  const quotaKnown = authStatus === "authenticated" && !billingLoading && !!medSafetyQuota;
  const canAsk = authStatus === "authenticated" && (!quotaKnown || quotaRemaining > 0);
  const hasConversation = messages.length > 0 || Boolean(streamingText);
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (!threadEndRef.current) return;
    threadEndRef.current.scrollIntoView({ block: "end" });
  }, [messages, streamingText, error]);

  async function startCreditCheckout() {
    if (creditPaying || authStatus !== "authenticated") return;
    setError(null);
    setCreditCheckoutSheetOpen(true);
  }

  async function confirmCreditCheckout() {
    if (creditPaying || authStatus !== "authenticated") return;
    setCreditPaying(true);
    setError(null);
    setCreditCheckoutSheetOpen(false);
    try {
      await requestPlanCheckout("credit10");
    } catch (cause: any) {
      const message = String(cause?.message ?? "checkout_failed");
      if (!message.includes("USER_CANCEL")) {
        if (message.toLowerCase().includes("billing_schema_outdated_credit_pack_columns")) {
          setError(t("서버 DB 스키마가 아직 최신이 아닙니다. 마이그레이션 적용 후 다시 시도해 주세요."));
        } else {
          setError(t("크레딧 결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요."));
        }
      }
    } finally {
      setCreditPaying(false);
    }
  }

  function resetConversation() {
    setMessages([]);
    setInput("");
    setStreamingText("");
    setError(null);
    setLastResponseId(null);
    setLastConversationId(null);
    setLastSubmittedQuery("");
  }

  async function copyLatestAnswer() {
    if (!lastAssistantMessage?.content) return;
    try {
      const copied = await copyTextToClipboard(lastAssistantMessage.content);
      setCopyMessage(copied ? t("답변을 복사했습니다.") : t("클립보드를 사용할 수 없습니다."));
    } catch {
      setCopyMessage(t("복사에 실패했습니다."));
    }
  }

  async function submitQuestion(forcedQuery?: string) {
    if (isLoading) return;
    if (authStatus !== "authenticated") {
      setError(t("로그인이 필요합니다"));
      return;
    }
    if (quotaKnown && quotaRemaining <= 0) {
      setError(t("AI 검색 잔여 크레딧이 없습니다. 크레딧 10회를 구매하거나 Pro 기본 크레딧이 초기화된 뒤 다시 시도해 주세요."));
      return;
    }

    const question = String(forcedQuery ?? input)
      .replace(/\s+/g, " ")
      .trim();
    if (!question) {
      setError(t("질문을 입력해 주세요."));
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now().toString(36)}`,
      role: "user",
      content: question,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingText("");
    setError(null);
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
              previousResponseId: lastResponseId ?? undefined,
              conversationId: lastConversationId ?? undefined,
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
        setError(parseErrorMessage(finalError, t));
        return;
      }

      setStreamingText("");
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${normalizedData.analyzedAt.toString(36)}`,
          role: "assistant",
          content: normalizedData.answer,
          timestamp: normalizedData.analyzedAt,
          model: normalizedData.model,
          source: normalizedData.source,
        },
      ]);
      setLastResponseId(normalizedData.responseId ?? null);
      setLastConversationId(normalizedData.conversationId ?? null);

      if (normalizedData.source === "openai_fallback") {
        setError(
          `${parseErrorMessage(String(normalizedData.fallbackReason ?? "openai_fallback"), t)} ${t("기본 안전 모드 답변을 표시합니다.")}`
        );
      } else {
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

  return (
    <>
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

        <Card className={`p-5 sm:p-6 ${FLAT_CARD_CLASS}`}>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-black px-3 py-1.5 text-[11px] font-semibold text-white">
                  {t("크레딧")}: {quotaRemaining}
                </span>
                <span className={META_PILL_CLASS}>
                  {t("기본")}: {medSafetyQuota?.isPro ? `${dailyRemaining}/${medSafetyQuota.dailyLimit}` : t("해당 없음")}
                </span>
                <span className={META_PILL_CLASS}>
                  {t("추가 크레딧")}: {extraCredits}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void startCreditCheckout()}
                  disabled={creditPaying}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#E8E8EC] bg-white px-4 text-[12.5px] font-semibold text-ios-text disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creditPaying ? t("결제창 준비 중...") : t("추가 크레딧 구매")}
                </button>
                <Link
                  href="/tools/med-safety/recent"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-[#E8E8EC] bg-white px-4 text-[12.5px] font-semibold text-ios-text"
                >
                  {t("최근 기록")}
                </Link>
              </div>
            </div>

            {quotaKnown && quotaRemaining <= 0 ? (
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-semibold leading-6 text-amber-700">
                {t("남은 AI 검색 크레딧이 없습니다. 크레딧 10회를 구매하거나 Pro 기본 크레딧이 초기화된 뒤 다시 이용해 주세요.")}
              </div>
            ) : null}

            {!hasConversation ? (
              <div className="flex min-h-[420px] flex-col justify-center py-2 sm:min-h-[500px]">
                <div className="mx-auto max-w-[620px] text-center">
                  <div className="text-[30px] font-bold tracking-[-0.04em] text-ios-text sm:text-[36px]">{t("무엇이든 물어보세요")}</div>
                  <div className="mt-3 text-[15px] leading-7 text-ios-sub">
                    {t("약물, 기구, 검사 수치, 간호 절차, 상황 대응까지 한 번에 질문할 수 있습니다.")}
                  </div>
                </div>

                <div className={`mx-auto mt-8 w-full max-w-[720px] ${CANVAS_SURFACE_CLASS}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitQuestion();
                        }
                      }}
                      className="h-14 flex-1 rounded-[20px] border-0 bg-white px-5 text-[16px] shadow-none"
                      placeholder={t("예: norepinephrine 투여 시 주의사항이 뭐야?")}
                      autoCapitalize="off"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      variant="secondary"
                      className={`${PRIMARY_FLAT_BTN} h-12 shrink-0 px-6`}
                      onClick={() => void submitQuestion()}
                      disabled={isLoading || !canAsk}
                    >
                      {isLoading ? t("질문 중...") : t("AI 검색")}
                    </Button>
                  </div>
                  <div className="mt-3 text-[12px] leading-5 text-ios-sub">
                    {t("환자 이름, 등록번호, 연락처 등 식별정보는 입력하지 마세요.")}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className={QUICK_CHIP_CLASS}
                        onClick={() => void submitQuestion(prompt)}
                        disabled={isLoading || !canAsk}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="max-h-[60vh] overflow-y-auto pr-1">
                  <div className="space-y-6">
                    {messages.map((message) => (
                      <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                        <div className={message.role === "user" ? "max-w-[86%]" : "max-w-full min-w-0 flex-1"}>
                          <div className={message.role === "user" ? MESSAGE_USER_CLASS : MESSAGE_ASSISTANT_CLASS}>
                            <div className="whitespace-pre-wrap break-words">{message.content}</div>
                          </div>
                          <div
                            className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ios-sub ${
                              message.role === "user" ? "justify-end" : ""
                            }`}
                          >
                            <span>{message.role === "user" ? t("나") : t("AI")}</span>
                            <span>{formatTime(message.timestamp)}</span>
                            {message.model ? <span>{message.model}</span> : null}
                            {message.source === "openai_fallback" ? <span>{t("기본 안전 모드")}</span> : null}
                          </div>
                        </div>
                      </div>
                    ))}

                    {streamingText ? (
                      <div className="flex justify-start">
                        <div className="max-w-full min-w-0 flex-1">
                          <div className={MESSAGE_ASSISTANT_CLASS}>
                            <div className="whitespace-pre-wrap break-words">{streamingText}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ios-sub">
                            <span>{t("AI")}</span>
                            <span>{t("작성 중...")}</span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div ref={threadEndRef} />
                  </div>
                </div>

                <div className={CANVAS_SURFACE_CLASS}>
                  <div className="text-[13px] font-semibold text-ios-sub">{t("후속 질문")}</div>
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitQuestion();
                      }
                    }}
                    className="mt-3 min-h-[116px] rounded-[20px] border-0 bg-white px-4 py-3 text-[15px] leading-6 text-ios-text"
                    placeholder={t("예: 그럼 중심정맥으로만 줘야 하나요?")}
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[12px] leading-5 text-ios-sub">
                      {t("이전 답변을 이어서 묻습니다. 새 주제로 바꾸려면 `새 검색`을 눌러 주세요.")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copyLatestAnswer()} className={SECONDARY_FLAT_BTN} disabled={!lastAssistantMessage}>
                        {t("복사")}
                      </button>
                      <button type="button" onClick={resetConversation} className={SECONDARY_FLAT_BTN}>
                        {t("새 검색")}
                      </button>
                      <Link
                        href="/tools/med-safety/recent"
                        className="inline-flex h-11 items-center justify-center rounded-full border border-[#E8E8EC] bg-white px-4 text-[14px] font-semibold text-ios-text"
                      >
                        {t("최근 기록")}
                      </Link>
                      <Button
                        variant="secondary"
                        className={`${PRIMARY_FLAT_BTN} px-5`}
                        onClick={() => void submitQuestion()}
                        disabled={isLoading || !canAsk}
                      >
                        {isLoading ? t("질문 중...") : t("보내기")}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 text-[12px] leading-5 text-ios-sub">
                    {t("환자 이름, 등록번호, 연락처 등 식별정보는 입력하지 마세요.")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {error ? (
          <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
            <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-[14px] font-semibold leading-6 text-red-700">{error}</div>
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
          </Card>
        ) : null}

        <div className="px-1 text-[12.5px] leading-6 text-ios-sub">
          <div>
            {t(
              "본 결과는 참고용 자동 생성 정보이며 의료행위 판단의 근거로 사용할 수 없습니다. 모든 처치는 병원 지침, 처방, 의료진 확인을 우선해 결정해 주세요."
            )}
          </div>
        </div>
      </div>

      <BillingCheckoutSheet
        open={creditCheckoutSheetOpen}
        onClose={() => setCreditCheckoutSheetOpen(false)}
        onConfirm={() => void confirmCreditCheckout()}
        loading={creditPaying}
        productTitle={t(creditPack.title)}
        productSubtitle={t("AI 임상 검색 전용")}
        priceKrw={creditPack.priceKrw}
        periodLabel={t("10회 사용권 · 소진 전까지 유지")}
        accountEmail={user?.email ?? null}
        confirmLabel={t("결제 계속")}
      />

      {copyMessage ? (
        <div className="pointer-events-none fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full bg-black px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          {copyMessage}
        </div>
      ) : null}
    </>
  );
}

export default ToolMedSafetyPage;
