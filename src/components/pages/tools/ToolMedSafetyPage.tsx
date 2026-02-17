"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useI18n } from "@/lib/useI18n";

const FLAT_CARD_CLASS = "border-[color:var(--wnl-accent-border)] bg-white shadow-none";
const PRIMARY_FLAT_BTN =
  "h-11 rounded-xl border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] px-4 text-[14px] font-semibold text-[color:var(--wnl-accent)] shadow-none hover:bg-[color:var(--wnl-accent-soft)]";
const SECONDARY_FLAT_BTN =
  "h-11 rounded-xl border border-ios-sep bg-white px-4 text-[14px] font-semibold text-ios-text shadow-none hover:bg-ios-bg";
const SEGMENT_WRAPPER_CLASS = "inline-flex rounded-2xl border border-ios-sep bg-ios-bg p-1";
type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

type ClinicalMode = "ward" | "er" | "icu";
type ClinicalSituation = "general" | "pre_admin" | "during_admin" | "event_response";
type QueryIntent = "medication" | "device" | "scenario";

type MedSafetyItemType = "medication" | "device" | "unknown";
type MedSafetyQuickStatus = "OK" | "CHECK" | "STOP";
type MedSafetyResultKind = "medication" | "device" | "scenario";
type MedSafetyRiskLevel = "low" | "medium" | "high";

type MedSafetyAnalyzeResult = {
  resultKind: MedSafetyResultKind;
  oneLineConclusion: string;
  riskLevel: MedSafetyRiskLevel;
  item: {
    name: string;
    type: MedSafetyItemType;
    aliases: string[];
    highRiskBadges: string[];
    primaryUse: string;
    confidence: number;
  };
  quick: {
    status: MedSafetyQuickStatus;
    topActions: string[];
    topNumbers: string[];
    topRisks: string[];
  };
  do: {
    steps: string[];
    calculatorsNeeded: string[];
    compatibilityChecks: string[];
  };
  safety: {
    holdRules: string[];
    monitor: string[];
    escalateWhen: string[];
  };
  institutionalChecks: string[];
  sbar: {
    situation: string;
    background: string;
    assessment: string;
    recommendation: string;
  };
  patientScript20s: string;
  modePriority: string[];
  confidenceNote: string;
  searchAnswer?: string;
  suggestedNames?: string[];
  generatedText?: string;
  model: string;
  analyzedAt: number;
  source: "openai_live" | "openai_fallback";
  fallbackReason?: string | null;
  openaiResponseId?: string | null;
  openaiConversationId?: string | null;
};

type MedSafetyCacheRecord = {
  savedAt: number;
  data: MedSafetyAnalyzeResult;
};

const MED_SAFETY_CACHE_KEY = "med_safety_cache_v1";
const MED_SAFETY_LAST_MODEL_KEY = "med_safety_last_model_v1";
const MED_SAFETY_DEFAULT_MODEL = "gpt-5-mini-202508-07";
const RETRY_WITH_DATA_MESSAGE = "네트워크가 불안정합니다. 데이터(모바일 네트워크)를 켠 뒤 다시 AI 분석 실행을 눌러 시도해 주세요.";

const MODE_OPTIONS: Array<{ value: ClinicalMode; label: string }> = [
  { value: "ward", label: "병동" },
  { value: "er", label: "ER" },
  { value: "icu", label: "ICU" },
];

const SITUATION_OPTIONS: Array<{ value: ClinicalSituation; label: string }> = [
  { value: "general", label: "일반 검색" },
  { value: "pre_admin", label: "투여 전 확인" },
  { value: "during_admin", label: "투여 중 모니터" },
  { value: "event_response", label: "이상/알람 대응" },
];

const QUERY_INTENT_OPTIONS: Array<{ value: QueryIntent; label: string; hint: string }> = [
  { value: "medication", label: "약물", hint: "약물명 단답 입력 (예: norepinephrine)" },
  { value: "device", label: "의료기구", hint: "기구명 단답 입력 (예: IV infusion pump)" },
  { value: "scenario", label: "상황질문", hint: "질문 중심으로 자유 답변" },
];

const SITUATION_INPUT_GUIDE: Record<
  ClinicalSituation,
  {
    queryPlaceholder: string;
    summaryPlaceholder: string;
    cue: string;
  }
> = {
  general: {
    queryPlaceholder: "예: heparin flush 라인 주의점 요약.",
    summaryPlaceholder: "(선택) 목적, 핵심 V/S, 사용 약물/기구",
    cue: "일반 검색 질문을 짧게 입력하세요.",
  },
  pre_admin: {
    queryPlaceholder: "예: 투여 전 확인 순서 알려줘.",
    summaryPlaceholder: "(선택) 알레르기, V/S, 주요 검사",
    cue: "투여 전 확인 질문을 짧게 입력하세요.",
  },
  during_admin: {
    queryPlaceholder: "예: 주입 중 발진 발생, 먼저 뭘 할까?",
    summaryPlaceholder: "(선택) 속도, 증상 시작 시점, V/S",
    cue: "투여 중 상황을 짧게 입력하세요.",
  },
  event_response: {
    queryPlaceholder: "예: pump occlusion 알람 반복, 대처 순서?",
    summaryPlaceholder: "(선택) 알람 종류, 증상, 현재 속도",
    cue: "알람/이상 상황을 짧게 입력하세요.",
  },
};

const NAME_ONLY_INPUT_GUIDE: Record<Exclude<QueryIntent, "scenario">, { placeholder: string; helper: string }> = {
  medication: {
    placeholder: "예: norepinephrine",
    helper: "약물명만 단답으로 입력하세요. 예: norepinephrine, furosemide, vancomycin",
  },
  device: {
    placeholder: "예: IV infusion pump",
    helper: "의료기구명만 단답으로 입력하세요. 예: syringe pump, Foley catheter, central line",
  },
};

function isNameOnlyInput(value: string) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  if (normalized.length > 80) return false;
  if (/[?？!]/.test(normalized)) return false;
  if (/[{}[\]<>]/.test(normalized)) return false;
  if (/(어떻게|무엇|왜|언제|순서|절차|대응|기준|알려줘|해줘|질문|what|how|when|why|please)/i.test(normalized)) {
    return false;
  }
  const words = normalized.split(" ").filter(Boolean).length;
  return words <= 6;
}

function parseErrorMessage(raw: string) {
  if (!raw) return "분석 중 오류가 발생했습니다.";
  const normalized = String(raw).toLowerCase();
  if (normalized.includes("login_required")) return "로그인이 필요합니다.";
  if (normalized.includes("paid_plan_required")) return "유료 플랜 전용 기능입니다. 플랜 업그레이드 후 이용해 주세요.";
  if (normalized.includes("missing_openai_api_key")) return "AI API 키가 설정되지 않았습니다.";
  if (normalized.includes("query_or_image_required")) return "텍스트를 입력하거나 사진을 업로드해 주세요.";
  if (normalized.includes("image_too_large")) return "이미지 용량이 너무 큽니다. 6MB 이하로 다시 업로드해 주세요.";
  if (normalized.includes("image_type_invalid")) return "이미지 파일만 업로드할 수 있습니다.";
  if (normalized.includes("client_timeout")) return RETRY_WITH_DATA_MESSAGE;
  if (normalized.includes("openai_timeout") || normalized.includes("aborted")) return RETRY_WITH_DATA_MESSAGE;
  if (normalized.includes("openai_network_")) return RETRY_WITH_DATA_MESSAGE;
  if (normalized.includes("openai_responses_401"))
    return "AI API 키가 유효하지 않거나 만료되었습니다. .env.local 환경변수를 확인해 주세요.";
  if (normalized.includes("openai_responses_403")) {
    if (/(insufficient_permissions|does not have access|model_not_found|permission|access to model)/i.test(String(raw))) {
      return "현재 계정에 해당 모델 접근 권한이 없습니다. 모델명을 변경해 다시 시도해 주세요.";
    }
    return RETRY_WITH_DATA_MESSAGE;
  }
  if (normalized.includes("openai_responses_404") || normalized.includes("model_not_found"))
    return "요청한 모델을 찾을 수 없습니다. 모델명을 확인하거나 기본 fallback 모델로 다시 시도해 주세요.";
  if (normalized.includes("openai_responses_429")) return "요청 한도가 초과되었습니다. 잠시 후 다시 AI 분석 실행을 눌러 시도해 주세요.";
  if (normalized.includes("openai_responses_400") && /(previous_response|conversation)/i.test(String(raw)))
    return "이전 대화 상태 동기화에 실패했습니다. 다시 AI 분석 실행을 눌러 새로 시도해 주세요.";
  if (normalized.includes("openai_responses_400") && /(max_output|max output|token limit|too many tokens|context length)/i.test(String(raw)))
    return "AI 응답 길이 제한으로 요청이 중단되었습니다. 잠시 후 다시 AI 분석 실행을 눌러 시도해 주세요.";
  if (normalized.includes("openai_responses_400"))
    return "AI 요청 처리 중 오류가 발생했습니다. 데이터(모바일 네트워크)를 켠 뒤 다시 AI 분석 실행을 눌러 시도해 주세요.";
  if (normalized.includes("openai_empty_text")) return "AI 서버 응답 본문이 비어 다시 시도했습니다. 잠시 후 다시 AI 분석 실행을 눌러 주세요.";
  if (/openai_responses_(408|409|425|500|502|503|504)/.test(normalized)) return RETRY_WITH_DATA_MESSAGE;
  if (normalized.includes("openai_responses_")) return "AI 요청이 실패했습니다. 다시 AI 분석 실행을 눌러 시도해 주세요.";
  if (normalized.includes("openai_invalid_json_payload"))
    return "AI 응답이 비정형으로 와서 자동 정리 결과로 표시했습니다.";
  return "분석 중 오류가 발생했습니다. 다시 AI 분석 실행을 눌러 시도해 주세요.";
}

function buildAnalyzeCacheKey(args: {
  query: string;
  patientSummary: string;
  mode: ClinicalMode;
  queryIntent: QueryIntent;
  situation: ClinicalSituation;
  imageFile: File | null;
}) {
  const query = args.query.replace(/\s+/g, " ").trim().toLowerCase();
  const summary = args.patientSummary.replace(/\s+/g, " ").trim().toLowerCase();
  const imageSig = args.imageFile ? `${args.imageFile.name}:${args.imageFile.size}:${args.imageFile.type}` : "";
  return [args.mode, args.queryIntent, args.situation, query, summary, imageSig].join("|");
}

function writeMedSafetyCache(cacheKey: string, data: MedSafetyAnalyzeResult) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(MED_SAFETY_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, MedSafetyCacheRecord>) : {};
    const next: Record<string, MedSafetyCacheRecord> = {
      ...parsed,
      [cacheKey]: {
        savedAt: Date.now(),
        data,
      },
    };
    const entries = Object.entries(next)
      .sort((a, b) => (b[1]?.savedAt ?? 0) - (a[1]?.savedAt ?? 0))
      .slice(0, 30);
    const trimmed = Object.fromEntries(entries);
    window.localStorage.setItem(MED_SAFETY_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore cache write failure
  }
}

function readMedSafetyCache(cacheKey: string): MedSafetyAnalyzeResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MED_SAFETY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, MedSafetyCacheRecord>;
    const hit = parsed?.[cacheKey];
    if (!hit?.data) return null;
    return hit.data;
  } catch {
    return null;
  }
}

function shouldRetryAnalyzeError(status: number, rawError: string) {
  const error = String(rawError ?? "").toLowerCase();
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (/openai_network_|openai_timeout|openai_empty_text|openai_responses_(408|409|425|429|500|502|503|504)/.test(error))
    return true;
  if (/openai_responses_403/.test(error) && /(html|forbidden|proxy|firewall|blocked|access denied|cloudflare)/.test(error)) return true;
  return false;
}

async function waitMs(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchAnalyzeWithTimeout(form: FormData, timeoutMs: number) {
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
        body: form,
        cache: "no-store",
        signal: controller.signal,
      }),
      timeoutPromise,
    ])) as Response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseCameraStartError(cause: unknown) {
  const name = String((cause as any)?.name ?? "");
  const message = String((cause as any)?.message ?? "");
  const merged = `${name} ${message}`.toLowerCase();
  if (merged.includes("notallowed")) return "카메라 권한이 거부되었습니다. 브라우저 권한을 허용해 주세요.";
  if (merged.includes("notfound") || merged.includes("devicesnotfound")) return "사용 가능한 카메라를 찾을 수 없습니다.";
  if (merged.includes("notreadable") || merged.includes("trackstart")) return "카메라가 다른 앱에서 사용 중입니다. 다른 앱을 종료 후 다시 시도해 주세요.";
  if (merged.includes("securecontext") || merged.includes("https")) return "카메라는 HTTPS 또는 localhost에서만 사용할 수 있습니다.";
  return "카메라를 시작하지 못했습니다. 권한/브라우저 환경을 확인해 주세요.";
}

function kindLabel(kind: MedSafetyResultKind) {
  if (kind === "medication") return "약물";
  if (kind === "device") return "의료기구";
  return "상황";
}

function modeLabel(mode: ClinicalMode) {
  if (mode === "ward") return "병동";
  if (mode === "er") return "ER";
  return "ICU";
}

function situationLabel(situation: ClinicalSituation) {
  const hit = SITUATION_OPTIONS.find((option) => option.value === situation);
  return hit?.label ?? "일반 검색";
}

function queryIntentLabel(intent: QueryIntent) {
  const hit = QUERY_INTENT_OPTIONS.find((option) => option.value === intent);
  return hit?.label ?? "약물";
}

function formatDateTime(value: number) {
  const d = new Date(value);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
}

function isJsonFragmentLine(value: string) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^(?:[-*•·]|\d+[).])\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!text) return true;
  if (/^[\[\]{}]+,?$/.test(text)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]{2,}"?\s*:\s*/.test(text)) return true;
  if (/^"[^"]{3,}"\s*:\s*/.test(text)) return true;
  if (/:\s*(?:\{|\[|"[^"]*"|true|false|null|-?\d+(?:\.\d+)?)(?:\s*,)?$/.test(text) && /["{}_:\[\],]/.test(text)) {
    return true;
  }
  if (/(?:^|["\s])(?:resultKind|riskLevel|oneLineConclusion|item|quick|topActions|topNumbers|topRisks|do|steps|calculatorsNeeded|compatibilityChecks|safety|holdRules|monitor|escalateWhen|patientScript20s|modePriority|confidenceNote|status|sbar|institutionalChecks)\s*[:"]/i.test(text)) {
    return true;
  }
  if (/^(?:high|medium|low|ok|check|stop|medication|device|scenario)"?,?$/i.test(text)) return true;
  const punctuation = (text.match(/[{}[\]":,]/g) ?? []).length;
  if (punctuation >= Math.max(12, Math.floor(text.length * 0.12))) return true;
  return false;
}

function normalizeDisplayLine(value: string) {
  const collapsed = String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+,/g, ",")
    .trim();
  const withoutListPrefix = collapsed.replace(/^(?:[-*•·]|\d+[).])\s*/, "").trim();
  const withoutTrailingComma = withoutListPrefix.replace(/,$/, "").trim();
  if (!withoutTrailingComma) return "";
  if (isJsonFragmentLine(withoutTrailingComma)) return "";
  return withoutTrailingComma;
}

function clampDisplayText(value: string, maxChars: number) {
  const text = normalizeDisplayLine(value);
  if (!text) return "";
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const boundary = Math.max(
    clipped.lastIndexOf(" "),
    clipped.lastIndexOf(","),
    clipped.lastIndexOf("·"),
    clipped.lastIndexOf(")")
  );
  const base = (boundary > maxChars * 0.58 ? clipped.slice(0, boundary) : clipped).trim();
  return `${base}…`;
}

function splitLongDisplayLine(value: string) {
  const clean = normalizeDisplayLine(value);
  if (!clean) return [];

  const trySplit = (input: string, pattern: RegExp) =>
    input
      .split(pattern)
      .map((part) => normalizeDisplayLine(part))
      .filter((part) => part.length > 0);

  const bySentence = trySplit(clean, /(?<=[.!?]|다\.|요\.)\s+|;\s+/);
  if (bySentence.length > 1) return bySentence.map((line) => clampDisplayText(line, DISPLAY_ITEM_MAX_CHARS));

  if (clean.length <= DISPLAY_ITEM_MAX_CHARS) return [clean];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > DISPLAY_ITEM_MAX_CHARS) {
    const clipped = rest.slice(0, DISPLAY_ITEM_MAX_CHARS);
    const boundary = Math.max(
      clipped.lastIndexOf(". "),
      clipped.lastIndexOf("; "),
      clipped.lastIndexOf(", "),
      clipped.lastIndexOf("· "),
      clipped.lastIndexOf(") "),
      clipped.lastIndexOf(" ")
    );
    const cutIndex = boundary > DISPLAY_ITEM_MAX_CHARS * 0.58 ? boundary + 1 : DISPLAY_ITEM_MAX_CHARS;
    const piece = rest.slice(0, cutIndex).trim();
    if (piece) chunks.push(clampDisplayText(piece, DISPLAY_ITEM_MAX_CHARS));
    rest = rest.slice(cutIndex).trim();
  }
  if (rest) chunks.push(clampDisplayText(rest, DISPLAY_ITEM_MAX_CHARS));
  return chunks.filter(Boolean);
}

function mergeUniqueLists(...lists: string[][]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const splitItems = splitLongDisplayLine(String(item ?? ""));
      for (const clean of splitItems) {
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
      }
    }
  }
  return out;
}

type DynamicResultCard = {
  key: string;
  title: string;
  items: string[];
  compact?: boolean;
};

const CARD_MAX_ITEMS = 4;
const NON_SCENARIO_CARD_MAX_ITEMS = 3;
const DISPLAY_ITEM_MAX_CHARS = 180;
const ITEM_PRIORITY_PATTERN =
  /(즉시|중단|보류|주의|금기|핵심|반드시|필수|우선|보고|호출|알람|모니터|재평가|용량|속도|농도|단위|라인|호환|상호작용|프로토콜|기관 확인 필요)/i;
const TOPIC_LABEL_PATTERN =
  /(정의|분류|역할|특성|기전|포인트|적응증|경로|방식|주의|금기|확인|모니터|신호|대응|호환|상호작용|교육|체크|준비물|셋업|절차|정상|알람|트러블|합병증|유지관리|보고|원인|처치|재평가)/i;

const CATEGORY_HEADING_PATTERN =
  /(핵심 요약|이 약이 무엇인지|언제 쓰는지|어떻게 주는지|기구 정의|준비물|셋업|사용 절차|정상 작동|알람|트러블슈팅|합병증|유지관리|실수 방지|금기|주의|모니터|위험 신호|즉시 대응|라인|호환|상호작용|환자 교육|체크리스트|보고|sbar|원인|재평가|처치|적응증|역할|정의|분류)/i;

function headingCandidate(line: string) {
  return String(line ?? "")
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/^(?:[-*•·]|\d+[).])\s*/, "")
    .replace(/^\[\s*|\s*\]$/g, "")
    .trim();
}

function looksLikeHeading(line: string) {
  const raw = String(line ?? "").trim();
  if (!raw) return false;
  const candidate = headingCandidate(raw).replace(/[:：]$/, "").trim();
  if (!candidate) return false;
  if (/^#{1,6}\s+/.test(raw)) return true;
  if (/^\*\*[^*]{2,80}\*\*$/.test(raw)) return true;
  if (/^\[[^\]]{2,70}\]$/.test(raw)) return true;
  if (/^[가-힣A-Za-z0-9 /()·&+-]{2,72}[:：]$/u.test(headingCandidate(raw))) return true;
  if (/^\d+[).]\s*[가-힣A-Za-z0-9 /()·&+-]{2,64}$/u.test(raw) && CATEGORY_HEADING_PATTERN.test(candidate)) return true;
  if (candidate.length <= 42 && CATEGORY_HEADING_PATTERN.test(candidate) && !/[.!?]$/.test(candidate)) {
    return true;
  }
  return false;
}

function isNearDuplicateText(a: string, b: string) {
  const left = normalizeDisplayLine(a)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const right = normalizeDisplayLine(b)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!left || !right) return false;
  if (left === right) return true;
  const minLen = Math.min(left.length, right.length);
  if (minLen < 16) return false;
  return left.includes(right) || right.includes(left);
}

function headingText(line: string) {
  return headingCandidate(line).replace(/[:：]$/, "").trim();
}

function linePriorityScore(line: string) {
  let score = 0;
  if (ITEM_PRIORITY_PATTERN.test(line)) score += 3;
  if (/\b\d+(?:\.\d+)?\s*(?:분|시간|mL\/hr|mg|mcg|mEq|IU|U|%)\b/i.test(line)) score += 2;
  if (line.includes(":") || line.includes("·")) score += 1;
  if (line.length > 35 && line.length < 140) score += 1;
  return score;
}

function pickCardItems(items: string[]) {
  const normalized = mergeUniqueLists(items);
  if (normalized.length <= CARD_MAX_ITEMS) return normalized;
  const first = normalized[0];
  const rest = normalized.slice(1);
  const picked = rest
    .map((item, idx) => ({ item, idx, score: linePriorityScore(item) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, CARD_MAX_ITEMS - 1)
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => entry.item);
  return mergeUniqueLists([first], picked).slice(0, CARD_MAX_ITEMS);
}

function topicPrefixRange(text: string) {
  const colonIdx = text.search(/[:：]/);
  if (colonIdx <= 0 || colonIdx > 26) return null;
  const label = text.slice(0, colonIdx).trim();
  if (!label || !TOPIC_LABEL_PATTERN.test(label)) return null;
  return { start: 0, end: colonIdx + 1 };
}

function renderHighlightedLine(line: string): ReactNode {
  const text = normalizeDisplayLine(line);
  if (!text) return "";
  const range = topicPrefixRange(text);
  if (!range) return text;
  return (
    <>
      <span className="rounded-[6px] bg-[color:var(--wnl-accent-soft)] px-[3px] py-[1px] font-semibold text-[color:var(--wnl-accent)]">
        {text.slice(range.start, range.end)}
      </span>
      {text.slice(range.end)}
    </>
  );
}

function buildNarrativeCards(answer: string, t?: TranslateFn): DynamicResultCard[] {
  const translate = t ?? ((key: string) => key);
  const lines = String(answer ?? "")
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const cards: DynamicResultCard[] = [];
  let currentTitle = translate("핵심 요약");
  let currentItems: string[] = [];

  const flush = () => {
    const items = currentItems
      .flatMap((line) => splitLongDisplayLine(line))
      .filter((line) => line.length > 0);
    if (!items.length) return;
    const title = normalizeDisplayLine(currentTitle) || translate("핵심 정보 {count}", { count: cards.length + 1 });
    const normalizedItems = mergeUniqueLists(items).filter((item, index) => !(index === 0 && isNearDuplicateText(item, title)));
    if (!normalizedItems.length) {
      currentItems = [];
      return;
    }
    cards.push({
      key: `narrative-${cards.length}`,
      title,
      items: normalizedItems,
      compact: cards.length === 0,
    });
    currentItems = [];
  };

  for (const rawLine of lines) {
    if (looksLikeHeading(rawLine)) {
      flush();
      currentTitle = headingText(rawLine) || translate("핵심 정보 {count}", { count: cards.length + 1 });
      continue;
    }
    currentItems.push(rawLine);
  }
  flush();

  if (cards.length) return cards;

  const paragraphs = String(answer ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return paragraphs.map((block, idx) => ({
    key: `paragraph-${idx}`,
    title: idx === 0 ? translate("핵심 요약") : translate("추가 정보 {count}", { count: idx }),
    items: mergeUniqueLists(
      block
        .split("\n")
        .flatMap((line) => splitLongDisplayLine(line))
        .filter((line) => line.length > 0)
    ),
    compact: idx === 0,
  }));
}

function MedSafetyAnalyzingOverlay({ open, t }: { open: boolean; t: TranslateFn }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-[rgba(242,242,247,0.86)] px-5 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-ios-sep bg-white px-6 py-6 shadow-[0_26px_70px_rgba(0,0,0,0.12)]">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#163B73] to-transparent wnl-recovery-progress" />
        <div className="text-[23px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 분석 중")}</div>
        <p className="mt-2 text-[14px] leading-6 text-ios-sub">{t("약물/의료도구 안전 포인트를 정리하고 있습니다. 잠시만 기다려 주세요.")}</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[color:var(--wnl-accent)] wnl-dot-pulse" />
          <span className="h-2 w-2 rounded-full bg-[color:var(--wnl-accent)] wnl-dot-pulse [animation-delay:160ms]" />
          <span className="h-2 w-2 rounded-full bg-[color:var(--wnl-accent)] wnl-dot-pulse [animation-delay:320ms]" />
        </div>
      </div>
    </div>,
    document.body
  );
}

function EnglishTranslationPendingPopup({ open, t }: { open: boolean; t: TranslateFn }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[2147483100] flex items-start justify-center bg-[rgba(242,242,247,0.56)] px-4 pt-[max(72px,env(safe-area-inset-top)+20px)] backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] rounded-[24px] border border-[#D7DEEB] bg-white/96 p-4 shadow-[0_20px_56px_rgba(15,36,74,0.16)]">
        <div className="flex items-start gap-3">
          <div className="mt-[1px] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#C7D5F0] bg-[#EDF3FF]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#163B73] border-r-transparent" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold tracking-[-0.01em] text-ios-text">{t("영어 번역 적용 중")}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ios-sub">{t("영어로 표시하는 중이에요. 조금만 기다려 주세요.")}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ToolMedSafetyPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { hasPaidAccess, loading: billingLoading } = useBillingAccess();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ClinicalMode>("ward");
  const [queryIntent, setQueryIntent] = useState<QueryIntent>("medication");
  const [situation, setSituation] = useState<ClinicalSituation>("general");
  const [patientSummary, setPatientSummary] = useState("");
  const [result, setResult] = useState<MedSafetyAnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analysisRequested, setAnalysisRequested] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scenarioState, setScenarioState] = useState<{
    previousResponseId?: string;
    conversationId?: string;
  }>({});
  const [preferredModel, setPreferredModel] = useState<string>(MED_SAFETY_DEFAULT_MODEL);
  const isScenarioIntent = queryIntent === "scenario";
  const activeSituation: ClinicalSituation = isScenarioIntent ? situation : "general";
  const situationInputGuide = SITUATION_INPUT_GUIDE[activeSituation];
  const nameOnlyGuide = queryIntent === "scenario" ? null : NAME_ONLY_INPUT_GUIDE[queryIntent];

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraStarting(false);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCamera();
    };
  }, [previewUrl, stopCamera]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = String(window.localStorage.getItem(MED_SAFETY_LAST_MODEL_KEY) ?? "").trim();
      if (stored && !/^gpt-4\.1-mini$/i.test(stored)) {
        setPreferredModel(stored);
        return;
      }
      setPreferredModel(MED_SAFETY_DEFAULT_MODEL);
      window.localStorage.setItem(MED_SAFETY_LAST_MODEL_KEY, MED_SAFETY_DEFAULT_MODEL);
    } catch {
      // ignore storage read error
    }
  }, []);

  useEffect(() => {
    if (isScenarioIntent) return;
    setSituation("general");
    setPatientSummary("");
  }, [isScenarioIntent]);

  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        // autoplay policy differences across browsers
      });
    }
  }, [cameraOpen]);

  const onImagePicked = useCallback(
    (file: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
      setCameraError(null);
    },
    [previewUrl]
  );

  const clearImage = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [previewUrl]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStarting(true);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraStarting(false);
      setCameraError(t("이 브라우저는 실시간 카메라를 지원하지 않습니다."));
      return;
    }

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setCameraOpen(true);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {
          // autoplay constraints may block on some browsers
        });
      }
    } catch (cause) {
      setCameraError(t(parseCameraStartError(cause)));
    } finally {
      setCameraStarting(false);
    }
  }, [stopCamera, t]);

  const captureFromCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      setCameraError(t("카메라 화면을 찾지 못했습니다."));
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setCameraError(t("카메라 영상이 아직 준비되지 않았습니다. 잠시 후 다시 촬영해 주세요."));
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError(t("이미지 캡처를 처리할 수 없습니다."));
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraError(t("캡처 이미지 생성에 실패했습니다."));
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    onImagePicked(file);
    stopCamera();
  }, [onImagePicked, stopCamera, t]);

  const runAnalyze = useCallback(
    async (forcedQuery?: string) => {
      const normalized = (forcedQuery ?? query).replace(/\s+/g, " ").trim();
      if (!normalized && !imageFile) {
        setError(t("텍스트를 입력하거나 사진을 업로드해 주세요."));
        return;
      }
      if (!isScenarioIntent && normalized && !isNameOnlyInput(normalized)) {
        setError(
          queryIntent === "medication"
            ? t("약물 모드에서는 약물명만 단답으로 입력해 주세요. 예: norepinephrine")
            : t("의료기구 모드에서는 기구명만 단답으로 입력해 주세요. 예: IV infusion pump")
        );
        return;
      }
      const cacheKey = buildAnalyzeCacheKey({
        query: normalized,
        patientSummary: isScenarioIntent ? patientSummary.trim() : "",
        mode,
        queryIntent,
        situation: activeSituation,
        imageFile,
      });

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = readMedSafetyCache(cacheKey);
        if (cached) {
          setResult(cached);
          setError(
            `${t("오프라인 상태입니다. 데이터(모바일 네트워크)를 켠 뒤 다시 AI 분석 실행을 눌러 시도해 주세요.")} ${t("최근 저장된 결과를 표시합니다.")}`
          );
        } else {
          setResult(null);
          setError(t("네트워크에 연결되어 있지 않습니다. 데이터(모바일 네트워크)를 켠 뒤 다시 AI 분석 실행을 눌러 시도해 주세요."));
        }
        return;
      }

      setAnalysisRequested(true);
      setIsLoading(true);
      setError(null);

      try {
        const maxClientRetries = 0;
        let response: Response | null = null;
        let payload:
          | { ok: true; data: MedSafetyAnalyzeResult }
          | { ok: false; error?: string }
          | null = null;
        let finalError = "med_safety_analyze_failed";

        for (let attempt = 0; attempt <= maxClientRetries; attempt += 1) {
          try {
            const form = new FormData();
            if (normalized) form.set("query", normalized);
            if (isScenarioIntent && patientSummary.trim()) form.set("patientSummary", patientSummary.trim());
            form.set("mode", mode);
            form.set("queryIntent", queryIntent);
            form.set("situation", activeSituation);
            form.set("locale", lang);
            if (isScenarioIntent && scenarioState.previousResponseId) {
              form.set("previousResponseId", scenarioState.previousResponseId);
            }
            if (isScenarioIntent && scenarioState.conversationId) {
              form.set("conversationId", scenarioState.conversationId);
            }
            form.set("preferredModel", String(preferredModel || MED_SAFETY_DEFAULT_MODEL).trim() || MED_SAFETY_DEFAULT_MODEL);
            if (imageFile) form.set("image", imageFile);

            response = await fetchAnalyzeWithTimeout(form, 35_000);

            payload = (await response.json().catch(() => null)) as
              | { ok: true; data: MedSafetyAnalyzeResult }
              | { ok: false; error?: string }
              | null;

            if (response.ok && payload?.ok) break;
            finalError = String((payload as any)?.error ?? "med_safety_analyze_failed");
            if (!shouldRetryAnalyzeError(response.status, finalError) || attempt >= maxClientRetries) break;
          } catch (cause: any) {
            finalError = String(cause?.message ?? "network_error");
            if (attempt >= maxClientRetries) break;
          }

          await waitMs(Math.min(2200, 500 * (attempt + 1)) + Math.floor(Math.random() * 180));
        }

        if (!response?.ok || !payload?.ok) {
          const cached = readMedSafetyCache(cacheKey);
          if (cached) {
            setResult(cached);
            if (isScenarioIntent) {
              setScenarioState({ previousResponseId: undefined, conversationId: undefined });
            }
            setError(`${t(parseErrorMessage(finalError))} ${t("최근 저장된 결과를 표시합니다.")}`);
            return;
          }
          setResult(null);
          if (isScenarioIntent) {
            setScenarioState({ previousResponseId: undefined, conversationId: undefined });
          }
          setError(t(parseErrorMessage(finalError)));
          return;
        }
        const data = payload.data;

        if (data.source === "openai_live") {
          writeMedSafetyCache(cacheKey, data);
          setResult(data);
          setError(null);
          if (data.model) {
            setPreferredModel(data.model);
            try {
              window.localStorage.setItem(MED_SAFETY_LAST_MODEL_KEY, data.model);
            } catch {
              // ignore storage write error
            }
          }
          if (isScenarioIntent) {
            setScenarioState({
              previousResponseId: data.openaiResponseId || undefined,
              conversationId: data.openaiConversationId || undefined,
            });
          }
        } else {
          setResult(data);
          if (isScenarioIntent) {
            setScenarioState({ previousResponseId: undefined, conversationId: undefined });
          }
          setError(
            `${t(parseErrorMessage(String(data.fallbackReason ?? "openai_fallback")))} ${t("기본 안전 모드 결과를 표시합니다.")}`
          );
        }
        if (forcedQuery) setQuery(forcedQuery);
      } catch {
        const cached = readMedSafetyCache(cacheKey);
        if (cached) {
          setResult(cached);
          if (isScenarioIntent) {
            setScenarioState({ previousResponseId: undefined, conversationId: undefined });
          }
          setError(`${t(RETRY_WITH_DATA_MESSAGE)} ${t("최근 저장된 결과를 표시합니다.")}`);
        } else {
          setResult(null);
          if (isScenarioIntent) {
            setScenarioState({ previousResponseId: undefined, conversationId: undefined });
          }
          setError(t(RETRY_WITH_DATA_MESSAGE));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      activeSituation,
      imageFile,
      isScenarioIntent,
      lang,
      mode,
      patientSummary,
      preferredModel,
      query,
      queryIntent,
      scenarioState,
      t,
    ]
  );

  const resultViewState = useMemo(() => {
    if (!result) {
      return {
        resultKindChip: "",
        headerConclusion: "",
        headerPrimaryUse: "",
        showHeaderPrimaryUse: false,
        displayCards: [] as DynamicResultCard[],
      };
    }

    const immediateActions = mergeUniqueLists(result.quick.topActions).slice(0, 7);
    const checks1to5 = mergeUniqueLists(result.quick.topNumbers).slice(0, 6);
    const branchRules = mergeUniqueLists(result.quick.topRisks, result.safety.holdRules, result.safety.escalateWhen).slice(0, 8);
    const adjustmentPlan = mergeUniqueLists(result.do.steps).slice(0, 8);
    const preventionPoints = mergeUniqueLists(result.do.compatibilityChecks, result.institutionalChecks).slice(0, 6);
    const reassessmentPoints = mergeUniqueLists(result.safety.monitor).slice(0, 6);
    const headerConclusion = clampDisplayText(result.oneLineConclusion, result.resultKind === "scenario" ? 160 : 220);
    const headerPrimaryUse = clampDisplayText(result.item.primaryUse, result.resultKind === "scenario" ? 170 : 220);

    const dynamicCardsFromNarrative = result.searchAnswer ? buildNarrativeCards(result.searchAnswer, t) : [];
    const dynamicCardsFallback: DynamicResultCard[] = [
      {
        key: "fallback-core",
        title: t("핵심 요약"),
        items: pickCardItems(
          mergeUniqueLists(
            headerConclusion ? [headerConclusion] : [],
            headerPrimaryUse ? [headerPrimaryUse] : [],
            immediateActions.length ? [t("가장 먼저: {item}", { item: immediateActions[0] })] : []
          )
        ),
        compact: true,
      },
      { key: "fallback-action", title: t("주요 행동"), items: pickCardItems(immediateActions) },
      { key: "fallback-check", title: t("핵심 확인"), items: pickCardItems(checks1to5) },
      { key: "fallback-step", title: t("실행 포인트"), items: pickCardItems(adjustmentPlan) },
      { key: "fallback-risk", title: t("위험/에스컬레이션"), items: pickCardItems(branchRules) },
      { key: "fallback-prevent", title: t("실수 방지"), items: pickCardItems(preventionPoints) },
      { key: "fallback-monitor", title: t("모니터/재평가"), items: pickCardItems(reassessmentPoints) },
    ].filter((card) => card.items.length > 0);

    const dynamicCards = dynamicCardsFromNarrative.length ? dynamicCardsFromNarrative : dynamicCardsFallback;
    const displayCards =
      result.resultKind === "scenario"
        ? dynamicCards
        : dynamicCards.map((card) => ({
            ...card,
            items: card.items.slice(0, NON_SCENARIO_CARD_MAX_ITEMS),
          }));

    return {
      resultKindChip: kindLabel(result.resultKind),
      headerConclusion,
      headerPrimaryUse,
      showHeaderPrimaryUse:
        result.resultKind !== "scenario" && !!headerPrimaryUse && !isNearDuplicateText(headerPrimaryUse, headerConclusion),
      displayCards,
    };
  }, [result, t]);

  const resultPanel = useMemo(() => {
    if (!result) {
      return (
        <div className="py-1">
          <div className="text-[24px] font-bold text-ios-text">{t("결과 대기")}</div>
          <div className="mt-2 text-[17px] leading-7 text-ios-sub">{t("입력 후 `AI 분석 실행`을 누르면, 먼저 읽어야 할 핵심 행동부터 표시됩니다.")}</div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] px-3 py-1 text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              {t(resultViewState.resultKindChip)}
            </span>
          </div>
          <div className="mt-2 text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-ios-text">{result.item.name}</div>
          <div className="mt-1.5 text-[18px] leading-7 text-ios-text">
            {resultViewState.headerConclusion || resultViewState.headerPrimaryUse || t("핵심 안전 확인 필요")}
          </div>
          {resultViewState.showHeaderPrimaryUse ? (
            <div className="mt-1 text-[16px] leading-6 text-ios-sub">{resultViewState.headerPrimaryUse}</div>
          ) : null}
          <div className="mt-2 text-[15px] text-ios-sub">
            {t("모드")}: {t(modeLabel(mode))} · {t("유형")}: {t(queryIntentLabel(queryIntent))} · {t("상황")}: {t(situationLabel(activeSituation))} ·{" "}
            {t("분석")}:{" "}
            {formatDateTime(result.analyzedAt)}
          </div>
          {result.suggestedNames && result.suggestedNames.length ? (
            <div className="mt-3 rounded-2xl border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] px-3 py-3">
              <div className="text-[15px] font-bold text-[color:var(--wnl-accent)]">{t("이걸 찾으신건가요?")}</div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[14px] leading-6 text-ios-text">
                {result.suggestedNames.slice(0, 3).map((name, idx) => (
                  <li key={`suggested-${idx}`}>{name}</li>
                ))}
              </ul>
              <div className="mt-1 text-[12px] text-ios-sub">{t("아래 후보 중 정확한 이름을 복사해 다시 입력해 주세요.")}</div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-ios-sep pt-2.5">
          {resultViewState.displayCards.length ? (
            <div className="space-y-2.5">
              {resultViewState.displayCards.map((card) => (
                <section
                  key={card.key}
                  className={`${card.compact ? "border-l-[3px] border-[color:var(--wnl-accent)] pl-3 py-1.5" : "border-b border-ios-sep pb-2.5"} last:border-b-0`}
                >
                  <div className="text-[15px] font-bold tracking-[-0.01em] text-[color:var(--wnl-accent)]">{card.title}</div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[15px] leading-6 text-ios-text">
                    {card.items.map((item, index) => (
                      <li key={`${card.key}-${index}`}>{renderHighlightedLine(item)}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <div className="text-[15px] text-ios-sub">{t("표시할 분석 정보가 없습니다.")}</div>
          )}
        </div>
      </div>
    );
  }, [activeSituation, mode, queryIntent, result, resultViewState, t]);

  const englishTranslationPending = lang === "en" && isLoading && analysisRequested;
  const showAnalyzingOverlay = isLoading && !englishTranslationPending;

  if (billingLoading) {
    return (
      <div className="mx-auto w-full max-w-[920px] space-y-3 px-2 pb-24 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[31px] font-extrabold tracking-[-0.02em] text-[color:var(--wnl-accent)]">{t("AI 약물·도구 검색기")}</div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("간호 현장에서 바로 쓰는 약물·의료기구·상황 대응 정보를 검색형으로 제공합니다.")}</div>
          </div>
          <Link href="/tools" className="pt-1 text-[12px] font-semibold text-[color:var(--wnl-accent)]">
            {t("툴 목록")}
          </Link>
        </div>
        <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
          <div className="text-[18px] font-bold text-ios-text">{t("구독 상태 확인 중...")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("AI 약물·기구 안전 가이드 사용 가능 여부를 확인하고 있어요.")}</div>
        </Card>
      </div>
    );
  }

  if (!hasPaidAccess) {
    return (
      <div className="mx-auto w-full max-w-[920px] space-y-3 px-2 pb-24 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[31px] font-extrabold tracking-[-0.02em] text-[color:var(--wnl-accent)]">{t("AI 약물·도구 검색기")}</div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("간호 현장에서 바로 쓰는 약물·의료기구·상황 대응 정보를 검색형으로 제공합니다.")}</div>
          </div>
          <Link href="/tools" className="pt-1 text-[12px] font-semibold text-[color:var(--wnl-accent)]">
            {t("툴 목록")}
          </Link>
        </div>
        <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
          <div className="text-[19px] font-bold text-ios-text">{t("유료 플랜 전용 기능")}</div>
          <div className="mt-2 text-[14px] leading-6 text-ios-sub">{t("AI 약물·기구 안전 가이드는 Pro 플랜에서 사용할 수 있어요.")}</div>
          <Button
            variant="secondary"
            className={`${PRIMARY_FLAT_BTN} mt-4`}
            onClick={() => {
              router.push("/settings/billing/upgrade");
            }}
          >
            {t("플랜 업그레이드")}
          </Button>
          <div className="mt-2 text-[12px] text-ios-sub">{t("업그레이드 후 AI 맞춤회복과 AI 약물기구안전가이드를 모두 사용할 수 있어요.")}</div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[920px] space-y-3 px-2 pb-24 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[31px] font-extrabold tracking-[-0.02em] text-[color:var(--wnl-accent)]">{t("AI 약물·도구 검색기")}</div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("간호 현장에서 바로 쓰는 약물·의료기구·상황 대응 정보를 검색형으로 제공합니다.")}</div>
          </div>
          <Link href="/tools" className="pt-1 text-[12px] font-semibold text-[color:var(--wnl-accent)]">
            {t("툴 목록")}
          </Link>
        </div>

        <Card className={`p-3 ${FLAT_CARD_CLASS}`}>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-[13px] font-semibold text-ios-text">{t("근무 모드")}</div>
              <div className={SEGMENT_WRAPPER_CLASS}>
                {MODE_OPTIONS.map((option) => {
                  const active = mode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`h-9 rounded-xl px-4 text-[12.5px] font-semibold ${
                        active
                          ? "border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                          : "text-ios-sub"
                      }`}
                      onClick={() => setMode(option.value)}
                    >
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[13px] font-semibold text-ios-text">{t("질문 유형")}</div>
              <div className={SEGMENT_WRAPPER_CLASS}>
                {QUERY_INTENT_OPTIONS.map((option) => {
                  const active = queryIntent === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`h-9 rounded-xl px-4 text-[12.5px] font-semibold ${
                        active
                          ? "border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                          : "text-ios-sub"
                      }`}
                      onClick={() => {
                        setQueryIntent(option.value);
                        setError(null);
                        if (option.value !== "scenario") {
                          setSituation("general");
                          setPatientSummary("");
                        }
                      }}
                    >
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] leading-5 text-ios-sub">
                {t(QUERY_INTENT_OPTIONS.find((option) => option.value === queryIntent)?.hint ?? "")}
              </div>
            </div>

            {isScenarioIntent ? (
              <>
                <div className="space-y-2">
                  <div className="text-[13px] font-semibold text-ios-text">{t("현재 상황")}</div>
                  <div className="flex flex-wrap gap-2">
                    {SITUATION_OPTIONS.map((option) => {
                      const active = situation === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`h-9 rounded-xl border px-3 text-[12px] font-semibold ${
                            active
                              ? "border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                              : "border-ios-sep bg-white text-ios-sub"
                          }`}
                          onClick={() => setSituation(option.value)}
                        >
                          {t(option.label)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-2 text-[12px] leading-5 text-ios-sub">
                    {t(situationInputGuide.cue)}
                  </div>
                </div>

                <Textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-h-[120px] bg-white text-[16px] leading-7 text-ios-text"
                  placeholder={t(situationInputGuide.queryPlaceholder)}
                />

                <Textarea
                  value={patientSummary}
                  onChange={(event) => setPatientSummary(event.target.value)}
                  className="min-h-[84px] bg-white text-[15px] leading-6 text-ios-text"
                  placeholder={t(situationInputGuide.summaryPlaceholder)}
                />
              </>
            ) : (
              <div className="space-y-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 text-[16px]"
                  placeholder={nameOnlyGuide?.placeholder ? t(nameOnlyGuide.placeholder) : ""}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <div className="text-[12px] leading-5 text-ios-sub">{nameOnlyGuide?.helper ? t(nameOnlyGuide.helper) : null}</div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  onImagePicked(file);
                }}
              />
              <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={() => fileInputRef.current?.click()}>
                {t("사진 업로드")}
              </Button>
              <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={() => void startCamera()} disabled={cameraStarting}>
                {cameraStarting ? t("카메라 연결 중...") : t("실시간 카메라")}
              </Button>
              {imageFile ? (
                <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={clearImage}>
                  {t("이미지 제거")}
                </Button>
              ) : null}
              <Button variant="secondary" className={PRIMARY_FLAT_BTN} onClick={() => void runAnalyze()} disabled={isLoading}>
                {isLoading ? t("AI 분석 중...") : t("AI 분석 실행")}
              </Button>
            </div>

            {cameraOpen ? (
              <div className="space-y-2 rounded-2xl border border-ios-sep p-2">
                <div className="overflow-hidden rounded-xl border border-ios-sep bg-black">
                  <video ref={videoRef} className="h-auto w-full object-cover" autoPlay playsInline muted />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className={PRIMARY_FLAT_BTN} onClick={() => void captureFromCamera()}>
                    {t("현재 화면 촬영")}
                  </Button>
                  <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={stopCamera}>
                    {t("카메라 닫기")}
                  </Button>
                </div>
              </div>
            ) : null}

            {previewUrl ? (
              <div className="overflow-hidden rounded-2xl border border-ios-sep p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt={t("업로드 이미지 미리보기")} className="max-h-[220px] w-full rounded-xl object-contain" />
                {imageFile ? <div className="mt-2 text-[12px] text-ios-sub">{imageFile.name}</div> : null}
              </div>
            ) : null}

            {cameraError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[14px] font-semibold text-amber-700">{cameraError}</div>
            ) : null}
            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[15px] font-semibold text-red-700">{error}</div> : null}
          </div>
        </Card>

        <Card className={`p-3 ${FLAT_CARD_CLASS}`}>
          {resultPanel}

          <div className="mt-4 border-t border-ios-sep pt-3 text-[14px] leading-6 text-ios-sub">
            {t(
              "본 결과는 참고용 자동 생성 정보이며 의료행위 판단의 근거로 사용할 수 없습니다. 제공자는 본 결과의 사용으로 발생한 진단·치료·투약 결정 및 결과에 대해 책임을 지지 않습니다. 모든 처치는 병원 지침, 처방, 의료진 확인을 우선해 결정해 주세요."
            )}
          </div>
        </Card>
      </div>
      <MedSafetyAnalyzingOverlay open={showAnalyzingOverlay} t={t} />
      <EnglishTranslationPendingPopup open={englishTranslationPending} t={t} />
    </>
  );
}

export default ToolMedSafetyPage;
