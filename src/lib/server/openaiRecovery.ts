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
  fallback: AIRecoveryResult;
};

export type OpenAIRecoveryOutput = {
  result: AIRecoveryResult;
  engine: "openai" | "rule";
  model: string | null;
};

type OpenAIParsedResult = {
  headline?: unknown;
  compoundAlert?: unknown;
  sections?: unknown;
  weeklySummary?: unknown;
};

function clamp(value: number, min: number, max: number) {
  const n = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, n));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCompoundAlert(value: unknown): CompoundAlert | null {
  if (value == null) return null;
  if (!isObject(value)) return null;
  const factorsRaw = Array.isArray(value.factors) ? value.factors : [];
  const factors = factorsRaw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!message || !factors.length) return null;
  return { factors, message };
}

function parseSection(value: unknown): RecoverySection | null {
  if (!isObject(value)) return null;
  const category = value.category;
  const severity = value.severity;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const description = typeof value.description === "string" ? value.description.trim() : "";
  const tipsRaw = Array.isArray(value.tips) ? value.tips : [];
  const tips = tipsRaw
    .map((tip) => (typeof tip === "string" ? tip.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);
  const validCategory =
    category === "sleep" ||
    category === "shift" ||
    category === "caffeine" ||
    category === "menstrual" ||
    category === "stress" ||
    category === "activity";
  const validSeverity = severity === "info" || severity === "caution" || severity === "warning";
  if (!validCategory || !validSeverity || !title || !description || !tips.length) return null;
  return {
    category,
    severity,
    title,
    description,
    tips,
  };
}

function parseWeeklySummary(value: unknown, fallback: WeeklySummary | null): WeeklySummary | null {
  if (!isObject(value)) return fallback;
  const avgBattery = clamp(Number(value.avgBattery ?? fallback?.avgBattery ?? 0), 0, 100);
  const prevAvgBattery = clamp(Number(value.prevAvgBattery ?? fallback?.prevAvgBattery ?? avgBattery), 0, 100);
  const topDrainsRaw = Array.isArray(value.topDrains) ? value.topDrains : fallback?.topDrains ?? [];
  const topDrains = topDrainsRaw
    .map((item) => {
      if (!isObject(item)) return null;
      const label = typeof item.label === "string" ? item.label.trim() : "";
      const pct = clamp(Number(item.pct), 0, 100);
      if (!label) return null;
      return { label, pct };
    })
    .filter((item): item is { label: string; pct: number } => Boolean(item))
    .slice(0, 3);
  const personalInsight =
    typeof value.personalInsight === "string" && value.personalInsight.trim()
      ? value.personalInsight.trim()
      : fallback?.personalInsight ?? "";
  const nextWeekPreview =
    typeof value.nextWeekPreview === "string" && value.nextWeekPreview.trim()
      ? value.nextWeekPreview.trim()
      : fallback?.nextWeekPreview ?? "";
  if (!personalInsight || !nextWeekPreview) return fallback;
  return {
    avgBattery: Math.round(avgBattery),
    prevAvgBattery: Math.round(prevAvgBattery),
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

function parseRecoveryResult(value: unknown, fallback: AIRecoveryResult): AIRecoveryResult {
  if (!isObject(value)) return fallback;
  const parsed = value as OpenAIParsedResult;
  const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = sectionsRaw.map(parseSection).filter((item): item is RecoverySection => Boolean(item));
  if (!headline || !sections.length) return fallback;
  return {
    headline,
    compoundAlert: parseCompoundAlert(parsed.compoundAlert),
    sections,
    weeklySummary: parseWeeklySummary(parsed.weeklySummary, fallback.weeklySummary),
  };
}

function buildUserContext(params: GenerateOpenAIRecoveryParams) {
  const { todayISO, language, todayShift, nextShift, todayVital, vitals7, prevWeekVitals, fallback } = params;
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
          sleepHours: todayVital.inputs.sleepHours ?? null,
          napHours: todayVital.inputs.napHours ?? null,
          stress: todayVital.inputs.stress ?? null,
          activity: todayVital.inputs.activity ?? null,
          caffeineMg: todayVital.inputs.caffeineMg ?? null,
          caffeineLastAt: todayVital.inputs.caffeineLastAt ?? null,
          symptomSeverity: todayVital.inputs.symptomSeverity ?? null,
          menstrualStatus: todayVital.inputs.menstrualStatus ?? null,
          sleepDebtHours: todayVital.engine?.sleepDebtHours ?? null,
          nightStreak: todayVital.engine?.nightStreak ?? null,
          csi: todayVital.engine?.CSI ?? null,
          sri: todayVital.engine?.SRI ?? null,
          cif: todayVital.engine?.CIF ?? null,
          slf: todayVital.engine?.SLF ?? null,
          mif: todayVital.engine?.MIF ?? null,
        }
      : null,
    weekly: {
      avgVital7: avg7,
      avgVitalPrev7: avgPrev,
      recordsIn7Days: vitals7.length,
    },
    ruleFallback: fallback,
  };
}

function buildSystemPrompt(language: Language) {
  const ko = language === "ko";
  return ko
    ? [
        "너는 RNest의 회복 처방 생성기다.",
        "반드시 JSON으로만 답하고 설명 텍스트를 추가하지 마라.",
        "간호사 동료처럼 따뜻하지만 간결하게 작성해라.",
        "각 섹션은 상황 설명 1-2문장 + 구체 행동 가이드 2-3개로 작성해라.",
        "자책/비난/의학적 진단 표현을 피하고 실무에서 즉시 실행 가능한 문장으로 작성해라.",
        "카테고리 우선순위는 sleep > shift > caffeine > menstrual > stress > activity를 따른다.",
        "조건이 약하면 섹션 수를 줄이고 핵심만 작성한다.",
      ].join("\n")
    : [
        "You generate RNest recovery prescriptions.",
        "Return JSON only without extra text.",
        "Use warm, concise peer-to-peer tone for nurses.",
        "Each section: 1-2 sentence situation summary + 2-3 actionable tips.",
        "No blame, no diagnosis language, no vague statements.",
        "Category priority: sleep > shift > caffeine > menstrual > stress > activity.",
        "If evidence is weak, reduce section count and keep only high-signal guidance.",
      ].join("\n");
}

function buildUserPrompt(context: ReturnType<typeof buildUserContext>) {
  return JSON.stringify(
    {
      task: "Generate personalized recovery output in the target schema.",
      schema: {
        headline: "string",
        compoundAlert: "{ factors: string[], message: string } | null",
        sections: [
          {
            category: "sleep|shift|caffeine|menstrual|stress|activity",
            severity: "info|caution|warning",
            title: "string",
            description: "string",
            tips: ["string", "string"],
          },
        ],
        weeklySummary:
          "{ avgBattery: number, prevAvgBattery: number, topDrains: {label:string,pct:number}[], personalInsight: string, nextWeekPreview: string } | null",
      },
      input: context,
    },
    null,
    2
  );
}

export async function generateAIRecoveryWithOpenAI(
  params: GenerateOpenAIRecoveryParams
): Promise<OpenAIRecoveryOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!apiKey) {
    return {
      result: params.fallback,
      engine: "rule",
      model: null,
    };
  }

  const context = buildUserContext(params);
  const systemPrompt = buildSystemPrompt(params.language);
  const userPrompt = buildUserPrompt(context);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_recovery_result",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                headline: { type: "string" },
                compoundAlert: {
                  anyOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        factors: { type: "array", items: { type: "string" } },
                        message: { type: "string" },
                      },
                      required: ["factors", "message"],
                    },
                    { type: "null" },
                  ],
                },
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      category: {
                        type: "string",
                        enum: ["sleep", "shift", "caffeine", "menstrual", "stress", "activity"],
                      },
                      severity: { type: "string", enum: ["info", "caution", "warning"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      tips: { type: "array", items: { type: "string" } },
                    },
                    required: ["category", "severity", "title", "description", "tips"],
                  },
                },
                weeklySummary: {
                  anyOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        avgBattery: { type: "number" },
                        prevAvgBattery: { type: "number" },
                        topDrains: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              label: { type: "string" },
                              pct: { type: "number" },
                            },
                            required: ["label", "pct"],
                          },
                        },
                        personalInsight: { type: "string" },
                        nextWeekPreview: { type: "string" },
                      },
                      required: ["avgBattery", "prevAvgBattery", "topDrains", "personalInsight", "nextWeekPreview"],
                    },
                    { type: "null" },
                  ],
                },
              },
              required: ["headline", "compoundAlert", "sections", "weeklySummary"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      return {
        result: params.fallback,
        engine: "rule",
        model: null,
      };
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return {
        result: params.fallback,
        engine: "rule",
        model: null,
      };
    }

    const parsedUnknown = JSON.parse(content) as unknown;
    const parsed = parseRecoveryResult(parsedUnknown, params.fallback);

    return {
      result: parsed,
      engine: "openai",
      model,
    };
  } catch {
    return {
      result: params.fallback,
      engine: "rule",
      model: null,
    };
  }
}

