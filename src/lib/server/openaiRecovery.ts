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

const DEFAULT_MAX_OUTPUT_TOKENS = 1800;

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

function roundNumber(value: unknown, digits = 1): number | "-" {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function roundInteger(value: unknown): number | "-" {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return Math.round(n);
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? DEFAULT_MAX_OUTPUT_TOKENS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.round(clamp(raw, 700, 3500));
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

function resolveModel() {
  const model = String(process.env.OPENAI_MODEL ?? "gpt-5.1").trim();
  return model || "gpt-5.1";
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
  const menstrualTrackingEnabled =
    typeof todayVital?.menstrual?.enabled === "boolean"
      ? todayVital.menstrual.enabled
      : (vitals7.find((vital) => typeof vital.menstrual?.enabled === "boolean")?.menstrual?.enabled ??
        prevWeekVitals.find((vital) => typeof vital.menstrual?.enabled === "boolean")?.menstrual?.enabled ??
        false);
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
    menstrualTrackingEnabled,
    shift: {
      today: todayShift,
      next: nextShift,
    },
    today: todayVital
      ? {
          vitalScore: roundInteger(Math.min(todayVital.body.value, todayVital.mental.ema)),
          body: roundInteger(todayVital.body.value),
          mental: roundInteger(todayVital.mental.ema),
          sleepHours: roundNumber(todayVital.inputs.sleepHours, 1),
          napHours: roundNumber(todayVital.inputs.napHours, 1),
          stress: roundInteger(todayVital.inputs.stress),
          activity: roundInteger(todayVital.inputs.activity),
          mood: roundInteger(todayVital.inputs.mood ?? todayVital.emotion?.mood),
          caffeineMg: roundInteger(todayVital.inputs.caffeineMg),
          symptomSeverity: roundInteger(todayVital.inputs.symptomSeverity),
          menstrualLabel: todayVital.menstrual?.label ?? "-",
          menstrualTracking: Boolean(todayVital.menstrual?.enabled),
          sleepDebtHours: roundNumber(todayVital.engine?.sleepDebtHours, 1),
          nightStreak: roundInteger(todayVital.engine?.nightStreak),
          csi: roundNumber(todayVital.engine?.CSI, 2),
          sri: roundNumber(todayVital.engine?.SRI, 2),
          cif: roundNumber(todayVital.engine?.CIF, 2),
          slf: roundNumber(todayVital.engine?.SLF, 2),
          mif: roundNumber(todayVital.engine?.MIF, 2),
        }
      : null,
    weekly: {
      avgVital7: avg7,
      avgVitalPrev7: avgPrev,
      recordsIn7Days: vitals7.length,
      recentVitals7: vitals7.map((vital) => ({
        dateISO: vital.dateISO,
        shift: vital.shift,
        sleepHours: roundNumber(vital.inputs.sleepHours, 1),
        napHours: roundNumber(vital.inputs.napHours, 1),
        stress: roundInteger(vital.inputs.stress),
        activity: roundInteger(vital.inputs.activity),
        mood: roundInteger(vital.inputs.mood ?? vital.emotion?.mood),
        caffeineMg: roundInteger(vital.inputs.caffeineMg),
        symptomSeverity: roundInteger(vital.inputs.symptomSeverity),
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
      "- menstrualTrackingEnabled가 false면 [생리주기] 섹션을 절대 출력하지 말 것 (번호도 1~5만 사용)",
      "- menstrualTrackingEnabled가 true면 [생리주기] 포함 가능 (번호 1~6 사용 가능)",
      "- 각 항목은 '[카테고리명]' 헤더로 시작",
      "- 각 항목은 설명 1문장 + 행동 2개로 짧게 작성",
      "- 생리주기는 전문용어 없이 쉬운 단어 사용",
      "- 중복 문장 금지, 같은 의미 반복 금지",
      "- C 전체는 20줄 이내로 간결하게 작성",
      "",
      "[D] 이번 주 AI 한마디",
      "- 이번 주 요약 -> 개인 패턴 -> 다음 주 예측 순서",
      "",
      "[톤 가이드]",
      "- 간호사 동료처럼 부드러운 말투",
      "- 자책 유도 금지",
      "- 추상적인 말 대신 바로 실행 가능한 행동",
      "- 수치(예: 수면부채/카페인/기분)는 input JSON 값을 그대로 사용하고 임의 수치를 만들지 말 것",
      "- 수치는 소수점 1자리까지만 사용 (예: 1.6h, 42.3%)",
      "- '스트레스(2)', '기분4'처럼 숫자 태그 형태 금지. 반드시 자연어로 풀어쓰기 (예: 스트레스가 조금 높은 편, 기분이 좋은 편)",
      "- 카페인 mg는 잔 수로 같이 표현 (예: 120mg -> 약 1잔)",
      "- 전체 답변은 한눈에 읽히게 짧은 문장 위주로 작성",
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
    "[C] Today's recovery plan (only relevant categories, prioritized sleep > shift > caffeine > menstrual > stress > activity). Each category must start with [Category].",
    "If menstrualTrackingEnabled is false, do not include any menstrual section in [C] and use only 1-5 category numbering.",
    "If menstrualTrackingEnabled is true, menstrual section may be included and 1-6 numbering is allowed.",
    "[D] Weekly AI note (weekly summary -> personal pattern -> next week preview)",
    "Tone: warm peer nurse voice, no medical jargon, no blame, concrete actions.",
    "No duplicated sentences.",
    "Keep numbers at one decimal place max.",
    "Do not use score tags like stress(2) or mood4. Rewrite them in plain language.",
    "Express caffeine both as cups and mg (e.g., about 1 cup / 120mg).",
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
  maxOutputTokens: number;
}): Promise<TextAttempt> {
  const { apiKey, model, developerPrompt, userPrompt, signal, maxOutputTokens } = args;

  const payload = {
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
      verbosity: "low",
    },
    reasoning: {
      effort: "low",
    },
    max_output_tokens: maxOutputTokens,
    tools: [],
    store: false,
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
        tips: current.tips,
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

    const plainCandidate = line
      .replace(/^[\d.\-•·\s]+/, "")
      .replace(/[()[\]]/g, "")
      .trim();
    const plainMeta = parseCategoryFromLabel(plainCandidate);
    const shortHeading = plainCandidate.length > 0 && plainCandidate.length <= 16 && !/[.!?]/.test(plainCandidate);
    if (plainMeta && shortHeading) {
      flush();
      current = { meta: plainMeta, description: [], tips: [] };
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
        .filter(Boolean),
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

function roundToInt(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, 100));
}

function avgVitalScore(vitals: DailyVital[]) {
  if (!vitals.length) return null;
  const sum = vitals.reduce((acc, vital) => acc + Math.min(vital.body.value, vital.mental.ema), 0);
  return sum / vitals.length;
}

function buildFallbackWeeklySummary(params: GenerateOpenAIRecoveryParams): WeeklySummary | null {
  const avg7Raw = avgVitalScore(params.vitals7);
  if (avg7Raw == null) return null;
  const prevRaw = avgVitalScore(params.prevWeekVitals);
  const avgBattery = roundToInt(avg7Raw);
  const prevAvgBattery = roundToInt(prevRaw ?? avg7Raw);

  const total = Math.max(params.vitals7.length, 1);
  const sleepLowDays = params.vitals7.filter((v) => (v.inputs.sleepHours ?? 0) < 6).length;
  const caffeineHighDays = params.vitals7.filter((v) => (v.inputs.caffeineMg ?? 0) > 200).length;
  const stressHighDays = params.vitals7.filter((v) => {
    const stress = v.inputs.stress ?? 0;
    const mood = v.inputs.mood ?? v.emotion?.mood ?? 3;
    return stress >= 2 || mood <= 2;
  }).length;

  const drains = [
    { label: params.language === "ko" ? "수면 부족" : "Sleep debt", days: sleepLowDays },
    { label: params.language === "ko" ? "카페인 부담" : "Caffeine load", days: caffeineHighDays },
    { label: params.language === "ko" ? "스트레스/감정" : "Stress & mood", days: stressHighDays },
  ]
    .filter((item) => item.days > 0)
    .map((item) => ({ label: item.label, pct: roundToInt((item.days / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  if (params.language === "ko") {
    return {
      avgBattery,
      prevAvgBattery,
      topDrains: drains,
      personalInsight:
        sleepLowDays >= 2
          ? "이번 주에는 수면이 흔들린 날 이후 컨디션 하락이 반복됐어요. 수면 먼저 회복하면 전체 점수가 같이 올라가는 패턴입니다."
          : "이번 주는 비교적 안정적인 흐름이지만, 피로가 올라가는 날엔 휴식 시간을 먼저 확보할 때 회복이 빨랐어요.",
      nextWeekPreview:
        "다음 주에는 교대 전환일 주변에 수면·카페인 루틴을 먼저 고정하면 배터리 하락 폭을 줄이는 데 도움이 됩니다.",
    };
  }

  return {
    avgBattery,
    prevAvgBattery,
    topDrains: drains,
    personalInsight:
      sleepLowDays >= 2
        ? "This week, low-sleep days were followed by lower condition scores. Prioritizing sleep first appears to lift overall recovery."
        : "This week was relatively stable, and recovery improved when rest was protected early on demanding days.",
    nextWeekPreview:
      "Next week, locking sleep and caffeine timing around shift-transition days should reduce battery dips.",
  };
}

function mergeWeeklySummary(
  parsed: WeeklySummary | null,
  fallback: WeeklySummary | null
): WeeklySummary | null {
  if (!parsed && !fallback) return null;
  if (!parsed) return fallback;
  if (!fallback) return parsed;

  const avgBattery = parsed.avgBattery > 0 ? parsed.avgBattery : fallback.avgBattery;
  const prevAvgBattery =
    parsed.prevAvgBattery > 0 ? parsed.prevAvgBattery : fallback.prevAvgBattery;
  const topDrains = parsed.topDrains.length ? parsed.topDrains : fallback.topDrains;
  const personalInsight =
    parsed.personalInsight?.trim() ? parsed.personalInsight : fallback.personalInsight;
  const nextWeekPreview =
    parsed.nextWeekPreview?.trim() ? parsed.nextWeekPreview : fallback.nextWeekPreview;

  return {
    avgBattery: roundToInt(avgBattery),
    prevAvgBattery: roundToInt(prevAvgBattery),
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

function buildStructuredTextFromResult(result: AIRecoveryResult, language: Language): string {
  const lines: string[] = [];
  const sectionTitle = language === "ko" ? "오늘의 회복 처방" : "Today's Recovery Plan";
  const weeklyTitle = language === "ko" ? "이번 주 AI 한마디" : "Weekly AI Note";
  const noAlert = language === "ko" ? "없음" : "none";

  lines.push("[A] 한줄 요약");
  lines.push(result.headline || (language === "ko" ? "오늘의 핵심 회복 포인트를 확인해요." : "Check today's key recovery focus."));
  lines.push("");

  lines.push("[B] 긴급 알림");
  if (result.compoundAlert?.message?.trim()) {
    lines.push(result.compoundAlert.message.trim());
    if (result.compoundAlert.factors?.length) {
      lines.push(result.compoundAlert.factors.map((factor) => `[${factor}]`).join(" "));
    }
  } else {
    lines.push(noAlert);
  }
  lines.push("");

  lines.push("[C] " + sectionTitle);
  for (const section of result.sections ?? []) {
    lines.push(`[${section.title}]`);
    if (section.description?.trim()) lines.push(section.description.trim());
    for (const tip of section.tips ?? []) {
      const clean = String(tip ?? "").trim();
      if (clean) lines.push(`- ${clean}`);
    }
    lines.push("");
  }
  if (!result.sections?.length) {
    lines.push(language === "ko" ? "오늘은 추가 처방이 없어요." : "No additional prescription for today.");
    lines.push("");
  }

  lines.push("[D] " + weeklyTitle);
  if (result.weeklySummary) {
    lines.push(
      `${language === "ko" ? "평균 배터리" : "Average battery"} ${result.weeklySummary.avgBattery} · ${
        language === "ko" ? "지난주 대비" : "vs last week"
      } ${result.weeklySummary.avgBattery - result.weeklySummary.prevAvgBattery}`
    );
    if (result.weeklySummary.personalInsight?.trim()) {
      lines.push(`- ${result.weeklySummary.personalInsight.trim()}`);
    }
    if (result.weeklySummary.nextWeekPreview?.trim()) {
      lines.push(`- ${result.weeklySummary.nextWeekPreview.trim()}`);
    }
  } else {
    lines.push(language === "ko" ? "데이터 부족" : "not enough data");
  }

  return lines.join("\n").trim();
}

function translateFallbackResult(source: AIRecoveryResult): AIRecoveryResult {
  return {
    headline: source.headline,
    compoundAlert: source.compoundAlert,
    sections: (source.sections ?? []).map((section) => {
      const meta = CATEGORY_ORDER.find((item) => item.category === section.category);
      return {
        ...section,
        title: meta?.titleEn ?? section.title,
      };
    }),
    weeklySummary: source.weeklySummary,
  };
}

type TranslationBundle = {
  headline: string;
  compoundAlert: {
    factors: string[];
    message: string;
  } | null;
  sections: Array<{
    category: RecoverySection["category"];
    title: string;
    description: string;
    tips: string[];
  }>;
  weeklySummary: {
    topDrains: Array<{ label: string; pct: number }>;
    personalInsight: string;
    nextWeekPreview: string;
  } | null;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;

  const direct = (() => {
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  })();
  if (direct) return direct;

  const fenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(fenced);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function shapeMatches(source: TranslationBundle, translated: TranslationBundle) {
  if (source.sections.length !== translated.sections.length) return false;
  for (let i = 0; i < source.sections.length; i++) {
    if (source.sections[i].tips.length !== translated.sections[i].tips.length) return false;
  }
  const srcAlert = source.compoundAlert;
  const trAlert = translated.compoundAlert;
  if (Boolean(srcAlert) !== Boolean(trAlert)) return false;
  if (srcAlert && trAlert && srcAlert.factors.length !== trAlert.factors.length) return false;
  const srcWeekly = source.weeklySummary;
  const trWeekly = translated.weeklySummary;
  if (Boolean(srcWeekly) !== Boolean(trWeekly)) return false;
  if (srcWeekly && trWeekly && srcWeekly.topDrains.length !== trWeekly.topDrains.length) return false;
  return true;
}

function bundleFromResult(result: AIRecoveryResult): TranslationBundle {
  return {
    headline: result.headline ?? "",
    compoundAlert: result.compoundAlert
      ? {
          factors: result.compoundAlert.factors ?? [],
          message: result.compoundAlert.message ?? "",
        }
      : null,
    sections: (result.sections ?? []).map((section) => ({
      category: section.category,
      title: section.title ?? "",
      description: section.description ?? "",
      tips: section.tips ?? [],
    })),
    weeklySummary: result.weeklySummary
      ? {
          topDrains: result.weeklySummary.topDrains ?? [],
          personalInsight: result.weeklySummary.personalInsight ?? "",
          nextWeekPreview: result.weeklySummary.nextWeekPreview ?? "",
        }
      : null,
  };
}

function parseTranslatedBundle(candidate: Record<string, unknown>): TranslationBundle | null {
  const sectionsRaw = candidate.sections;
  const sections = Array.isArray(sectionsRaw)
    ? sectionsRaw.map((item) => {
        const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
        const categoryRaw = row.category;
        const category =
          categoryRaw === "sleep" ||
          categoryRaw === "shift" ||
          categoryRaw === "caffeine" ||
          categoryRaw === "menstrual" ||
          categoryRaw === "stress" ||
          categoryRaw === "activity"
            ? categoryRaw
            : "sleep";
        return {
          category: category as RecoverySection["category"],
          title: asString(row.title),
          description: asString(row.description),
          tips: asStringArray(row.tips),
        };
      })
    : [];

  const compoundRaw =
    typeof candidate.compoundAlert === "object" && candidate.compoundAlert !== null
      ? (candidate.compoundAlert as Record<string, unknown>)
      : null;
  const weeklyRaw =
    typeof candidate.weeklySummary === "object" && candidate.weeklySummary !== null
      ? (candidate.weeklySummary as Record<string, unknown>)
      : null;

  const topDrains = Array.isArray(weeklyRaw?.topDrains)
    ? weeklyRaw.topDrains
        .map((item) => {
          const row = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
          const pct = Number(row.pct);
          return {
            label: asString(row.label),
            pct: Number.isFinite(pct) ? Math.round(clamp(pct, 0, 100)) : 0,
          };
        })
        .filter((item) => item.label)
    : [];

  return {
    headline: asString(candidate.headline),
    compoundAlert: compoundRaw
      ? {
          factors: asStringArray(compoundRaw.factors),
          message: asString(compoundRaw.message),
        }
      : null,
    sections,
    weeklySummary: weeklyRaw
      ? {
          topDrains,
          personalInsight: asString(weeklyRaw.personalInsight),
          nextWeekPreview: asString(weeklyRaw.nextWeekPreview),
        }
      : null,
  };
}

function mergeTranslatedResult(source: AIRecoveryResult, translated: TranslationBundle): AIRecoveryResult {
  const fallback = translateFallbackResult(source);
  const mergedSections = source.sections.map((sourceSection, idx) => {
    const translatedSection = translated.sections[idx];
    const meta = CATEGORY_ORDER.find((item) => item.category === sourceSection.category);
    const translatedTips = sourceSection.tips.map((tip, tipIdx) => {
      const translatedTip = translatedSection?.tips?.[tipIdx] ?? "";
      return translatedTip.trim() || tip;
    });

    return {
      ...sourceSection,
      title: translatedSection?.title?.trim() || meta?.titleEn || sourceSection.title,
      description: translatedSection?.description?.trim() || sourceSection.description,
      tips: translatedTips,
    };
  });

  const mergedCompoundAlert = source.compoundAlert
    ? {
        factors: source.compoundAlert.factors.map((factor, idx) => translated.compoundAlert?.factors?.[idx]?.trim() || factor),
        message: translated.compoundAlert?.message?.trim() || source.compoundAlert.message,
      }
    : null;

  const mergedWeeklySummary = source.weeklySummary
    ? {
        avgBattery: source.weeklySummary.avgBattery,
        prevAvgBattery: source.weeklySummary.prevAvgBattery,
        topDrains: source.weeklySummary.topDrains.map((drain, idx) => ({
          label: translated.weeklySummary?.topDrains?.[idx]?.label?.trim() || drain.label,
          pct: drain.pct,
        })),
        personalInsight: translated.weeklySummary?.personalInsight?.trim() || source.weeklySummary.personalInsight,
        nextWeekPreview: translated.weeklySummary?.nextWeekPreview?.trim() || source.weeklySummary.nextWeekPreview,
      }
    : null;

  return {
    headline: translated.headline?.trim() || fallback.headline,
    compoundAlert: mergedCompoundAlert,
    sections: mergedSections,
    weeklySummary: mergedWeeklySummary,
  };
}

export async function generateAIRecoveryWithOpenAI(
  params: GenerateOpenAIRecoveryParams
): Promise<OpenAIRecoveryOutput> {
  const apiKey = normalizeApiKey();
  const model = resolveModel();
  if (!apiKey) {
    throw new Error("missing_openai_api_key");
  }

  const context = buildUserContext(params);
  const developerPrompt = buildDeveloperPrompt(params.language);
  const userPrompt = buildUserPrompt(params.language, context);
  const maxOutputTokens = resolveMaxOutputTokens();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const attempt = await callResponsesApi({
      apiKey,
      model,
      developerPrompt,
      userPrompt,
      signal: controller.signal,
      maxOutputTokens,
    });

    if (!attempt.text) {
      throw new Error(attempt.error ?? `openai_request_failed_model:${model}`);
    }

    const generatedText = attempt.text.trim();
    const parsed = parseResultFromGeneratedText(generatedText, params.language);
    const safeSections = context.menstrualTrackingEnabled
      ? parsed.sections
      : parsed.sections.filter((section) => section.category !== "menstrual");
    const weeklyFallback = buildFallbackWeeklySummary(params);
    const mergedResult: AIRecoveryResult = {
      ...parsed,
      sections: safeSections,
      weeklySummary: mergeWeeklySummary(parsed.weeklySummary, weeklyFallback),
    };
    return {
      result: mergedResult,
      generatedText,
      engine: "openai",
      model,
      debug: null,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`openai_timeout_model:${model}`);
    }
    if (typeof err?.message === "string" && err.message.trim()) {
      throw new Error(err.message.trim());
    }
    throw new Error(`openai_fetch_model:${model}_${truncateError(err?.message ?? "unknown")}`);
  } finally {
    clearTimeout(timer);
  }
}
export async function translateAIRecoveryToEnglish(
  source: OpenAIRecoveryOutput
): Promise<OpenAIRecoveryOutput> {
  const apiKey = normalizeApiKey();
  const model = resolveModel();
  if (!apiKey) {
    throw new Error("missing_openai_api_key");
  }

  type Pointer =
    | { kind: "headline" }
    | { kind: "alertMessage" }
    | { kind: "alertFactor"; factorIndex: number }
    | { kind: "sectionTitle"; sectionIndex: number }
    | { kind: "sectionDescription"; sectionIndex: number }
    | { kind: "sectionTip"; sectionIndex: number; tipIndex: number }
    | { kind: "weeklyDrainLabel"; drainIndex: number }
    | { kind: "weeklyPersonalInsight" }
    | { kind: "weeklyNextWeekPreview" };

  const lines: string[] = [];
  const pointers: Pointer[] = [];
  const push = (value: string, pointer: Pointer) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    lines.push(text);
    pointers.push(pointer);
  };

  push(source.result.headline, { kind: "headline" });
  if (source.result.compoundAlert) {
    push(source.result.compoundAlert.message, { kind: "alertMessage" });
    source.result.compoundAlert.factors.forEach((factor, factorIndex) =>
      push(factor, { kind: "alertFactor", factorIndex })
    );
  }
  source.result.sections.forEach((section, sectionIndex) => {
    push(section.title, { kind: "sectionTitle", sectionIndex });
    push(section.description, { kind: "sectionDescription", sectionIndex });
    section.tips.forEach((tip, tipIndex) =>
      push(tip, { kind: "sectionTip", sectionIndex, tipIndex })
    );
  });
  if (source.result.weeklySummary) {
    source.result.weeklySummary.topDrains.forEach((drain, drainIndex) =>
      push(drain.label, { kind: "weeklyDrainLabel", drainIndex })
    );
    push(source.result.weeklySummary.personalInsight, { kind: "weeklyPersonalInsight" });
    push(source.result.weeklySummary.nextWeekPreview, { kind: "weeklyNextWeekPreview" });
  }

  if (!lines.length) {
    return {
      result: translateFallbackResult(source.result),
      generatedText: buildStructuredTextFromResult(translateFallbackResult(source.result), "en"),
      engine: "openai",
      model,
      debug: "translate_empty_source",
    };
  }

  const parseArray = (raw: string): string[] | null => {
    const text = raw.trim();
    const tryParse = (candidate: string) => {
      try {
        const parsed = JSON.parse(candidate);
        if (!Array.isArray(parsed)) return null;
        return parsed.map((item) => String(item ?? "").trim());
      } catch {
        return null;
      }
    };
    const direct = tryParse(text);
    if (direct) return direct;

    const fenced = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const fencedParsed = tryParse(fenced);
    if (fencedParsed) return fencedParsed;

    const first = text.indexOf("[");
    const last = text.lastIndexOf("]");
    if (first >= 0 && last > first) {
      return tryParse(text.slice(first, last + 1));
    }
    return null;
  };

  const buildTranslatePrompt = (strictNoKorean = false) =>
    [
      "Translate each input string from Korean to natural English.",
      "Return ONLY a JSON array of strings.",
      `Array length must be exactly ${lines.length}.`,
      "Keep order exactly the same.",
      "Do not merge or split lines.",
      "Do not alter numbers, units, dates, or punctuation meaning.",
      strictNoKorean ? "Final output must contain no Korean characters." : "",
      "",
      JSON.stringify(lines, null, 2),
    ]
      .filter(Boolean)
      .join("\n");

  const translateOnce = async (strictNoKorean = false) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    try {
      const attempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt: "You are a professional Korean-to-English translator for nurse wellness content.",
        userPrompt: buildTranslatePrompt(strictNoKorean),
        signal: controller.signal,
        maxOutputTokens: resolveMaxOutputTokens(),
      });
      if (!attempt.text) {
        throw new Error(attempt.error ?? `openai_request_failed_model:${model}`);
      }
      const parsed = parseArray(attempt.text);
      if (!parsed) throw new Error(`openai_translate_non_json_array_model:${model}`);
      if (parsed.length !== lines.length) {
        throw new Error(`openai_translate_count_mismatch_model:${model}_${parsed.length}/${lines.length}`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };

  const hangulRatio = (arr: string[]) => {
    const text = arr.join(" ");
    const total = (text.match(/[A-Za-z가-힣]/g) ?? []).length;
    if (!total) return 0;
    const hangul = (text.match(/[가-힣]/g) ?? []).length;
    return hangul / total;
  };

  const maxOutputTokens = resolveMaxOutputTokens();
  try {
    let translatedLines = await translateOnce(false);
    if (hangulRatio(translatedLines) > 0.08) {
      translatedLines = await translateOnce(true);
    }

    const mergedResult: AIRecoveryResult = {
      ...source.result,
      compoundAlert: source.result.compoundAlert
        ? {
            ...source.result.compoundAlert,
            factors: [...source.result.compoundAlert.factors],
          }
        : null,
      sections: source.result.sections.map((section) => ({
        ...section,
        tips: [...section.tips],
      })),
      weeklySummary: source.result.weeklySummary
        ? {
            ...source.result.weeklySummary,
            topDrains: source.result.weeklySummary.topDrains.map((drain) => ({ ...drain })),
          }
        : null,
    };

    pointers.forEach((pointer, idx) => {
      const value = translatedLines[idx]?.trim();
      if (!value) return;
      if (pointer.kind === "headline") {
        mergedResult.headline = value;
        return;
      }
      if (pointer.kind === "alertMessage") {
        if (mergedResult.compoundAlert) mergedResult.compoundAlert.message = value;
        return;
      }
      if (pointer.kind === "alertFactor") {
        if (mergedResult.compoundAlert && mergedResult.compoundAlert.factors[pointer.factorIndex] != null) {
          mergedResult.compoundAlert.factors[pointer.factorIndex] = value;
        }
        return;
      }
      if (pointer.kind === "sectionTitle") {
        if (mergedResult.sections[pointer.sectionIndex]) mergedResult.sections[pointer.sectionIndex].title = value;
        return;
      }
      if (pointer.kind === "sectionDescription") {
        if (mergedResult.sections[pointer.sectionIndex]) mergedResult.sections[pointer.sectionIndex].description = value;
        return;
      }
      if (pointer.kind === "sectionTip") {
        if (
          mergedResult.sections[pointer.sectionIndex] &&
          mergedResult.sections[pointer.sectionIndex].tips[pointer.tipIndex] != null
        ) {
          mergedResult.sections[pointer.sectionIndex].tips[pointer.tipIndex] = value;
        }
        return;
      }
      if (pointer.kind === "weeklyDrainLabel") {
        if (mergedResult.weeklySummary?.topDrains[pointer.drainIndex]) {
          mergedResult.weeklySummary.topDrains[pointer.drainIndex].label = value;
        }
        return;
      }
      if (pointer.kind === "weeklyPersonalInsight") {
        if (mergedResult.weeklySummary) mergedResult.weeklySummary.personalInsight = value;
        return;
      }
      if (pointer.kind === "weeklyNextWeekPreview") {
        if (mergedResult.weeklySummary) mergedResult.weeklySummary.nextWeekPreview = value;
      }
    });

    const translatedText = buildStructuredTextFromResult(mergedResult, "en");

    return {
      result: mergedResult,
      generatedText: translatedText,
      engine: "openai",
      model,
      debug: null,
    };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error(`openai_timeout_model:${model}`);
    if (typeof err?.message === "string" && err.message.trim()) throw new Error(err.message.trim());
    throw new Error(`openai_fetch_model:${model}_${truncateError(err?.message ?? "unknown")}`);
  }
}
