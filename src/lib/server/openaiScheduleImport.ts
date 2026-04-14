import type { ISODate } from "@/lib/date";
import { buildAliasMap, normalizeShiftText } from "@/lib/shiftAliasMap";
import {
  MAX_SCHEDULE_IMPORT_IMAGE_BYTES,
  estimateDataUrlBytes,
  normalizeYearMonth,
  type ScheduleAIEntry,
  type ScheduleAIImportMode,
  type ScheduleAIImportResponse,
} from "@/lib/scheduleAiImport";
import { sanitizeCustomShiftTypes, sanitizeOcrLastUserName } from "@/lib/customShiftTypes";
import { normalizeOpenAIResponsesBaseUrl, resolveOpenAIResponsesRequestConfig } from "@/lib/server/openaiGateway";

type ImportScheduleArgs = {
  mode: ScheduleAIImportMode;
  imageDataUrl: string;
  selectedPerson?: string;
  yearMonthHint?: string;
  locale?: "ko" | "en";
  customShiftTypes?: unknown;
  signal: AbortSignal;
};

type AIParsedScheduleItem = {
  day: number;
  rawLabel: string;
};

type AIScheduleImageResponse = {
  tableType: "single_person" | "multi_person" | "selected_person" | "unreadable";
  yearMonth: string | null;
  people: string[];
  person: string | null;
  schedule: AIParsedScheduleItem[];
  warnings: string[];
};

const DEFAULT_SCHEDULE_GATEWAY_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/ef26198060fbc15df2aa56b10360ee41/rnest-openai/compat";
const DEFAULT_SCHEDULE_MODEL = "gpt-5.4-mini";
const DEFAULT_UPSTREAM_TIMEOUT_MS = 90_000;
const MIN_UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_UPSTREAM_TIMEOUT_MS = 180_000;

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    tableType: {
      type: "string",
      enum: ["single_person", "multi_person", "selected_person", "unreadable"],
    },
    yearMonth: {
      anyOf: [
        { type: "string", pattern: "^\\d{4}-\\d{2}$" },
        { type: "null" },
      ],
    },
    people: {
      type: "array",
      maxItems: 40,
      items: {
        type: "string",
        maxLength: 24,
      },
    },
    person: {
      anyOf: [
        { type: "string", maxLength: 24 },
        { type: "null" },
      ],
    },
    schedule: {
      type: "array",
      maxItems: 31,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "integer", minimum: 1, maximum: 31 },
          rawLabel: { type: "string", maxLength: 32 },
        },
        required: ["day", "rawLabel"],
      },
    },
    warnings: {
      type: "array",
      maxItems: 12,
      items: {
        type: "string",
        maxLength: 140,
      },
    },
  },
  required: ["tableType", "yearMonth", "people", "person", "schedule", "warnings"],
};

function trimEnv(value: unknown) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveApiKey() {
  return (
    trimEnv(process.env.OPENAI_API_KEY) ||
    trimEnv(process.env.OPENAI_KEY) ||
    trimEnv(process.env.OPENAI_API_TOKEN) ||
    trimEnv(process.env.OPENAI_SECRET_KEY)
  );
}

function resolveScheduleGatewayBaseUrl() {
  const raw =
    trimEnv(process.env.OPENAI_SCHEDULE_BASE_URL) ||
    trimEnv(process.env.OPENAI_SCHEDULE_API_BASE_URL) ||
    trimEnv(process.env.OPENAI_SCHEDULE_GATEWAY_BASE_URL) ||
    DEFAULT_SCHEDULE_GATEWAY_BASE_URL;
  return normalizeOpenAIResponsesBaseUrl(raw);
}

function resolveScheduleModel() {
  return trimEnv(process.env.OPENAI_SCHEDULE_MODEL) || DEFAULT_SCHEDULE_MODEL;
}

function resolveUpstreamTimeoutMs() {
  const raw = Number(process.env.OPENAI_SCHEDULE_UPSTREAM_TIMEOUT_MS ?? DEFAULT_UPSTREAM_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_UPSTREAM_TIMEOUT_MS;
  return Math.max(MIN_UPSTREAM_TIMEOUT_MS, Math.min(MAX_UPSTREAM_TIMEOUT_MS, Math.round(raw)));
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function appendText(parts: string[], seen: Set<string>, value: unknown) {
  if (typeof value === "string") {
    const text = value.replace(/\r/g, "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) appendText(parts, seen, item);
    return;
  }

  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  appendText(parts, seen, node.output_text);
  appendText(parts, seen, node.text);
  appendText(parts, seen, node.value);
  appendText(parts, seen, node.transcript);
  appendText(parts, seen, node.content);
}

function extractOutputText(payload: any) {
  const chunks: string[] = [];
  const seen = new Set<string>();

  appendText(chunks, seen, payload?.output_text);
  appendText(chunks, seen, payload?.choices?.[0]?.message?.content);
  appendText(chunks, seen, payload?.output);

  return chunks.join("\n").trim();
}

function normalizeList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function parseAIResponse(rawText: string): AIScheduleImageResponse | null {
  const parsed = safeJsonParse(rawText);
  if (!isRecord(parsed)) return null;

  const tableType = readString(parsed.tableType);
  if (
    tableType !== "single_person" &&
    tableType !== "multi_person" &&
    tableType !== "selected_person" &&
    tableType !== "unreadable"
  ) {
    return null;
  }

  const items: AIParsedScheduleItem[] = [];
  if (Array.isArray(parsed.schedule)) {
    for (const item of parsed.schedule) {
      if (!isRecord(item)) continue;
      const day = Number(item.day);
      const rawLabel = typeof item.rawLabel === "string" ? item.rawLabel.replace(/\s+/g, " ").trim().slice(0, 32) : "";
      if (!Number.isInteger(day) || day < 1 || day > 31 || !rawLabel) continue;
      items.push({ day, rawLabel });
    }
  }

  return {
    tableType,
    yearMonth: normalizeYearMonth(parsed.yearMonth),
    people: normalizeList(parsed.people, 40, 24),
    person: sanitizeOcrLastUserName(parsed.person, 24) || null,
    schedule: items,
    warnings: normalizeList(parsed.warnings, 12, 140),
  };
}

function buildIsoDate(yearMonth: string, day: number): ISODate | null {
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${yearRaw}-${monthRaw}-${String(day).padStart(2, "0")}` as ISODate;
}

function formatCustomShiftPrompt(customShiftTypes: ReturnType<typeof sanitizeCustomShiftTypes>) {
  if (!customShiftTypes.length) return "등록된 커스텀 근무 이름 없음";
  return customShiftTypes
    .slice(0, 30)
    .map((item) => {
      const aliases = item.aliases.length ? ` / aliases: ${item.aliases.join(", ")}` : "";
      return `- ${item.displayName} => ${item.semanticType}${aliases}`;
    })
    .join("\n");
}

function buildDeveloperPrompt(args: {
  mode: ScheduleAIImportMode;
  selectedPerson: string;
  yearMonthHint: string | null;
  locale: "ko" | "en";
  customShiftPrompt: string;
}) {
  const selectedPersonInstruction =
    args.mode === "resolve_person"
      ? `선택 대상 이름: ${args.selectedPerson || "없음"}`
      : "아직 사용자를 고르지 않았습니다. 여러 명 표면 이름 목록만 우선 추출하세요.";

  return [
    "당신은 간호사 근무표 이미지에서 한 사람의 월간 근무를 구조화하는 추출기입니다.",
    "반드시 이미지에 보이는 표만 근거로 판단하고 추측을 최소화하세요.",
    "규칙:",
    "- JSON 스키마에 맞는 값만 반환하세요.",
    "- rawLabel은 셀에 보이는 근무 표기를 가능한 한 그대로 짧게 반환하세요.",
    "- 공란이 명확히 오프를 의미하면 rawLabel에 OFF 또는 오프처럼 짧게 넣어도 됩니다.",
    "- 날짜를 읽을 수 없거나 셀 내용이 불확실하면 그 날짜는 schedule에서 제외하세요.",
    "- 여러 사람 근무표인데 아직 선택된 이름이 없으면 tableType=multi_person 으로 두고 people 목록만 우선 채우세요.",
    "- 선택된 이름이 있는 경우 그 사람 일정만 schedule에 포함하세요.",
    "- yearMonth는 이미지에서 보이면 넣고, 안 보이면 힌트를 참고해도 됩니다.",
    `출력 언어 기준: ${args.locale === "en" ? "영문 설명 가능" : "한국어 우선"}`,
    `연월 힌트: ${args.yearMonthHint ?? "없음"}`,
    selectedPersonInstruction,
    "등록된 병원별 근무 이름 힌트:",
    args.customShiftPrompt,
  ].join("\n");
}

function buildUserPrompt(args: {
  mode: ScheduleAIImportMode;
  selectedPerson: string;
  yearMonthHint: string | null;
}) {
  if (args.mode === "resolve_person") {
    return [
      "첨부된 근무표 이미지에서 선택한 사람의 일정만 추출하세요.",
      `이름: ${args.selectedPerson || "없음"}`,
      `연월 힌트: ${args.yearMonthHint ?? "없음"}`,
    ].join("\n");
  }

  return [
    "첨부된 근무표 이미지가 한 사람용인지 여러 사람용인지 먼저 판단하세요.",
    "한 사람용이면 바로 월간 일정까지 추출하세요.",
    "여러 사람용이면 이름 후보 목록을 우선 반환하세요.",
    `연월 힌트: ${args.yearMonthHint ?? "없음"}`,
  ].join("\n");
}

async function requestStructuredScheduleImageAnalysis(args: {
  imageDataUrl: string;
  mode: ScheduleAIImportMode;
  selectedPerson: string;
  yearMonthHint: string | null;
  locale: "ko" | "en";
  customShiftPrompt: string;
  signal: AbortSignal;
}) {
  const requestConfig = resolveOpenAIResponsesRequestConfig({
    apiBaseUrl: resolveScheduleGatewayBaseUrl(),
    apiKey: resolveApiKey(),
    model: resolveScheduleModel(),
    scope: "schedule_import",
  });

  if (requestConfig.missingCredential) {
    throw new Error(requestConfig.missingCredential);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("schedule_import_upstream_timeout"), resolveUpstreamTimeoutMs());
  const onAbort = () => controller.abort("schedule_import_caller_aborted");
  args.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(requestConfig.requestUrl, {
      method: "POST",
      headers: requestConfig.headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: requestConfig.model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: buildDeveloperPrompt({
                  mode: args.mode,
                  selectedPerson: args.selectedPerson,
                  yearMonthHint: args.yearMonthHint,
                  locale: args.locale,
                  customShiftPrompt: args.customShiftPrompt,
                }),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildUserPrompt({
                  mode: args.mode,
                  selectedPerson: args.selectedPerson,
                  yearMonthHint: args.yearMonthHint,
                }),
              },
              {
                type: "input_image",
                image_url: args.imageDataUrl,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "schedule_image_import",
            schema: RESPONSE_SCHEMA,
            strict: true,
          },
        },
        reasoning: {
          effort: "low",
        },
        max_output_tokens: 2200,
        store: false,
        tools: [],
      }),
    });

    const raw = await response.text();
    const payload = safeJsonParse(raw);
    if (!payload) {
      throw new Error(response.ok ? "schedule_ai_parse_failed" : `openai_responses_${response.status}_invalid_json`);
    }

    if (!response.ok) {
      throw new Error(`openai_responses_${response.status}_${truncateError(raw || "schedule_ai_failed")}`);
    }

    const text = extractOutputText(payload);
    if (!text) throw new Error("schedule_ai_parse_failed");
    const parsed = parseAIResponse(text);
    if (!parsed) throw new Error("invalid_schedule_ai_response");

    return {
      parsed,
      model: requestConfig.model,
    };
  } catch (error) {
    const name = String((error as Error)?.name ?? "");
    const message = String((error as Error)?.message ?? error ?? "");
    if (name === "AbortError" || message.includes("schedule_import_upstream_timeout")) {
      throw new Error("schedule_ai_timeout");
    }
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
    args.signal.removeEventListener("abort", onAbort);
  }
}

function normalizeScheduleEntries(args: {
  yearMonth: string;
  rawSchedule: AIParsedScheduleItem[];
  customShiftTypes: ReturnType<typeof sanitizeCustomShiftTypes>;
}) {
  const aliasMap = buildAliasMap(args.customShiftTypes);
  const schedule: Record<ISODate, ScheduleAIEntry> = {};
  const unresolved: ScheduleAIImportResponse["unresolved"] = [];

  for (const item of args.rawSchedule) {
    const isoDate = buildIsoDate(args.yearMonth, item.day);
    if (!isoDate) continue;
    const normalized = normalizeShiftText(item.rawLabel, aliasMap, args.customShiftTypes);
    if (!normalized) {
      unresolved.push({
        isoDate,
        rawText: item.rawLabel,
      });
      continue;
    }
    schedule[isoDate] = {
      isoDate,
      semanticType: normalized.semanticType,
      displayName: normalized.displayName,
      rawText: item.rawLabel,
    };
  }

  return { schedule, unresolved };
}

export async function importScheduleFromImageWithAI(args: ImportScheduleArgs): Promise<ScheduleAIImportResponse> {
  const imageDataUrl = String(args.imageDataUrl ?? "").trim();
  const imageBytes = estimateDataUrlBytes(imageDataUrl);
  if (!imageDataUrl.startsWith("data:image/") || imageBytes == null) {
    throw new Error("invalid_image_data_url");
  }
  if (imageBytes > MAX_SCHEDULE_IMPORT_IMAGE_BYTES) {
    throw new Error("image_too_large_max_6mb");
  }

  const customShiftTypes = sanitizeCustomShiftTypes(args.customShiftTypes);
  const selectedPerson = sanitizeOcrLastUserName(args.selectedPerson, 24);
  const yearMonthHint = normalizeYearMonth(args.yearMonthHint);
  const locale = args.locale === "en" ? "en" : "ko";

  const { parsed, model } = await requestStructuredScheduleImageAnalysis({
    imageDataUrl,
    mode: args.mode,
    selectedPerson,
    yearMonthHint,
    locale,
    customShiftPrompt: formatCustomShiftPrompt(customShiftTypes),
    signal: args.signal,
  });

  const normalizedYearMonth = parsed.yearMonth ?? yearMonthHint;
  const warnings = [...parsed.warnings];

  if (parsed.tableType === "multi_person" && args.mode === "detect") {
    return {
      status: "person_required",
      yearMonth: normalizedYearMonth,
      people: parsed.people,
      selectedPerson: null,
      schedule: {},
      unresolved: [],
      warnings,
      model,
    };
  }

  if (!normalizedYearMonth) {
    throw new Error("invalid_schedule_ai_response");
  }

  const { schedule, unresolved } = normalizeScheduleEntries({
    yearMonth: normalizedYearMonth,
    rawSchedule: parsed.schedule,
    customShiftTypes,
  });

  if (args.mode === "resolve_person" && !Object.keys(schedule).length && !unresolved.length) {
    throw new Error("person_not_found");
  }

  if (!Object.keys(schedule).length && !unresolved.length) {
    throw new Error("schedule_ai_parse_failed");
  }

  if (unresolved.length > 0) {
    warnings.push("일부 근무 표기는 자동 분류하지 못해 수동 확인이 필요합니다.");
  }

  return {
    status: "review_ready",
    yearMonth: normalizedYearMonth,
    people: parsed.people,
    selectedPerson: parsed.person ?? (selectedPerson || null),
    schedule,
    unresolved,
    warnings: normalizeList(warnings, 12, 140),
    model,
  };
}
