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
  engine: "openai";
  model: string | null;
  debug: string | null;
};

type OpenAIParsedResult = {
  headline?: unknown;
  compoundAlert?: unknown;
  sections?: unknown;
  weeklySummary?: unknown;
};

type ParsedAttempt = {
  parsed: AIRecoveryResult | null;
  error: string | null;
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

function parseWeeklySummary(value: unknown): WeeklySummary | null {
  if (!isObject(value)) return null;
  const avgBatteryRaw = Number(value.avgBattery);
  const prevAvgBatteryRaw = Number(value.prevAvgBattery);
  if (!Number.isFinite(avgBatteryRaw) || !Number.isFinite(prevAvgBatteryRaw)) return null;
  const avgBattery = clamp(avgBatteryRaw, 0, 100);
  const prevAvgBattery = clamp(prevAvgBatteryRaw, 0, 100);
  const topDrainsRaw = Array.isArray(value.topDrains) ? value.topDrains : [];
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
  const personalInsight = typeof value.personalInsight === "string" ? value.personalInsight.trim() : "";
  const nextWeekPreview = typeof value.nextWeekPreview === "string" ? value.nextWeekPreview.trim() : "";
  if (!personalInsight || !nextWeekPreview) return null;
  return {
    avgBattery: Math.round(avgBattery),
    prevAvgBattery: Math.round(prevAvgBattery),
    topDrains,
    personalInsight,
    nextWeekPreview,
  };
}

function parseRecoveryResult(value: unknown): AIRecoveryResult | null {
  if (!isObject(value)) return null;
  const parsed = value as OpenAIParsedResult;
  const rawHeadline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sections = sectionsRaw.map(parseSection).filter((item): item is RecoverySection => Boolean(item));
  const headline = rawHeadline || (sections.length ? sections[0].description : "");
  if (!headline) return null;
  return {
    headline,
    compoundAlert: parseCompoundAlert(parsed.compoundAlert),
    sections,
    weeklySummary: parseWeeklySummary(parsed.weeklySummary),
  };
}

function extractChatContent(json: any): string {
  const msg = json?.choices?.[0]?.message?.content;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg)) {
    const text = msg
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return text;
  }
  return "";
}

function parseLooseJson(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = trimmed.slice(first, last + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
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
  // 모델 오설정/권한 이슈 대비 최소 안전 후보
  push("gpt-4o-mini");
  push("gpt-4o");
  return out;
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
          sleepHours: todayVital.inputs.sleepHours ?? null,
          napHours: todayVital.inputs.napHours ?? null,
          stress: todayVital.inputs.stress ?? null,
          activity: todayVital.inputs.activity ?? null,
          mood: todayVital.inputs.mood ?? todayVital.emotion?.mood ?? null,
          caffeineMg: todayVital.inputs.caffeineMg ?? null,
          symptomSeverity: todayVital.inputs.symptomSeverity ?? null,
          menstrualLabel: todayVital.menstrual?.label ?? null,
          menstrualTracking: Boolean(todayVital.menstrual?.enabled),
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
      recentVitals7: vitals7.map((vital) => ({
        dateISO: vital.dateISO,
        shift: vital.shift,
        sleepHours: vital.inputs.sleepHours ?? null,
        napHours: vital.inputs.napHours ?? null,
        stress: vital.inputs.stress ?? null,
        activity: vital.inputs.activity ?? null,
        mood: vital.inputs.mood ?? vital.emotion?.mood ?? null,
        caffeineMg: vital.inputs.caffeineMg ?? null,
        symptomSeverity: vital.inputs.symptomSeverity ?? null,
      })),
    },
  };
}

function buildSystemPrompt(language: Language) {
  const ko = language === "ko";
  return ko
    ? [
        "너는 RNest의 AI 맞춤회복 생성기다.",
        "반드시 JSON으로만 답하고, JSON 외 텍스트를 절대 출력하지 마라.",
        "출력은 A/B/C/D 틀을 채우는 데이터다: headline(A), compoundAlert(B), sections(C), weeklySummary(D).",
        "톤은 '간호사 동료'처럼 따뜻하고 짧게, 자책 유도 금지, 실행 가능한 행동 위주로 작성한다.",
        "섹션 C는 해당되는 카테고리만 포함한다. 우선순위는 sleep > shift > caffeine > menstrual > stress > activity.",
        "각 섹션은 설명 1-2문장 + 행동 가이드 2-3개(tips)로 작성한다.",
        "복합 위험(B)은 위험요소 2개 이상일 때만 compoundAlert를 채우고, 아니면 null로 둔다.",
        "생리 관련 문구는 쉬운 표현만 사용한다: '생리 기간', '생리 직전 기간', '컨디션 안정 기간', '컨디션 변화가 큰 날'.",
        "전문 용어(예: 황체기, 여포기, 배란기, luteal/follicular/ovulation)는 쓰지 마라.",
      ].join("\n")
    : [
        "You generate RNest recovery prescriptions.",
        "Return JSON only without extra text.",
        "Fill A/B/C/D structure through fields: headline(A), compoundAlert(B), sections(C), weeklySummary(D).",
        "Use warm, concise peer-to-peer tone for nurses.",
        "Each section: 1-2 sentence situation summary + 2-3 actionable tips.",
        "No blame, no diagnosis language, no vague statements.",
        "Category priority: sleep > shift > caffeine > menstrual > stress > activity.",
        "Include only relevant categories and skip low-signal categories.",
        "Use simple menstrual wording only: 'period phase', 'pre-period phase', 'stable phase', 'sensitive phase'.",
        "Do not use technical cycle terms (luteal/follicular/ovulation).",
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

function truncateError(raw: string, size = 180) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
}

function parseAttemptFromContent(content: string, model: string, source: "chat" | "responses"): ParsedAttempt {
  const parsedUnknown = parseLooseJson(content);
  if (!parsedUnknown) {
    return { parsed: null, error: `openai_invalid_json_${source}_model:${model}` };
  }
  const parsed = parseRecoveryResult(parsedUnknown);
  if (!parsed) {
    return { parsed: null, error: `openai_invalid_schema_${source}_model:${model}` };
  }
  return { parsed, error: null };
}

function extractResponsesContent(json: any): string {
  const direct = json?.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
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

async function tryChatCompletions(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}): Promise<ParsedAttempt> {
  const { apiKey, model, systemPrompt, userPrompt, signal } = args;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 2200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
    signal,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      parsed: null,
      error: `openai_chat_${response.status}_model:${model}_${truncateError(raw || "unknown_error")}`,
    };
  }

  const json = await response.json().catch(() => null);
  const content = extractChatContent(json);
  return parseAttemptFromContent(content, model, "chat");
}

async function tryResponsesApi(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}): Promise<ParsedAttempt> {
  const { apiKey, model, systemPrompt, userPrompt, signal } = args;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_output_tokens: 2200,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      parsed: null,
      error: `openai_responses_${response.status}_model:${model}_${truncateError(raw || "unknown_error")}`,
    };
  }

  const json = await response.json().catch(() => null);
  const content = extractResponsesContent(json);
  return parseAttemptFromContent(content, model, "responses");
}

export async function generateAIRecoveryWithOpenAI(
  params: GenerateOpenAIRecoveryParams
): Promise<OpenAIRecoveryOutput> {
  const apiKey = normalizeApiKey();
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    throw new Error("missing_openai_api_key");
  }

  const context = buildUserContext(params);
  const systemPrompt = buildSystemPrompt(params.language);
  const userPrompt = buildUserPrompt(context);
  const candidates = modelCandidates(model);
  let lastError = "openai_request_failed";

  try {
    for (const candidate of candidates) {
      // 네트워크 상황이 느릴 수 있어 30초로 확장
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const chatAttempt = await tryChatCompletions({
          apiKey,
          model: candidate,
          systemPrompt,
          userPrompt,
          signal: controller.signal,
        });
        if (chatAttempt.parsed) {
          return {
            result: chatAttempt.parsed,
            engine: "openai",
            model: candidate,
            debug: null,
          };
        }
        lastError = chatAttempt.error ?? lastError;

        const responsesAttempt = await tryResponsesApi({
          apiKey,
          model: candidate,
          systemPrompt,
          userPrompt,
          signal: controller.signal,
        });
        if (responsesAttempt.parsed) {
          return {
            result: responsesAttempt.parsed,
            engine: "openai",
            model: candidate,
            debug: null,
          };
        }
        lastError = responsesAttempt.error ?? lastError;
      } catch (innerErr: any) {
        if (innerErr?.name === "AbortError") {
          lastError = `openai_timeout_model:${candidate}`;
        } else {
          lastError = `openai_fetch_model:${candidate}_${innerErr?.message ?? "unknown"}`;
        }
        continue;
      } finally {
        // ✅ 항상 timer 정리 (memory leak 방지)
        clearTimeout(timer);
      }
    }
  } catch (error: any) {
    lastError = `openai_outer_${error?.message ?? "unknown"}`;
  }

  throw new Error(lastError);
}
