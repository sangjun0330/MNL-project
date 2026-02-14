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
  json: unknown | null;
};

function shouldRetryOpenAiError(error: string | null) {
  if (!error) return false;
  const code = String(error).toLowerCase();
  return (
    code.includes("openai_empty_text") ||
    code.includes("_408_") ||
    code.includes("_409_") ||
    code.includes("_425_") ||
    code.includes("_429_") ||
    code.includes("_500_") ||
    code.includes("_502_") ||
    code.includes("_503_") ||
    code.includes("_504_") ||
    code.includes("timeout") ||
    code.includes("network")
  );
}

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
  const model = String(process.env.OPENAI_MED_SAFETY_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini").trim();
  return model || "gpt-4.1-mini";
}

function normalizeApiBaseUrl(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function resolveApiBaseCandidates() {
  const primary = normalizeApiBaseUrl(
    process.env.OPENAI_MED_SAFETY_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  );
  const secondary = normalizeApiBaseUrl(
    process.env.OPENAI_MED_SAFETY_FALLBACK_BASE_URL ?? process.env.OPENAI_FALLBACK_BASE_URL ?? ""
  );
  const candidates = [primary];
  if (secondary && secondary !== primary) candidates.push(secondary);
  return candidates.filter(Boolean);
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
    const outputText = typeof item?.output_text === "string" ? item.output_text : "";
    if (outputText) chunks.push(outputText);
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = typeof part?.text === "string" ? part.text : "";
      if (text) chunks.push(text);
      const altText = typeof part?.output_text === "string" ? part.output_text : "";
      if (altText) chunks.push(altText);
      const args = typeof part?.arguments === "string" ? part.arguments : "";
      if (args) chunks.push(args);
    }
  }
  return chunks.join("").trim();
}

function parseBalancedJsonObject<T>(input: string): T | null {
  if (!input) return null;
  const text = input.trim();
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let idx = start; idx < text.length; idx++) {
      const ch = text[idx];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, idx + 1);
          try {
            return JSON.parse(candidate) as T;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function safeJsonParse<T>(input: string): T | null {
  if (!input) return null;
  try {
    return JSON.parse(input) as T;
  } catch {
    const fencedBlocks = Array.from(input.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
    for (const block of fencedBlocks) {
      const body = String(block?.[1] ?? "").trim();
      if (!body) continue;
      try {
        return JSON.parse(body) as T;
      } catch {
        const balanced = parseBalancedJsonObject<T>(body);
        if (balanced) return balanced;
      }
    }

    const balanced = parseBalancedJsonObject<T>(input);
    if (balanced) return balanced;

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

function collectStructuredCandidates(json: unknown): unknown[] {
  const out: unknown[] = [];
  const push = (value: unknown) => {
    if (value && typeof value === "object") out.push(value);
  };

  if (!json || typeof json !== "object") return out;
  const root = json as Record<string, unknown>;
  push(root.output_parsed);
  push(root.parsed);

  const directText = root.output_text;
  if (typeof directText === "string") {
    const parsed = safeJsonParse<unknown>(directText);
    if (parsed) out.push(parsed);
  }
  if (Array.isArray(directText)) {
    const joined = directText.map((item) => (typeof item === "string" ? item : "")).join("\n");
    const parsed = safeJsonParse<unknown>(joined);
    if (parsed) out.push(parsed);
  }

  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const node = item as Record<string, unknown>;
    push(node.parsed);
    push(node.output_parsed);
    push(node.json);
    const outputText = node.output_text;
    if (typeof outputText === "string") {
      const parsed = safeJsonParse<unknown>(outputText);
      if (parsed) out.push(parsed);
    }
    const content = Array.isArray(node.content) ? node.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const cell = part as Record<string, unknown>;
      push(cell.parsed);
      push(cell.output_parsed);
      push(cell.json);
      const text = typeof cell.text === "string" ? cell.text : "";
      if (text) {
        const parsed = safeJsonParse<unknown>(text);
        if (parsed) out.push(parsed);
      }
      const args = typeof cell.arguments === "string" ? cell.arguments : "";
      if (args) {
        const parsed = safeJsonParse<unknown>(args);
        if (parsed) out.push(parsed);
      }
    }
  }

  return out;
}

function parseAnalysisResultFromResponseJson(json: unknown): MedSafetyAnalysisResult | null {
  const candidates = collectStructuredCandidates(json);
  for (const candidate of candidates) {
    const queue: unknown[] = [candidate];
    if (candidate && typeof candidate === "object") {
      const node = candidate as Record<string, unknown>;
      queue.push(node.result, node.data, node.payload);
    }
    for (const current of queue) {
      const parsed = parseAnalysisResult(current);
      if (parsed) return parsed;
    }
  }
  return null;
}

function fallbackNoteFromOpenAiError(error: string | null, locale: "ko" | "en") {
  const code = String(error ?? "").toLowerCase();
  if (code.includes("unsupported_country_region_territory")) {
    return locale === "ko"
      ? "현재 서버 네트워크 경로에서 OpenAI 호출이 지역 정책으로 차단되어 기본 안전 모드로 전환되었습니다."
      : "OpenAI was blocked by regional policy on the current server network path. Showing safe fallback mode.";
  }
  if (code.includes("openai_responses_403")) {
    return locale === "ko"
      ? "OpenAI 접근 권한 문제로 기본 안전 모드로 전환되었습니다."
      : "OpenAI access was denied. Showing safe fallback mode.";
  }
  if (code.includes("timeout")) {
    return locale === "ko"
      ? "AI 응답 시간이 길어 기본 안전 모드로 전환되었습니다."
      : "AI response timed out. Showing safe fallback mode.";
  }
  if (code.includes("network")) {
    return locale === "ko"
      ? "네트워크 연결 문제로 기본 안전 모드로 전환되었습니다."
      : "Network instability detected. Showing safe fallback mode.";
  }
  return locale === "ko"
    ? "AI 연결이 불안정해 기본 안전 모드로 전환되었습니다."
    : "AI connection was unstable. Showing safe fallback mode.";
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
  const itemRaw = (data.item as Record<string, unknown> | undefined) ?? {};
  const quickRaw = (data.quick as Record<string, unknown> | undefined) ?? {};
  const doRaw = (data.do as Record<string, unknown> | undefined) ?? {};
  const safetyRaw = (data.safety as Record<string, unknown> | undefined) ?? {};

  const itemName = String(itemRaw.name ?? "").trim();
  const primaryUse = String(itemRaw.primaryUse ?? "").trim();
  const patientScript20s = String(data.patientScript20s ?? "").trim();
  const confidenceNote = String(data.confidenceNote ?? "").trim();

  if (!itemName) return null;

  const confidence = Math.round(clamp(Number(itemRaw.confidence ?? 0), 0, 100));

  const parsed: MedSafetyAnalysisResult = {
    item: {
      name: itemName,
      type: coerceItemType(itemRaw.type),
      aliases: toTextArray(itemRaw.aliases, 6),
      highRiskBadges: toTextArray(itemRaw.highRiskBadges, 4),
      primaryUse: primaryUse || "약물/의료도구 안전 확인",
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
    patientScript20s: (patientScript20s || "현재 확인된 정보를 바탕으로 안전 기준을 먼저 점검하고 필요 시 즉시 보고하겠습니다.").slice(0, 220),
    modePriority: toTextArray(data.modePriority, 6),
    confidenceNote,
  };

  if (!parsed.quick.topActions.length) parsed.quick.topActions = ["정보가 제한되어 있어 먼저 처방/환자 상태를 재확인하세요."];
  if (!parsed.quick.topNumbers.length) parsed.quick.topNumbers = ["핵심 수치(혈압·맥박·SpO2·체온)를 최신값으로 확인"];
  if (!parsed.quick.topRisks.length) parsed.quick.topRisks = ["정보 부족 상태에서 즉시 투여/조작 시 위험 가능성"];
  if (!parsed.do.steps.length) parsed.do.steps = ["처방/오더 재확인", "환자 상태 재평가", "기록 후 필요 시 보고"];
  if (!parsed.safety.escalateWhen.length) parsed.safety.escalateWhen = ["기준치 이탈 또는 증상 악화 시 즉시 담당의/당직 보고"];

  if (parsed.quick.status === "OK" && parsed.item.confidence < 65) {
    parsed.quick.status = "CHECK";
    if (!parsed.confidenceNote) {
      parsed.confidenceNote = "식별 확신이 낮아 CHECK로 전환되었습니다. 라벨/농도/라인을 재확인하세요.";
    }
  }

  return parsed;
}

function buildFallbackAnalysisResult(params: AnalyzeParams, note: string): MedSafetyAnalysisResult {
  const rawName = String(params.query || params.imageName || "입력 항목")
    .replace(/\s+/g, " ")
    .trim();
  const name = rawName.slice(0, 40) || "입력 항목";

  const situationActions: Record<ClinicalSituation, string[]> = {
    pre_admin: [
      "지금 투여 전 5R(대상자/약물/용량/시간/경로)부터 재확인",
      "최신 활력징후·핵심 수치·알레르기 확인",
      "기준 이탈 또는 불확실 시 즉시 담당의/당직 확인",
    ],
    during_admin: [
      "현재 투여/주입 속도와 라인 상태 즉시 확인",
      "증상 또는 이상 반응 시 일시 중지 후 상태 재평가",
      "처치 내용과 보고 사항을 즉시 기록",
    ],
    alarm: [
      "알람 종류와 라인 연결 상태를 먼저 확인",
      "환자 상태를 즉시 재평가하고 위험 신호 확인",
      "해결 안 되면 투여 중지 후 담당의/엔지니어 보고",
    ],
    adverse_suspect: [
      "의심 약물/기구 사용을 즉시 중단 또는 홀드",
      "환자 증상·징후 우선 안정화",
      "응급 기준 충족 시 즉시 보고 및 추가 지시 수령",
    ],
    general: [
      "현재 상황에서 가장 먼저 필요한 안전 확인부터 수행",
      "핵심 수치와 처방 조건이 맞는지 재확인",
      "불확실하면 CHECK 기준으로 보고 후 진행",
    ],
  };

  const modePriority: Record<ClinicalMode, string[]> = {
    ward: ["투여 여부 판단", "핵심 수치 확인", "보고/기록"],
    er: ["즉시 위험 배제", "응급 처치 순서", "보고/협진"],
    icu: ["중단/홀드 기준", "모니터링 강화", "라인/호환 확인"],
  };

  return {
    item: {
      name,
      type: "unknown",
      aliases: [],
      highRiskBadges: [],
      primaryUse: "출력 안정화용 기본 안전 안내",
      confidence: 35,
    },
    quick: {
      status: "CHECK",
      topActions: situationActions[params.situation],
      topNumbers: ["혈압·맥박·SpO2·체온 최신값", "최근 검사값/알레르기/라인 상태", "기관 지침 기준 범위 이탈 여부"],
      topRisks: ["정보 불충분 상태에서 즉시 투여/조작", "단위·농도·시간 오인", "라인/호환성 미확인"],
    },
    do: {
      steps: ["처방/오더 재확인", "환자 상태 재평가", "필요 시 중지 후 보고", "지시 반영 후 기록"],
      calculatorsNeeded: ["체중 기반 용량 또는 속도 계산 필요 시 확인"],
      compatibilityChecks: ["라인 연결/혼합 금기/동시 주입 약물 확인"],
    },
    safety: {
      holdRules: ["중요 기준치 이탈, 급격한 증상 악화, 알레르기 의심 시 홀드"],
      monitor: ["활력징후·의식·호흡·주입부 상태를 짧은 간격으로 재평가"],
      escalateWhen: ["호흡곤란/저혈압/의식저하/지속 악화 시 즉시 보고"],
    },
    patientScript20s: "지금은 안전 확인이 우선이라 수치와 상태를 먼저 점검한 뒤, 필요한 경우 즉시 보고하고 안전하게 진행하겠습니다.",
    modePriority: modePriority[params.mode],
    confidenceNote: note.slice(0, 180),
  };
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
      "각 문장은 짧게, 항목은 간결하게 작성한다(장문 금지).",
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
    "Keep each line concise; avoid long prose.",
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
      "모든 배열 항목은 짧은 한 문장으로 작성한다.",
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
    "Keep each array item short and practical.",
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
  apiBaseUrl: string;
  imageDataUrl?: string;
  signal: AbortSignal;
}): Promise<ResponsesAttempt> {
  const { apiKey, model, developerPrompt, userPrompt, apiBaseUrl, imageDataUrl, signal } = args;

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
                name: { type: "string", maxLength: 80 },
                type: { type: "string", enum: ["medication", "device", "unknown"] },
                aliases: { type: "array", maxItems: 4, items: { type: "string", maxLength: 40 } },
                highRiskBadges: { type: "array", maxItems: 3, items: { type: "string", maxLength: 30 } },
                primaryUse: { type: "string", maxLength: 120 },
                confidence: { type: "number", minimum: 0, maximum: 100 },
              },
            },
            quick: {
              type: "object",
              additionalProperties: false,
              required: ["status", "topActions", "topNumbers", "topRisks"],
              properties: {
                status: { type: "string", enum: ["OK", "CHECK", "STOP"] },
                topActions: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 120 } },
                topNumbers: { type: "array", maxItems: 4, items: { type: "string", maxLength: 90 } },
                topRisks: { type: "array", maxItems: 3, items: { type: "string", maxLength: 110 } },
              },
            },
            do: {
              type: "object",
              additionalProperties: false,
              required: ["steps", "calculatorsNeeded", "compatibilityChecks"],
              properties: {
                steps: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", maxLength: 120 } },
                calculatorsNeeded: { type: "array", maxItems: 3, items: { type: "string", maxLength: 90 } },
                compatibilityChecks: { type: "array", maxItems: 3, items: { type: "string", maxLength: 110 } },
              },
            },
            safety: {
              type: "object",
              additionalProperties: false,
              required: ["holdRules", "monitor", "escalateWhen"],
              properties: {
                holdRules: { type: "array", maxItems: 4, items: { type: "string", maxLength: 120 } },
                monitor: { type: "array", maxItems: 4, items: { type: "string", maxLength: 100 } },
                escalateWhen: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 120 } },
              },
            },
            patientScript20s: { type: "string", maxLength: 220 },
            modePriority: { type: "array", maxItems: 5, items: { type: "string", maxLength: 40 } },
            confidenceNote: { type: "string", maxLength: 180 },
          },
        },
      },
      verbosity: "low",
    },
    reasoning: {
      effort: "low",
    },
    max_output_tokens: 900,
    store: false,
  };

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (cause: any) {
    const reason = truncateError(String(cause?.message ?? cause ?? "fetch_failed"));
    return { text: null, error: `openai_network_${reason}`, json: null };
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    return {
      text: null,
      error: `openai_responses_${response.status}_${truncateError(raw || "unknown_error")}`,
      json: null,
    };
  }

  const json = await response.json().catch(() => null);
  const parsedFromJson = parseAnalysisResultFromResponseJson(json);
  const text = extractResponsesText(json);
  if (!text && !parsedFromJson) {
    return { text: null, error: "openai_empty_text", json };
  }
  return { text: text || null, error: null, json };
}

function parseAttemptResult(attempt: ResponsesAttempt): MedSafetyAnalysisResult | null {
  const fromJson = parseAnalysisResultFromResponseJson(attempt.json);
  if (fromJson) return fromJson;
  if (!attempt.text) return null;
  const parsed = safeJsonParse<unknown>(attempt.text);
  return parseAnalysisResult(parsed);
}

function buildRepairDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "ko") {
    return [
      "너는 간호 실행 보조 JSON 정규화기다.",
      "입력 원문에서 정보를 추출해 스키마 JSON으로만 반환한다.",
      "모호하면 보수적으로 채운다: quick.status=CHECK, item.type=unknown.",
      "중요 필드 누락 금지(item/quick/do/safety/patientScript20s/modePriority/confidenceNote).",
      "JSON 외 텍스트를 출력하지 마라.",
    ].join(" ");
  }
  return [
    "You are a JSON normalizer for bedside nursing safety output.",
    "Convert the source text into the required schema JSON only.",
    "If ambiguous, be conservative: quick.status=CHECK and item.type=unknown.",
    "Never omit required fields.",
    "Return JSON only.",
  ].join(" ");
}

function buildRepairUserPrompt(rawText: string, locale: "ko" | "en") {
  const source = rawText.replace(/\u0000/g, "").slice(0, 7000);
  if (locale === "ko") {
    return [
      "아래는 이전 모델 출력 원문이다. 유효한 스키마 JSON으로 정규화해라.",
      "원문:",
      source || "(empty)",
    ].join("\n");
  }
  return [
    "Below is raw model output. Normalize it into valid schema JSON.",
    "Source:",
    source || "(empty)",
  ].join("\n");
}

async function repairAnalysisFromRawText(args: {
  apiKey: string;
  model: string;
  rawText: string;
  locale: "ko" | "en";
  apiBaseCandidates: string[];
  signal: AbortSignal;
}) {
  const { apiKey, model, rawText, locale, apiBaseCandidates, signal } = args;
  const fallbackModel = "gpt-4.1-mini";
  const modelCandidates = model === fallbackModel ? [model] : [model, fallbackModel];
  const developerPrompt = buildRepairDeveloperPrompt(locale);
  const userPrompt = buildRepairUserPrompt(rawText, locale);

  for (const candidateModel of modelCandidates) {
    for (const apiBaseUrl of apiBaseCandidates) {
      const repaired = await callResponsesApi({
        apiKey,
        model: candidateModel,
        developerPrompt,
        userPrompt,
        apiBaseUrl,
        signal,
      });
      const parsed = parseAttemptResult(repaired);
      if (parsed) {
        return {
          parsed,
          model: candidateModel,
          rawText: repaired.text ?? rawText,
        };
      }
    }
  }

  return null;
}

export async function analyzeMedSafetyWithOpenAI(params: AnalyzeParams): Promise<{
  result: MedSafetyAnalysisResult;
  model: string;
  rawText: string;
  fallbackReason: string | null;
}> {
  const apiKey = normalizeApiKey();
  if (!apiKey) throw new Error("missing_openai_api_key");

  const model = resolveModel();
  const apiBaseCandidates = resolveApiBaseCandidates();
  const developerPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt({
    query: params.query,
    mode: params.mode,
    situation: params.situation,
    patientSummary: params.patientSummary,
    locale: params.locale,
    imageName: params.imageName,
  });

  const callLive = async () => {
    let last: ResponsesAttempt = { text: null, error: "openai_request_failed", json: null };
    for (const apiBaseUrl of apiBaseCandidates) {
      const attempt = await callResponsesApi({
        apiKey,
        model,
        developerPrompt,
        userPrompt,
        apiBaseUrl,
        imageDataUrl: params.imageDataUrl,
        signal: params.signal,
      });
      last = attempt;
      const blockedRegion = String(attempt.error ?? "").includes("unsupported_country_region_territory");
      if (blockedRegion) continue;
      return attempt;
    }
    return last;
  };

  const attempt = await callLive();

  let selectedModel = model;
  let parsed = parseAttemptResult(attempt);
  let rawText = attempt.text ?? "";

  if (!parsed && !attempt.text && shouldRetryOpenAiError(attempt.error)) {
    const retry = await callLive();
    parsed = parseAttemptResult(retry);
    if (retry.text) rawText = retry.text;
  }

  if (!parsed && attempt.text) {
    const repaired = await repairAnalysisFromRawText({
      apiKey,
      model,
      rawText: attempt.text,
      locale: params.locale,
      apiBaseCandidates,
      signal: params.signal,
    });
    if (repaired) {
      parsed = repaired.parsed;
      rawText = repaired.rawText;
      selectedModel = repaired.model;
    }
  }

  if (!parsed && !attempt.text) {
    const fallback = buildFallbackAnalysisResult(
      params,
      fallbackNoteFromOpenAiError(attempt.error, params.locale)
    );
    return {
      result: fallback,
      model,
      rawText: "",
      fallbackReason: attempt.error ?? "openai_request_failed",
    };
  }

  if (!parsed) {
    const fallback = buildFallbackAnalysisResult(params, "AI 응답이 불완전해 안전 기본 모드로 복구되었습니다.");
    return {
      result: fallback,
      model,
      rawText,
      fallbackReason: "openai_invalid_json_payload",
    };
  }

  return {
    result: parsed,
    model: selectedModel,
    rawText,
    fallbackReason: null,
  };
}
