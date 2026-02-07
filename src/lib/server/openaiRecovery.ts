import type { AIRecoveryResult, CompoundAlert, RecoverySection, WeeklySummary } from "@/lib/aiRecovery";
import type { Language } from "@/lib/i18n";
import type { Shift } from "@/lib/types";
import type { DailyVital } from "@/lib/vitals";

type GenerateOpenAIRecoveryParams = {
  language: Language;
  todayISO: string;
  todayShift: Shift;
  nextShift: Shift | null;
  todayVital: DailyVital | null;
  vitals7: DailyVital[];
  prevWeekVitals: DailyVital[];
};

export type OpenAIRecoveryOutput = {
  result: AIRecoveryResult;
  generatedText: string;
  engine: "openai";
  model: string | null;
  debug: string | null;
};

type TextAttempt = {
  text: string | null;
  error: string | null;
};

type CategoryMeta = {
  category: RecoverySection["category"];
  titleKo: string;
  titleEn: string;
  hints: string[];
};

const DEFAULT_MAX_OUTPUT_TOKENS = 5200;

const CATEGORY_ORDER: CategoryMeta[] = [
  { category: "sleep", titleKo: "수면", titleEn: "Sleep", hints: ["수면", "sleep", "sleep debt"] },
  { category: "shift", titleKo: "교대근무", titleEn: "Shift", hints: ["교대", "나이트", "근무", "shift", "night"] },
  { category: "caffeine", titleKo: "카페인", titleEn: "Caffeine", hints: ["카페인", "coffee", "caffeine"] },
  { category: "menstrual", titleKo: "생리주기", titleEn: "Menstrual", hints: ["생리", "주기", "period", "pms"] },
  {
    category: "stress",
    titleKo: "스트레스 & 감정",
    titleEn: "Stress & Mood",
    hints: ["스트레스", "감정", "기분", "stress", "mood", "emotion"],
  },
  { category: "activity", titleKo: "신체활동", titleEn: "Activity", hints: ["활동", "운동", "activity", "exercise"] },
];

function clamp(value: number, min: number, max: number) {
  const n = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.round(clamp(raw, 1200, 10000));
}

function normalizeApiKey() {
  const key =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.OPENAI_API_TOKEN ??
    process.env.OPENAI_SECRET_KEY ??
    process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
    "";
  return String(key).trim();
}

function modelCandidates(primary: string | null | undefined) {
  const out: string[] = [];
  const push = (value?: string | null) => {
    const model = String(value ?? "").trim();
    if (!model) return;
    if (!out.includes(model)) out.push(model);
  };
  push(primary);
  push("gpt-5-mini");
  push("gpt-4o-mini");
  push("gpt-4o");
  return out;
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function buildUserContext(params: GenerateOpenAIRecoveryParams) {
  const { todayISO, language, todayShift, nextShift, todayVital, vitals7, prevWeekVitals } = params;
  const avg7 = vitals7.length
    ? Math.round(
        vitals7.reduce((sum, vital) => sum + Math.min(vital.body.value, vital.mental.ema), 0) / vitals7.length
      )
    : null;
  const avgPrev = prevWeekVitals.length
    ? Math.round(
        prevWeekVitals.reduce((sum, vital) => sum + Math.min(vital.body.value, vital.mental.ema), 0) /
          prevWeekVitals.length
      )
    : null;

  return {
    language,
    dateISO: todayISO,
    shift: {
      today: todayShift,
      next: nextShift,
    },
    today: todayVital
      ? {
          vitalScore: Math.round(Math.min(todayVital.body.value, todayVital.mental.ema)),
          body: Math.round(todayVital.body.value),
          mental: Math.round(todayVital.mental.ema),
          sleepHours: todayVital.inputs.sleepHours ?? "-",
          napHours: todayVital.inputs.napHours ?? "-",
          stress: todayVital.inputs.stress ?? "-",
          activity: todayVital.inputs.activity ?? "-",
          mood: todayVital.inputs.mood ?? todayVital.emotion?.mood ?? "-",
          caffeineMg: todayVital.inputs.caffeineMg ?? "-",
          symptomSeverity: todayVital.inputs.symptomSeverity ?? "-",
          menstrualLabel: todayVital.menstrual?.label ?? "-",
          menstrualTracking: Boolean(todayVital.menstrual?.enabled),
          sleepDebtHours: todayVital.engine?.sleepDebtHours ?? "-",
          nightStreak: todayVital.engine?.nightStreak ?? "-",
          csi: todayVital.engine?.CSI ?? "-",
          sri: todayVital.engine?.SRI ?? "-",
          cif: todayVital.engine?.CIF ?? "-",
          slf: todayVital.engine?.SLF ?? "-",
          mif: todayVital.engine?.MIF ?? "-",
        }
      : null,
    weekly: {
      avgVital7: avg7,
      avgVitalPrev7: avgPrev,
      recordsIn7Days: vitals7.length,
      recentVitals7: vitals7.map((vital) => ({
        dateISO: vital.dateISO,
        shift: vital.shift,
        sleepHours: vital.inputs.sleepHours ?? "-",
        napHours: vital.inputs.napHours ?? "-",
        stress: vital.inputs.stress ?? "-",
        activity: vital.inputs.activity ?? "-",
        mood: vital.inputs.mood ?? vital.emotion?.mood ?? "-",
        caffeineMg: vital.inputs.caffeineMg ?? "-",
        symptomSeverity: vital.inputs.symptomSeverity ?? "-",
      })),
    },
  };
}

function buildDeveloperPrompt(language: Language) {
  if (language === "ko") {
    return "너는 간호사의 건강회복과 번아웃방지, 데이터를 통한 개인 맞춤 건강회복 전문가야. 맞춤 건강 회복을 위한 자세한 지시들 자세한 행동들을 알려주는 역할이야.";
  }
  return "You are a nurse wellness and burnout-prevention specialist who gives data-driven, personalized recovery guidance with specific actionable steps.";
}

function buildUserPrompt(language: Language, context: ReturnType<typeof buildUserContext>) {
  if (language === "ko") {
    return [
      "supabase를 통한 데이터와 유저의 기록 기반 알고리즘/통계 데이터를 총합해 회복 조언을 작성하세요.",
      "아래 형식을 반드시 지켜서 한국어 텍스트로 출력하세요.",
      "",
      "[A] 한줄 요약",
      "- 전체 데이터를 종합해서 오늘 가장 중요한 것 한 문장",
      "",
      "[B] 긴급 알림",
      "- 위험 요소 2개 이상 동시 발생 시에만 작성",
      "- 없으면 정확히 '없음'이라고 작성",
      "",
      "[C] 오늘의 회복 처방",
      "- 해당되는 항목만 작성",
      "- 우선순위: 수면 > 교대근무 > 카페인 > 생리주기 > 스트레스&감정 > 신체활동",
      "- 각 항목은 2-3문장 설명 + 행동 2-3개",
      "- 생리주기는 전문용어 없이 쉬운 단어 사용",
      "",
      "[D] 이번 주 AI 한마디",
      "- 이번 주 요약 -> 개인 패턴 -> 다음 주 예측 순서",
      "",
      "[톤 가이드]",
      "- 간호사 동료처럼 부드러운 말투",
      "- 자책 유도 금지",
      "- 추상적인 말 대신 바로 실행 가능한 행동",
      "- 수치(예: 수면부채/카페인/기분)는 input JSON 값을 그대로 사용하고 임의 수치를 만들지 말 것",
      "",
      "[데이터(JSON)]",
      JSON.stringify(context, null, 2),
    ].join("\n");
  }

  return [
    "Create personalized recovery guidance from the user's Supabase-backed records and computed trends.",
    "Output plain text in this exact structure:",
    "[A] One-line summary",
    "[B] Urgent alert (only if 2+ risks, otherwise write 'none')",
    "[C] Today's recovery plan (only relevant categories, prioritized sleep > shift > caffeine > menstrual > stress > activity)",
    "[D] Weekly AI note (weekly summary -> personal pattern -> next week preview)",
    "Tone: warm peer nurse voice, no medical jargon, no blame, concrete actions.",
    "",
    "[Data JSON]",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function extractResponsesText(json: any): string {
  const direct = json?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (Array.isArray(direct)) {
    const joined = direct
      .map((item) => (typeof item === "string" ? item : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }

  const output = Array.isArray(json?.output) ? json.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = typeof part?.text === "string" ? part.text : "";
      if (text) chunks.push(text);
    }
  }
  return chunks.join("").trim();
}

async function callResponsesApi(args: {
  apiKey: string;
  model: string;
  developerPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
  strictMode: boolean;
  maxOutputTokens: number;
}): Promise<TextAttempt> {
  const { apiKey, model, developerPrompt, userPrompt, signal, strictMode, maxOutputTokens } = args;

  const payload = strictMode
    ? {
        model,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: developerPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        text: {
          format: { type: "text" },
          verbosity: "medium",
        },
        reasoning: {
          effort: "medium",
        },
        max_output_tokens: maxOutputTokens,
        tools: [],
        store: true,
        include: ["reasoning.encrypted_content", "web_search_call.action.sources"],
      }
    : {
        model,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: developerPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        text: {
          format: { type: "text" },
        },
        reasoning: {
          effort: "medium",
        },
        max_output_tokens: maxOutputTokens,
      };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      text: null,
      error: `openai_responses_${response.status}_model:${model}_${truncateError(raw || "unknown_error")}`,
    };
  }

  const json = await response.json().catch(() => null);
  const text = extractResponsesText(json);
  if (!text) {
    return {
      text: null,
      error: `openai_empty_text_model:${model}`,
    };
  }

  return { text, error: null };
}

function cleanLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripHeadingPrefix(line: string) {
  return line
    .replace(/^\[(?:A|B|C|D)\]\s*/i, "")
    .replace(/^(?:A|B|C|D)\s*[).:\-]\s*/i, "")
    .replace(/^\d\s*[).:\-]\s*/, "")
    .trim();
}

function findSectionStart(text: string, label: "A" | "B" | "C" | "D") {
  const patterns = [new RegExp(`(?:^|\\n)\\s*\\[${label}\\]`, "i"), new RegExp(`(?:^|\\n)\\s*${label}\\s*[).:\\-]`, "i")];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match.index + (match[0].startsWith("\n") ? 1 : 0);
  }
  return -1;
}

function extractSection(text: string, label: "A" | "B" | "C" | "D") {
  const start = findSectionStart(text, label);
  if (start < 0) return "";

  const ends = (["A", "B", "C", "D"] as const)
    .filter((v) => v !== label)
    .map((v) => findSectionStart(text.slice(start + 1), v))
    .filter((idx) => idx >= 0)
    .map((idx) => idx + start + 1);

  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).trim();
}

function parseCategoryFromLabel(label: string): CategoryMeta | null {
  const normalized = label.toLowerCase();
  for (const meta of CATEGORY_ORDER) {
    if (meta.hints.some((hint) => normalized.includes(hint.toLowerCase()))) {
      return meta;
    }
  }
  return null;
}

function parseSeverity(text: string): RecoverySection["severity"] {
  const n = text.toLowerCase();
  if (
    n.includes("위험") ||
    n.includes("경고") ||
    n.includes("주의가 필요") ||
    n.includes("urgent") ||
    n.includes("warning") ||
    n.includes("critical")
  ) {
    return "warning";
  }
  if (n.includes("주의") || n.includes("부담") || n.includes("caution")) return "caution";
  return "info";
}

function parseCategoryBlocks(cBlock: string, language: Language): RecoverySection[] {
  const lines = cleanLines(cBlock);
  const sections: RecoverySection[] = [];

  type Builder = {
    meta: CategoryMeta;
    description: string[];
    tips: string[];
  };

  let current: Builder | null = null;

  const flush = () => {
    if (!current) return;
    const descriptionText = current.description.join(" ").trim();
    const title = language === "ko" ? current.meta.titleKo : current.meta.titleEn;
    if (descriptionText || current.tips.length) {
      sections.push({
        category: current.meta.category,
        severity: parseSeverity(`${title} ${descriptionText} ${current.tips.join(" ")}`),
        title,
        description: descriptionText || (language === "ko" ? "오늘 컨디션에 맞춘 보정 조언입니다." : "Adjusted guidance for today."),
        tips: current.tips.slice(0, 3),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const blockHeading = line.match(/^\[(.+?)\]\s*$/);
    if (blockHeading) {
      const meta = parseCategoryFromLabel(blockHeading[1]);
      if (meta) {
        flush();
        current = { meta, description: [], tips: [] };
      }
      continue;
    }

    const numberedHeading = line.match(/^3\s*[-.]\s*([1-6])\s*[).:\-]?\s*(.+)$/);
    if (numberedHeading) {
      const idx = Number(numberedHeading[1]) - 1;
      const meta = CATEGORY_ORDER[idx] ?? null;
      if (meta) {
        flush();
        current = { meta, description: [], tips: [] };
        if (numberedHeading[2]) current.description.push(numberedHeading[2].trim());
      }
      continue;
    }

    if (!current) {
      continue;
    }

    const tipMatch = line.match(/^(?:[-*•·]|\d+\.)\s*(.+)$/);
    if (tipMatch) {
      const tip = tipMatch[1].trim();
      if (tip) current.tips.push(tip);
      continue;
    }

    const plain = stripHeadingPrefix(line);
    if (plain && !/^\[C\]/i.test(plain)) {
      current.description.push(plain);
    }
  }

  flush();

  if (sections.length) return sections;

  const fallbackLines = lines.filter((line) => !/^\[(?:C|D)\]/i.test(line));
  if (!fallbackLines.length) return [];

  return [
    {
      category: "sleep",
      severity: parseSeverity(fallbackLines.join(" ")),
      title: language === "ko" ? "오늘의 회복 처방" : "Recovery Plan",
      description: fallbackLines.slice(0, 2).map(stripHeadingPrefix).join(" ").trim() || (language === "ko" ? "맞춤 처방을 확인하세요." : "Check your tailored plan."),
      tips: fallbackLines
        .slice(2)
        .map((line) => line.replace(/^(?:[-*•·]|\d+\.)\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 3),
    },
  ];
}

function parseCompoundAlertFromText(bBlock: string): CompoundAlert | null {
  const lines = cleanLines(bBlock)
    .map(stripHeadingPrefix)
    .filter((line) => !/^긴급\s*알림/i.test(line) && !/^urgent/i.test(line));

  if (!lines.length) return null;
  if (lines.some((line) => /^없음$/i.test(line) || /^none$/i.test(line))) return null;

  const factors: string[] = [];
  const factorRegex = /\[([^\]]+)\]/g;
  const joined = lines.join(" ");
  let m: RegExpExecArray | null = null;
  while ((m = factorRegex.exec(joined)) !== null) {
    const tag = m[1].trim();
    if (tag && !factors.includes(tag)) factors.push(tag);
  }

  const message = joined.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  if (!message) return null;
  return {
    factors: factors.slice(0, 5),
    message,
  };
}

function parseWeeklySummaryFromText(dBlock: string): WeeklySummary | null {
  const lines = cleanLines(dBlock)
    .map(stripHeadingPrefix)
    .filter((line) => !/^이번\s*주\s*AI\s*한마디/i.test(line) && !/^weekly/i.test(line));

  if (!lines.length) return null;

  const joined = lines.join(" ");
  const avgMatch = joined.match(/(?:평균\s*배터리|average\s*battery)\D*(\d{1,3})/i);
  const deltaMatch = joined.match(/(?:지난주\D*|vs\s*last\s*week\D*)([-+]?\d{1,3})/i);
  const avgBattery = clamp(Number(avgMatch?.[1] ?? 0), 0, 100);
  const delta = Number(deltaMatch?.[1] ?? 0);
  const prevAvgBattery = clamp(avgBattery - delta, 0, 100);

  const drainMatches = [...joined.matchAll(/([가-힣A-Za-z\s&]+?)\s*(\d{1,3})%/g)];
  const topDrains = drainMatches
    .map((hit) => ({ label: hit[1].trim(), pct: clamp(Number(hit[2]), 0, 100) }))
    .filter((v) => v.label)
    .slice(0, 3);

  const personalInsight = lines.slice(0, Math.min(2, lines.length)).join(" ").trim();
  const nextWeekPreview = lines.slice(-2).join(" ").trim() || lines[lines.length - 1];

  if (!personalInsight || !nextWeekPreview) return null;

  return {
    avgBattery: Math.round(avgBattery),
    prevAvgBattery: Math.round(prevAvgBattery),
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

function parseHeadlineFromText(aBlock: string, wholeText: string): string {
  const candidateLines = cleanLines(aBlock)
    .map(stripHeadingPrefix)
    .filter((line) => !/^한줄\s*요약/i.test(line) && !/^one-line\s*summary/i.test(line));
  if (candidateLines.length) {
    return candidateLines[0].replace(/^"|"$/g, "").trim();
  }

  const wholeLines = cleanLines(wholeText)
    .map(stripHeadingPrefix)
    .filter((line) => !/^\[[A-D]\]/i.test(line));
  return wholeLines[0] ?? "오늘 회복 체크인을 진행해요.";
}

function parseResultFromGeneratedText(text: string, language: Language): AIRecoveryResult {
  const aBlock = extractSection(text, "A");
  const bBlock = extractSection(text, "B");
  const cBlock = extractSection(text, "C");
  const dBlock = extractSection(text, "D");

  return {
    headline: parseHeadlineFromText(aBlock, text),
    compoundAlert: parseCompoundAlertFromText(bBlock),
    sections: parseCategoryBlocks(cBlock, language),
    weeklySummary: parseWeeklySummaryFromText(dBlock),
  };
}

export async function generateAIRecoveryWithOpenAI(
  params: GenerateOpenAIRecoveryParams
): Promise<OpenAIRecoveryOutput> {
  const apiKey = normalizeApiKey();
  const configuredModel = process.env.OPENAI_MODEL || "gpt-5-mini";
  if (!apiKey) {
    throw new Error("missing_openai_api_key");
  }

  const context = buildUserContext(params);
  const developerPrompt = buildDeveloperPrompt(params.language);
  const userPrompt = buildUserPrompt(params.language, context);
  const maxOutputTokens = resolveMaxOutputTokens();
  const candidates = modelCandidates(configuredModel);
  let lastError = "openai_request_failed";

  for (const model of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const strictAttempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt,
        userPrompt,
        signal: controller.signal,
        strictMode: true,
        maxOutputTokens,
      });

      if (strictAttempt.text) {
        const generatedText = strictAttempt.text.trim();
        return {
          result: parseResultFromGeneratedText(generatedText, params.language),
          generatedText,
          engine: "openai",
          model,
          debug: null,
        };
      }

      lastError = strictAttempt.error ?? lastError;
      if (lastError.includes("_401_")) {
        break;
      }

      const safeAttempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt,
        userPrompt,
        signal: controller.signal,
        strictMode: false,
        maxOutputTokens,
      });

      if (safeAttempt.text) {
        const generatedText = safeAttempt.text.trim();
        return {
          result: parseResultFromGeneratedText(generatedText, params.language),
          generatedText,
          engine: "openai",
          model,
          debug: null,
        };
      }

      lastError = safeAttempt.error ?? lastError;
      if (lastError.includes("_401_")) {
        break;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        lastError = `openai_timeout_model:${model}`;
      } else {
        lastError = `openai_fetch_model:${model}_${truncateError(err?.message ?? "unknown")}`;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastError);
}
