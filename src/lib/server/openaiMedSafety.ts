export type MedSafetyItemType = "medication" | "device" | "unknown";
export type MedSafetyQuickStatus = "OK" | "CHECK" | "STOP";
export type ClinicalMode = "ward" | "er" | "icu";
export type ClinicalSituation = "pre_admin" | "during_admin" | "alarm" | "adverse_suspect" | "general";

export type MedSafetyAnalysisResult = {
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
  patientScript20s: string;
  modePriority: string[];
  confidenceNote: string;
};

type AnalyzeParams = {
  query: string;
  mode: ClinicalMode;
  situation: ClinicalSituation;
  patientSummary?: string;
  locale: "ko" | "en";
  imageDataUrl?: string;
  imageName?: string;
  signal: AbortSignal;
};

type ResponsesAttempt = {
  text: string | null;
  error: string | null;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function truncateError(raw: string, size = 220) {
  const clean = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .trim();
  return clean.length > size ? clean.slice(0, size) : clean;
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
  const model = String(process.env.OPENAI_MED_SAFETY_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.1").trim();
  return model || "gpt-5.1";
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

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    const start = input.indexOf("{");
    const end = input.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(input.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function toTextArray(value: unknown, limit: number, minLength = 1) {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const clean = String(item ?? "").replace(/\s+/g, " ").trim();
    if (clean.length < minLength) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function coerceItemType(value: unknown): MedSafetyItemType {
  if (value === "medication" || value === "device" || value === "unknown") return value;
  return "unknown";
}

function coerceQuickStatus(value: unknown): MedSafetyQuickStatus {
  if (value === "OK" || value === "CHECK" || value === "STOP") return value;
  return "CHECK";
}

function parseAnalysisResult(raw: unknown): MedSafetyAnalysisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const itemRaw = data.item as Record<string, unknown> | undefined;
  const quickRaw = data.quick as Record<string, unknown> | undefined;
  const doRaw = data.do as Record<string, unknown> | undefined;
  const safetyRaw = data.safety as Record<string, unknown> | undefined;

  if (!itemRaw || !quickRaw || !doRaw || !safetyRaw) return null;

  const itemName = String(itemRaw.name ?? "").trim();
  const primaryUse = String(itemRaw.primaryUse ?? "").trim();
  const patientScript20s = String(data.patientScript20s ?? "").trim();
  const confidenceNote = String(data.confidenceNote ?? "").trim();

  if (!itemName || !primaryUse || !patientScript20s) return null;

  const confidence = Math.round(clamp(Number(itemRaw.confidence ?? 0), 0, 100));

  const parsed: MedSafetyAnalysisResult = {
    item: {
      name: itemName,
      type: coerceItemType(itemRaw.type),
      aliases: toTextArray(itemRaw.aliases, 6),
      highRiskBadges: toTextArray(itemRaw.highRiskBadges, 4),
      primaryUse,
      confidence,
    },
    quick: {
      status: coerceQuickStatus(quickRaw.status),
      topActions: toTextArray(quickRaw.topActions, 3),
      topNumbers: toTextArray(quickRaw.topNumbers, 4),
      topRisks: toTextArray(quickRaw.topRisks, 3),
    },
    do: {
      steps: toTextArray(doRaw.steps, 8),
      calculatorsNeeded: toTextArray(doRaw.calculatorsNeeded, 4),
      compatibilityChecks: toTextArray(doRaw.compatibilityChecks, 5),
    },
    safety: {
      holdRules: toTextArray(safetyRaw.holdRules, 6),
      monitor: toTextArray(safetyRaw.monitor, 6),
      escalateWhen: toTextArray(safetyRaw.escalateWhen, 6),
    },
    patientScript20s: patientScript20s.slice(0, 220),
    modePriority: toTextArray(data.modePriority, 6),
    confidenceNote,
  };

  if (!parsed.quick.topActions.length || !parsed.do.steps.length || !parsed.safety.escalateWhen.length) {
    return null;
  }

  if (parsed.quick.status === "OK" && parsed.item.confidence < 65) {
    parsed.quick.status = "CHECK";
    if (!parsed.confidenceNote) {
      parsed.confidenceNote = "식별 확신이 낮아 CHECK로 전환되었습니다. 라벨/농도/라인을 재확인하세요.";
    }
  }

  return parsed;
}

function modeLabel(mode: ClinicalMode, locale: "ko" | "en") {
  if (locale === "en") {
    if (mode === "ward") return "Ward";
    if (mode === "er") return "ER";
    return "ICU";
  }
  if (mode === "ward") return "병동";
  if (mode === "er") return "ER";
  return "ICU";
}

function situationLabel(situation: ClinicalSituation, locale: "ko" | "en") {
  if (locale === "en") {
    if (situation === "pre_admin") return "Before administration";
    if (situation === "during_admin") return "During administration";
    if (situation === "alarm") return "Alarm triggered";
    if (situation === "adverse_suspect") return "Adverse event suspected";
    return "General lookup";
  }
  if (situation === "pre_admin") return "투여 직전";
  if (situation === "during_admin") return "투여 중";
  if (situation === "alarm") return "알람 발생";
  if (situation === "adverse_suspect") return "부작용 의심";
  return "일반 조회";
}

function buildDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "ko") {
    return [
      "너는 간호사 개인용 약물/의료도구 안전 실행 보조 AI다.",
      "반드시 실행 중심으로 답하고, 설명보다 행동을 먼저 제시한다.",
      "PDF 설계 원칙을 따른다: 30초 내 행동 결정, 수치/단계 우선, 중단 규칙은 숫자+조건, 라인/호환/알람 대응 중심.",
      "quick.topActions는 2~3개 핵심 행동만 제시한다(경고 과다 금지).",
      "quick.topRisks도 최대 3개만 제시한다. 과한 경고 나열 금지.",
      "모드(병동/ER/ICU)와 상황(투여직전/투여중/알람/부작용의심)에 따라 우선순위를 다르게 제시한다.",
      "질의/이미지가 모호하면 무리한 단정 금지: CHECK로 두고 재확인 포인트를 행동으로 제시한다.",
      "약물/도구 혼동 가능성, 단위/농도 오인 가능성, 라인 호환성 위험은 우선 경고에 반영한다.",
      "확신이 낮으면 confidence를 낮추고 confidenceNote/follow-up 성격 정보를 포함한다.",
      "진단/처방 대체 표현 금지. 최종 판단은 병원 지침/처방 우선으로 유지한다.",
      "출력은 JSON만 반환한다.",
    ].join(" ");
  }
  return [
    "You are a bedside medication/device safety action assistant for nurses.",
    "Prioritize action over explanation and optimize for 30-second decision support.",
    "Follow structure: numeric thresholds, step-first workflow, compatibility/alarm troubleshooting, hold/stop rules.",
    "Keep quick.topActions to 2-3 high-impact actions only.",
    "Keep quick.topRisks to at most 3 concise items.",
    "Adapt priorities by mode (Ward/ER/ICU) and situation.",
    "If the input is ambiguous, avoid overclaiming and keep status as CHECK with explicit verification actions.",
    "If uncertain, lower confidence and state what to verify.",
    "Do not replace diagnosis/order decisions.",
    "Return JSON only.",
  ].join(" ");
}

function buildUserPrompt(params: {
  query: string;
  mode: ClinicalMode;
  situation: ClinicalSituation;
  patientSummary?: string;
  locale: "ko" | "en";
  imageName?: string;
}) {
  const context = {
    mode: modeLabel(params.mode, params.locale),
    situation: situationLabel(params.situation, params.locale),
    query: params.query || "(없음)",
    patient_summary: params.patientSummary || "(없음)",
    image_name: params.imageName || "(없음)",
  };

  if (params.locale === "ko") {
    return [
      "아래 맥락으로 약물/도구를 식별하고 간호 실행 중심 JSON을 생성해줘.",
      "quick.status 규칙:",
      "- STOP: 즉시 중단/홀드 또는 긴급 보고 조건이 충족되거나 강하게 의심됨",
      "- CHECK: 추가 확인이 필요한 상태",
      "- OK: 현재 정보 기준 즉시 실행 가능",
      "modePriority는 모드별 상단 고정 탭 순서를 3~6개로 제시한다.",
      "topNumbers는 실제 투여/관찰에 바로 쓰는 수치/조건만 간결히 쓴다.",
      "JSON 외 텍스트 금지.",
      "\n[Context JSON]",
      JSON.stringify(context, null, 2),
    ].join("\n");
  }

  return [
    "Generate action-first bedside JSON based on this context.",
    "quick.status rules:",
    "- STOP: immediate hold/stop or urgent escalation is met/suspected",
    "- CHECK: additional verification needed",
    "- OK: executable with current context",
    "modePriority should list 3-6 top tabs by mode.",
    "topNumbers must include practical thresholds/values only.",
    "No text outside JSON.",
    "\n[Context JSON]",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

async function callResponsesApi(args: {
  apiKey: string;
  model: string;
  developerPrompt: string;
  userPrompt: string;
  imageDataUrl?: string;
  signal: AbortSignal;
}): Promise<ResponsesAttempt> {
  const { apiKey, model, developerPrompt, userPrompt, imageDataUrl, signal } = args;

  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
    });
  }

  const payload = {
    model,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: developerPrompt }],
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "nurse_med_tool_action_card",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["item", "quick", "do", "safety", "patientScript20s", "modePriority", "confidenceNote"],
          properties: {
            item: {
              type: "object",
              additionalProperties: false,
              required: ["name", "type", "aliases", "highRiskBadges", "primaryUse", "confidence"],
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["medication", "device", "unknown"] },
                aliases: { type: "array", items: { type: "string" } },
                highRiskBadges: { type: "array", items: { type: "string" } },
                primaryUse: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 100 },
              },
            },
            quick: {
              type: "object",
              additionalProperties: false,
              required: ["status", "topActions", "topNumbers", "topRisks"],
              properties: {
                status: { type: "string", enum: ["OK", "CHECK", "STOP"] },
                topActions: { type: "array", items: { type: "string" } },
                topNumbers: { type: "array", items: { type: "string" } },
                topRisks: { type: "array", items: { type: "string" } },
              },
            },
            do: {
              type: "object",
              additionalProperties: false,
              required: ["steps", "calculatorsNeeded", "compatibilityChecks"],
              properties: {
                steps: { type: "array", items: { type: "string" } },
                calculatorsNeeded: { type: "array", items: { type: "string" } },
                compatibilityChecks: { type: "array", items: { type: "string" } },
              },
            },
            safety: {
              type: "object",
              additionalProperties: false,
              required: ["holdRules", "monitor", "escalateWhen"],
              properties: {
                holdRules: { type: "array", items: { type: "string" } },
                monitor: { type: "array", items: { type: "string" } },
                escalateWhen: { type: "array", items: { type: "string" } },
              },
            },
            patientScript20s: { type: "string" },
            modePriority: { type: "array", items: { type: "string" } },
            confidenceNote: { type: "string" },
          },
        },
      },
      verbosity: "low",
    },
    reasoning: {
      effort: "low",
    },
    max_output_tokens: 1500,
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
      error: `openai_responses_${response.status}_${truncateError(raw || "unknown_error")}`,
    };
  }

  const json = await response.json().catch(() => null);
  const text = extractResponsesText(json);
  if (!text) {
    return { text: null, error: "openai_empty_text" };
  }
  return { text, error: null };
}

export async function analyzeMedSafetyWithOpenAI(params: AnalyzeParams): Promise<{
  result: MedSafetyAnalysisResult;
  model: string;
  rawText: string;
}> {
  const apiKey = normalizeApiKey();
  if (!apiKey) throw new Error("missing_openai_api_key");

  const model = resolveModel();
  const developerPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt({
    query: params.query,
    mode: params.mode,
    situation: params.situation,
    patientSummary: params.patientSummary,
    locale: params.locale,
    imageName: params.imageName,
  });

  const attempt = await callResponsesApi({
    apiKey,
    model,
    developerPrompt,
    userPrompt,
    imageDataUrl: params.imageDataUrl,
    signal: params.signal,
  });

  if (!attempt.text) {
    throw new Error(attempt.error ?? "openai_request_failed");
  }

  const parsed = safeJsonParse<unknown>(attempt.text);
  const result = parseAnalysisResult(parsed);
  if (!result) {
    throw new Error("openai_invalid_json_payload");
  }

  return {
    result,
    model,
    rawText: attempt.text,
  };
}
