export type MedSafetyItemType = "medication" | "device" | "unknown";
export type MedSafetyQuickStatus = "OK" | "CHECK" | "STOP";
export type ClinicalMode = "ward" | "er" | "icu";
export type ClinicalSituation = "general" | "pre_admin" | "during_admin" | "event_response";
export type QueryIntent = "medication" | "device" | "scenario";

export type MedSafetyAnalysisResult = {
  resultKind: "medication" | "device" | "scenario";
  oneLineConclusion: string;
  riskLevel: "low" | "medium" | "high";
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
};

type AnalyzeParams = {
  query: string;
  mode: ClinicalMode;
  situation: ClinicalSituation;
  queryIntent?: QueryIntent;
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

type ExpectedInputClassification = {
  expectedResultKind: "medication" | "device" | "scenario";
  expectedItemType: MedSafetyItemType;
  confidence: "high" | "medium" | "low";
  reason: string;
  medScore: number;
  deviceScore: number;
  scenarioScore: number;
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
    code.includes("aborted") ||
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

function splitModelList(raw: string) {
  return String(raw ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeModels(models: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const model of models) {
    const key = model.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(model);
  }
  return out;
}

function resolveModelCandidates(preferredModel?: string) {
  const configuredPrimary = String(process.env.OPENAI_MED_SAFETY_MODEL ?? process.env.OPENAI_MODEL ?? "").trim();
  const configuredFallbacks = splitModelList(
    process.env.OPENAI_MED_SAFETY_FALLBACK_MODELS ?? process.env.OPENAI_FALLBACK_MODELS ?? ""
  );
  const defaults = ["gpt-4.1-mini", "gpt-4o-mini"];
  const merged = dedupeModels([String(preferredModel ?? "").trim(), configuredPrimary, ...configuredFallbacks, ...defaults]);
  return merged.length ? merged : ["gpt-4.1-mini"];
}

function normalizeApiBaseUrl(raw: string) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const base = normalizeApiBaseUrl(
    process.env.OPENAI_MED_SAFETY_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
  );
  return base || "https://api.openai.com/v1";
}

function resolveMaxOutputTokens() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_MAX_OUTPUT_TOKENS ?? process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 1400);
  if (!Number.isFinite(raw)) return 1400;
  const rounded = Math.round(raw);
  return Math.max(700, Math.min(3000, rounded));
}

function buildMedSafetyJsonSchema() {
  return {
    type: "object",
    required: ["item", "quick", "do", "safety", "patientScript20s", "modePriority", "confidenceNote"],
    additionalProperties: false,
    properties: {
      resultKind: { type: "string", enum: ["medication", "device", "scenario"] },
      oneLineConclusion: { type: "string" },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      item: {
        type: "object",
        required: ["name", "type", "aliases", "highRiskBadges", "primaryUse", "confidence"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["medication", "device", "unknown"] },
          aliases: { type: "array", items: { type: "string" } },
          highRiskBadges: { type: "array", items: { type: "string" } },
          primaryUse: { type: "string" },
          confidence: { type: "number" },
        },
      },
      quick: {
        type: "object",
        required: ["status", "topActions", "topNumbers", "topRisks"],
        additionalProperties: false,
        properties: {
          status: { type: "string", enum: ["OK", "CHECK", "STOP"] },
          topActions: { type: "array", items: { type: "string" } },
          topNumbers: { type: "array", items: { type: "string" } },
          topRisks: { type: "array", items: { type: "string" } },
        },
      },
      do: {
        type: "object",
        required: ["steps", "calculatorsNeeded", "compatibilityChecks"],
        additionalProperties: false,
        properties: {
          steps: { type: "array", items: { type: "string" } },
          calculatorsNeeded: { type: "array", items: { type: "string" } },
          compatibilityChecks: { type: "array", items: { type: "string" } },
        },
      },
      safety: {
        type: "object",
        required: ["holdRules", "monitor", "escalateWhen"],
        additionalProperties: false,
        properties: {
          holdRules: { type: "array", items: { type: "string" } },
          monitor: { type: "array", items: { type: "string" } },
          escalateWhen: { type: "array", items: { type: "string" } },
        },
      },
      institutionalChecks: { type: "array", items: { type: "string" } },
      sbar: {
        type: "object",
        required: ["situation", "background", "assessment", "recommendation"],
        additionalProperties: false,
        properties: {
          situation: { type: "string" },
          background: { type: "string" },
          assessment: { type: "string" },
          recommendation: { type: "string" },
        },
      },
      patientScript20s: { type: "string" },
      modePriority: { type: "array", items: { type: "string" } },
      confidenceNote: { type: "string" },
    },
  };
}

function extractResponsesText(json: any): string {
  // Extract from standard Chat Completions API response
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();

  // Fallback to legacy format if needed
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
    if (!value) return;
    if (typeof value === "object") {
      out.push(value);
      return;
    }
    if (typeof value === "string") {
      const parsed = safeJsonParse<unknown>(value);
      if (!parsed) return;
      if (typeof parsed === "string") {
        const nested = safeJsonParse<unknown>(parsed);
        if (nested) {
          if (typeof nested === "object") out.push(nested);
          return;
        }
      }
      if (typeof parsed === "object") out.push(parsed);
    }
  };

  if (!json || typeof json !== "object") return out;
  const root = json as Record<string, unknown>;

  // Try standard Chat Completions API format first
  const choices = Array.isArray(root.choices) ? root.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const node = choice as Record<string, unknown>;
    const message = (node.message ?? null) as Record<string, unknown> | null;
    if (!message) continue;

    // Parse content from message
    const content = message.content;
    if (typeof content === "string") {
      const parsed = safeJsonParse<unknown>(content);
      if (parsed) out.push(parsed);
    }

    push(message.parsed);
    push(message.output_parsed);
    push(message.json);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const tc of toolCalls) {
      if (!tc || typeof tc !== "object") continue;
      const fn = (tc as Record<string, unknown>).function as Record<string, unknown> | undefined;
      if (!fn) continue;
      push(fn.arguments);
    }
  }

  // Legacy format support
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

function countPatternHits(text: string, patterns: RegExp[]) {
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) score += 1;
  }
  return score;
}

function inferExpectedInputClassification(
  params: Pick<AnalyzeParams, "query" | "patientSummary" | "imageName" | "situation" | "queryIntent">
): ExpectedInputClassification {
  if (params.queryIntent === "medication" || params.queryIntent === "device" || params.queryIntent === "scenario") {
    return {
      expectedResultKind: params.queryIntent,
      expectedItemType: params.queryIntent === "scenario" ? "unknown" : params.queryIntent,
      confidence: "high",
      reason: `forced_by_query_intent:${params.queryIntent}`,
      medScore: params.queryIntent === "medication" ? 99 : 0,
      deviceScore: params.queryIntent === "device" ? 99 : 0,
      scenarioScore: params.queryIntent === "scenario" ? 99 : 0,
    };
  }

  const source = `${params.query ?? ""} ${params.patientSummary ?? ""} ${params.imageName ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  const lower = source.toLowerCase();
  const query = String(params.query ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const medKeywords = [
    /승압제|혈압상승제|vasopressor|norepinephrine|noradrenaline|epinephrine|dopamine|dobutamine|vasopressin/i,
    /약물|투약|약제|용량|희석|항생제|인슐린|헤파린|진통제|진정제|수액|주사/i,
    /\b(?:mg|mcg|g|iu|unit|units|mEq|mmol|ml\/h|mg\/kg|mcg\/kg\/min)\b/i,
    /\b(?:tab|cap|inj|amp|vial|iv|po|im|sc)\b/i,
  ];
  const deviceKeywords = [
    /도구|장비|기구|펌프|주입기|인퓨전|주사기펌프|인공호흡기|카테터|캐뉼라|라인|중심정맥관|cvc|piv/i,
    /iv\s*pump|infusion\s*pump|syringe\s*pump|ventilator|flowmeter|defibrillator|monitor/i,
    /알람|occlusion|폐색|누출|침윤|외유출|infiltration|extravasation/i,
  ];
  const scenarioKeywords = [
    /상황|케이스|증상|악화|이상|알람|경보|발생|의심|대응|조치|보고|응급|재평가|중단|보류|홀드/i,
    /저혈압|저혈당|호흡곤란|의식저하|통증|부종|발적|오한|발열|쇼크/i,
    /how|what to do|when to stop|manage|response|event|adverse/i,
    /어떻게|순서|절차|해줘|알려줘|가능 여부|기준/i,
  ];

  let medScore = countPatternHits(lower, medKeywords);
  let deviceScore = countPatternHits(lower, deviceKeywords);
  let scenarioScore = countPatternHits(lower, scenarioKeywords);

  const shortNounLikeQuery =
    query.length > 0 &&
    query.split(" ").length <= 3 &&
    !/[?？]/.test(query) &&
    !/(어떻게|순서|절차|대응|기준|보고|중단|보류|how|when|what|manage)/i.test(query);

  if (shortNounLikeQuery && (medScore > 0 || deviceScore > 0)) {
    scenarioScore = Math.max(0, scenarioScore - 2);
  }

  if (params.situation === "event_response") scenarioScore += 3;
  if (params.situation === "during_admin") scenarioScore += 1;

  let expectedResultKind: "medication" | "device" | "scenario" = "scenario";
  if (params.situation === "event_response") {
    expectedResultKind = "scenario";
  } else if (medScore === 0 && deviceScore === 0) {
    expectedResultKind = "scenario";
  } else if (scenarioScore >= Math.max(medScore, deviceScore) + 2) {
    expectedResultKind = "scenario";
  } else if (medScore >= deviceScore) {
    expectedResultKind = "medication";
  } else {
    expectedResultKind = "device";
  }

  const expectedItemType: MedSafetyItemType =
    expectedResultKind === "medication" ? "medication" : expectedResultKind === "device" ? "device" : "unknown";

  const ordered = [medScore, deviceScore, scenarioScore].sort((a, b) => b - a);
  const lead = ordered[0] ?? 0;
  const gap = lead - (ordered[1] ?? 0);
  const confidence: "high" | "medium" | "low" = lead >= 3 || gap >= 2 ? "high" : gap >= 1 ? "medium" : "low";
  const reason = `med:${medScore}, device:${deviceScore}, scenario:${scenarioScore}, situation:${params.situation}`;

  return {
    expectedResultKind,
    expectedItemType,
    confidence,
    reason,
    medScore,
    deviceScore,
    scenarioScore,
  };
}

function cleanLine(line: string) {
  return String(line ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function pickFirstSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const parts = normalized.split(/(?<=[.!?]|다\.|요\.)\s+/).filter(Boolean);
  return (parts[0] ?? normalized).slice(0, 220).trim();
}

function pickSentences(text: string, limit: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/(?<=[.!?]|다\.|요\.)\s+/)
    .map((line) => cleanLine(line))
    .filter(Boolean);
  return dedupeLimit(parts, limit);
}

function inferItemTypeFromText(text: string): MedSafetyItemType {
  const n = text.toLowerCase();
  const medHit =
    /(insulin|heparin|vancomycin|meropenem|cef|triazole|정주|투여|약물|용량|mg|ml|항생제|인슐린|헤파린|반코마이신)/i.test(
      n
    );
  const deviceHit = /(pump|ventilator|iv\s*pump|라인|카테터|중심정맥관|호흡기|기구|알람|주입기)/i.test(n);
  if (medHit && !deviceHit) return "medication";
  if (deviceHit && !medHit) return "device";
  return "unknown";
}

function detectQuickStatus(text: string): MedSafetyQuickStatus {
  const raw = text.toLowerCase();
  const explicit = raw.match(/(?:status|상태)\s*[:：]\s*(ok|check|stop|확인 필요|중단|보류)/i)?.[1] ?? "";
  const explicitNorm = explicit.toLowerCase();
  if (explicitNorm.includes("stop") || explicitNorm.includes("중단") || explicitNorm.includes("보류")) return "STOP";
  if (explicitNorm.includes("check") || explicitNorm.includes("확인")) return "CHECK";
  if (explicitNorm.includes("ok")) return "OK";

  if (/\bSTOP\b|즉시\s*(중단|보류)|투여\s*보류|사용\s*중단/i.test(text)) return "STOP";
  if (/\bCHECK\b|확인\s*필요|재확인|판단\s*필요/i.test(text)) return "CHECK";
  if (/\bOK\b|즉시\s*가능|실행\s*가능/i.test(text)) return "OK";
  return "CHECK";
}

function looksLikeJsonBlob(value: string) {
  const text = String(value ?? "")
    .replace(/^(?:[-*•·]|\d+[).])\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!text) return false;
  if (/^[\[\]{}]+,?$/.test(text)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]{2,}"?\s*:\s*/.test(text)) return true;
  if (/^"[^"]{3,}"\s*:\s*/.test(text)) return true;
  if (/^[{\[]/.test(text)) return true;
  if (/(?:^|["\s])(?:resultKind|riskLevel|oneLineConclusion|item|quick|topActions|topNumbers|topRisks|do|steps|calculatorsNeeded|compatibilityChecks|safety|holdRules|monitor|escalateWhen|patientScript20s|modePriority|confidenceNote|status|sbar|institutionalChecks)\s*[:"]/i.test(text)) return true;
  if (/:\s*(?:\{|\[|"[^"]*"|true|false|null|-?\d+(?:\.\d+)?)(?:\s*,)?$/.test(text) && /["{}_:\[\],]/.test(text)) return true;
  if (/^(?:high|medium|low|ok|check|stop|medication|device|scenario)"?,?$/i.test(text)) return true;
  const punctuation = (text.match(/[{}[\]":,]/g) ?? []).length;
  return punctuation >= Math.max(12, Math.floor(text.length * 0.12));
}

function sanitizeModelLine(value: string, maxLength = 180) {
  const collapsed = cleanLine(value)
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:json\s*:)?\s*/i, "")
    .trim();
  if (!collapsed) return "";
  if (looksLikeJsonBlob(collapsed)) return "";
  if (/^[A-Za-z_][A-Za-z0-9_]*"?\s*,?$/.test(collapsed)) return "";
  if (/^".*",?$/.test(collapsed) && !/[가-힣A-Za-z0-9]{4,}\s+[가-힣A-Za-z0-9]{2,}/.test(collapsed)) return "";
  const clipped = collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
  return clipped.replace(/^\d+[).]\s*/, "").trim();
}

function dedupeLimit(items: string[], limit: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const clean = sanitizeModelLine(
      cleanLine(raw)
        .replace(/^(?:[-*•·]|\d+[).])\s*/, "")
        .trim(),
      180
    );
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function parseAnalysisResultFromNarrativeText(rawText: string, params: AnalyzeParams): MedSafetyAnalysisResult | null {
  const text = String(rawText ?? "").replace(/\u0000/g, "").trim();
  if (!text) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .filter((line) => !looksLikeJsonBlob(line));
  if (!lines.length) return null;

  const sections: Record<
    "actions" | "numbers" | "risks" | "steps" | "calc" | "compat" | "hold" | "monitor" | "escalate" | "script",
    string[]
  > = {
    actions: [],
    numbers: [],
    risks: [],
    steps: [],
    calc: [],
    compat: [],
    hold: [],
    monitor: [],
    escalate: [],
    script: [],
  };

  const headingMap: Array<{ key: keyof typeof sections; pattern: RegExp }> = [
    { key: "actions", pattern: /(30초|핵심\s*행동|top\s*actions?|first\s*actions?)/i },
    { key: "numbers", pattern: /(핵심\s*수치|수치\/조건|numbers?|threshold)/i },
    { key: "risks", pattern: /(핵심\s*위험|risk|주의\s*위험)/i },
    { key: "steps", pattern: /(실행\s*단계|steps?|procedure|실행)/i },
    { key: "calc", pattern: /(계산|dose\s*calc|calculators?)/i },
    { key: "compat", pattern: /(호환|라인\s*점검|compatibility|line\s*check)/i },
    { key: "hold", pattern: /(홀드|중단\s*기준|hold\s*rules?)/i },
    { key: "monitor", pattern: /(모니터링|monitor)/i },
    { key: "escalate", pattern: /(즉시\s*보고|보고\s*기준|escalate|report)/i },
    { key: "script", pattern: /(환자\s*설명|스크립트|patient\s*script)/i },
  ];

  const pushAuto = (line: string) => {
    const lower = line.toLowerCase();
    if (/(혈압|맥박|spo2|체온|mg\/dl|mmhg|수치|검사)/i.test(lower)) {
      sections.numbers.push(line);
      return;
    }
    if (/(위험|부작용|오류|혼동|금기|risk|adverse)/i.test(lower)) {
      sections.risks.push(line);
      return;
    }
    if (/(중단|보류|hold|stop)/i.test(lower)) {
      sections.hold.push(line);
      return;
    }
    if (/(모니터|관찰|v\/s|vital|재평가)/i.test(lower)) {
      sections.monitor.push(line);
      return;
    }
    if (/(보고|의사|당직|콜|escalate|report)/i.test(lower)) {
      sections.escalate.push(line);
      return;
    }
    sections.actions.push(line);
  };

  let currentSection: keyof typeof sections | null = null;

  for (const line of lines) {
    let switched = false;
    for (const map of headingMap) {
      if (map.pattern.test(line)) {
        currentSection = map.key;
        const inline = line.split(/[:：]/).slice(1).join(":").trim();
        if (inline) sections[currentSection].push(inline);
        switched = true;
        break;
      }
    }
    if (switched) continue;

    const bullet = line.match(/^(?:[-*•·]|\d+[).])\s*(.+)$/)?.[1]?.trim();
    const content = bullet || line;
    if (!content) continue;

    if (currentSection) {
      sections[currentSection].push(content);
      continue;
    }
    pushAuto(content);
  }

  const queryName = sanitizeModelLine(cleanLine(params.query), 40) || "입력 항목";
  const itemNameByLabel =
    text.match(/(?:약물명|도구명|item|name)\s*[:：]\s*([^\n\r]+)/i)?.[1]?.trim() ??
    text.match(/^\s*([A-Za-z][A-Za-z0-9\s\-]{2,40})\s*$/m)?.[1]?.trim() ??
    "";
  const itemName = (sanitizeModelLine(itemNameByLabel, 40) || queryName).slice(0, 40);

  const actions = dedupeLimit(sections.actions, 3);
  const numbers = dedupeLimit(sections.numbers, 4);
  const risks = dedupeLimit(sections.risks, 3);
  const steps = dedupeLimit([...sections.steps, ...actions], 5);
  const calc = dedupeLimit(sections.calc, 3);
  const compat = dedupeLimit(sections.compat, 3);
  const hold = dedupeLimit(sections.hold, 4);
  const monitor = dedupeLimit(sections.monitor, 4);
  const escalate = dedupeLimit(sections.escalate, 4);
  const quickStatus = detectQuickStatus(text);
  if (!actions.length) {
    actions.push(...pickSentences(text, 3));
  }
  if (!numbers.length) {
    const numericHints = Array.from(
      text.matchAll(/\d+(?:\.\d+)?\s?(?:mg\/dl|mmhg|bpm|%|℃|mmol\/l|ml\/h|mg|ml|mcg\/kg\/min)/gi)
    )
      .map((hit) => cleanLine(hit[0]))
      .filter(Boolean);
    if (numericHints.length) {
      numbers.push(...dedupeLimit(numericHints.map((value) => `${value} 기준 재확인`), 4));
    }
  }
  if (!risks.length) {
    if (quickStatus === "STOP") {
      risks.push("즉시 중단 또는 홀드가 필요한 고위험 상황 가능성");
    } else if (quickStatus === "CHECK") {
      risks.push("핵심 조건 미확인 상태에서 바로 진행 시 위험");
    } else {
      risks.push("정보가 제한된 상태에서 과신하고 진행하면 오류 가능");
    }
  }
  if (!steps.length) {
    steps.push(...actions.slice(0, 3));
  }

  const scriptBase = dedupeLimit(sections.script, 2).join(" ");
  const script = (scriptBase || pickFirstSentence(text) || "먼저 안전 기준을 확인하고 필요 시 즉시 보고하겠습니다.")
    .slice(0, 220)
    .trim();

  const inferredType = inferItemTypeFromText(`${itemName} ${text}`);
  const confidenceBase = quickStatus === "OK" ? 74 : quickStatus === "STOP" ? 70 : 62;
  const inferredKind: "medication" | "device" | "scenario" =
    inferredType === "medication" ? "medication" : inferredType === "device" ? "device" : "scenario";

  return {
    resultKind: inferredKind,
    oneLineConclusion: defaultOneLineConclusion(quickStatus, params.locale),
    riskLevel: coerceRiskLevel(null, quickStatus),
    item: {
      name: itemName,
      type: inferredType,
      aliases: [],
      highRiskBadges: quickStatus === "STOP" ? ["즉시 확인"] : quickStatus === "CHECK" ? ["확인 필요"] : [],
      primaryUse: "AI 비정형 응답을 자동 정규화한 결과",
      confidence: confidenceBase,
    },
    quick: {
      status: quickStatus,
      topActions: actions.length ? actions : ["핵심 안전 항목을 먼저 재확인하세요."],
      topNumbers: numbers.length ? numbers : ["핵심 수치(혈압·맥박·SpO2·체온)를 최신값으로 확인"],
      topRisks: risks.length ? risks : ["정보 불완전 상태에서 즉시 투여/조작 시 위험"],
    },
    do: {
      steps: steps.length ? steps : ["처방/오더 재확인", "환자 상태 재평가", "기록 후 필요 시 보고"],
      calculatorsNeeded: calc,
      compatibilityChecks: compat.length ? compat : ["라인 연결/혼합 금기/동시 주입 약물 확인"],
    },
    safety: {
      holdRules: hold.length ? hold : ["중요 기준치 이탈, 급격한 증상 악화 시 홀드"],
      monitor: monitor.length ? monitor : ["활력징후·의식·호흡·주입부 상태를 짧은 간격으로 재평가"],
      escalateWhen: escalate.length ? escalate : ["호흡곤란/저혈압/의식저하/지속 악화 시 즉시 보고"],
    },
    institutionalChecks: ["희석/속도/교체주기/알람 기준은 기관 프로토콜·장비 IFU 확인"],
    sbar: {
      situation: `${itemName} 관련 안전 이슈 확인 필요`,
      background: "현재 투여/장비 상황과 최근 변화를 요약",
      assessment: "활력·의식·주입부·알람 상태 재평가",
      recommendation: "즉시 조치 후 기준 이탈 시 담당의/당직 보고",
    },
    patientScript20s: script,
    modePriority: [],
    confidenceNote: "비정형 AI 응답을 자동 정규화하여 구조화했습니다. 핵심 수치/처방은 다시 확인해 주세요.",
  };
}

function fallbackNoteFromOpenAiError(error: string | null, locale: "ko" | "en") {
  const code = String(error ?? "").toLowerCase();
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
  if (code.includes("aborted")) {
    return locale === "ko"
      ? "요청 제한 시간 내 응답을 받지 못해 기본 안전 모드로 전환되었습니다."
      : "Request exceeded allowed time. Showing safe fallback mode.";
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
    const clean = sanitizeModelLine(String(item ?? "").replace(/\s+/g, " ").trim());
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

function coerceResultKind(value: unknown, itemType: MedSafetyItemType): "medication" | "device" | "scenario" {
  if (value === "medication" || value === "device" || value === "scenario") return value;
  if (itemType === "medication") return "medication";
  if (itemType === "device") return "device";
  return "scenario";
}

function coerceRiskLevel(value: unknown, status: MedSafetyQuickStatus): "low" | "medium" | "high" {
  if (value === "low" || value === "medium" || value === "high") return value;
  if (status === "STOP") return "high";
  if (status === "CHECK") return "medium";
  return "low";
}

function defaultOneLineConclusion(status: MedSafetyQuickStatus, locale: "ko" | "en" = "ko") {
  if (locale === "en") {
    if (status === "STOP") return "STOP: Hold now and escalate after immediate reassessment.";
    if (status === "CHECK") return "HOLD/CHECK: Verify key safety points before proceeding.";
    return "GO: Executable now with ongoing monitoring.";
  }
  if (status === "STOP") return "STOP: 즉시 중단/홀드 후 환자 상태 재평가 및 보고.";
  if (status === "CHECK") return "HOLD/CHECK: 핵심 안전 확인 후 진행 여부를 판단.";
  return "GO: 현재 정보 기준 시행 가능, 모니터링 지속.";
}

function pickSbarValue(raw: unknown, fallback: string, maxLength: number) {
  const clean = sanitizeModelLine(String(raw ?? "").trim(), maxLength);
  return clean || fallback;
}

function parseAnalysisResult(raw: unknown): MedSafetyAnalysisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const itemRaw = (data.item as Record<string, unknown> | undefined) ?? {};
  const quickRaw = (data.quick as Record<string, unknown> | undefined) ?? {};
  const doRaw = (data.do as Record<string, unknown> | undefined) ?? {};
  const safetyRaw = (data.safety as Record<string, unknown> | undefined) ?? {};

  const itemName = sanitizeModelLine(String(itemRaw.name ?? "").trim(), 72);
  const primaryUse = sanitizeModelLine(String(itemRaw.primaryUse ?? "").trim(), 160);
  const patientScript20s = sanitizeModelLine(String(data.patientScript20s ?? "").trim(), 220);
  const confidenceNote = sanitizeModelLine(String(data.confidenceNote ?? "").trim(), 180);
  const oneLineConclusionInput = sanitizeModelLine(String(data.oneLineConclusion ?? "").trim(), 180);

  if (!itemName) return null;

  const confidence = Math.round(clamp(Number(itemRaw.confidence ?? 0), 0, 100));
  const itemType = coerceItemType(itemRaw.type);
  const quickStatus = coerceQuickStatus(quickRaw.status);
  const resultKind = coerceResultKind(data.resultKind, itemType);
  const riskLevel = coerceRiskLevel(data.riskLevel, quickStatus);

  const sbarRaw = (data.sbar as Record<string, unknown> | undefined) ?? {};
  const sbar = {
    situation: pickSbarValue(sbarRaw.situation, "현재 문제와 위험 신호를 한 줄로 전달", 160),
    background: pickSbarValue(sbarRaw.background, "투여 약물/도구와 최근 변화 요약", 160),
    assessment: pickSbarValue(sbarRaw.assessment, "활력·의식·주입부·알람 상태 평가", 160),
    recommendation: pickSbarValue(sbarRaw.recommendation, "실시한 조치와 추가 요청사항 전달", 160),
  };
  const institutionalChecks = toTextArray(data.institutionalChecks, 4);

  const parsed: MedSafetyAnalysisResult = {
    resultKind,
    oneLineConclusion: oneLineConclusionInput || defaultOneLineConclusion(quickStatus, "ko"),
    riskLevel,
    item: {
      name: itemName,
      type: itemType,
      aliases: toTextArray(itemRaw.aliases, 6),
      highRiskBadges: toTextArray(itemRaw.highRiskBadges, 4),
      primaryUse: primaryUse || "약물/의료도구 안전 확인",
      confidence,
    },
    quick: {
      status: quickStatus,
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
    institutionalChecks,
    sbar,
    patientScript20s: (patientScript20s || "현재 확인된 정보를 바탕으로 안전 기준을 먼저 점검하고 필요 시 즉시 보고하겠습니다.").slice(0, 220),
    modePriority: toTextArray(data.modePriority, 6),
    confidenceNote,
  };

  if (!parsed.quick.topActions.length) parsed.quick.topActions = ["정보가 제한되어 있어 먼저 처방/환자 상태를 재확인하세요."];
  if (!parsed.quick.topNumbers.length) parsed.quick.topNumbers = ["핵심 수치(혈압·맥박·SpO2·체온)를 최신값으로 확인"];
  if (!parsed.quick.topRisks.length) parsed.quick.topRisks = ["정보 부족 상태에서 즉시 투여/조작 시 위험 가능성"];
  if (!parsed.do.steps.length) parsed.do.steps = ["처방/오더 재확인", "환자 상태 재평가", "기록 후 필요 시 보고"];
  if (!parsed.safety.escalateWhen.length) parsed.safety.escalateWhen = ["기준치 이탈 또는 증상 악화 시 즉시 담당의/당직 보고"];
  if (!parsed.institutionalChecks.length) {
    parsed.institutionalChecks = [
      "희석·주입속도·교체주기는 기관 프로토콜과 장비 IFU를 우선 확인",
      "라인 호환성·필터·전용라인 필요 여부는 병동 표준에 맞춰 확인",
    ];
  }

  if (parsed.quick.status === "OK" && parsed.item.confidence < 65) {
    parsed.quick.status = "CHECK";
    parsed.riskLevel = "medium";
    parsed.oneLineConclusion = defaultOneLineConclusion("CHECK", "ko");
    if (!parsed.confidenceNote) {
      parsed.confidenceNote = "식별 확신이 낮아 CHECK로 전환되었습니다. 라벨/농도/라인을 재확인하세요.";
    }
  }

  return parsed;
}

function alignAnalysisResultToInputKind(
  input: MedSafetyAnalysisResult,
  expected: ExpectedInputClassification,
  params: Pick<AnalyzeParams, "query" | "situation" | "locale">
): MedSafetyAnalysisResult {
  const result: MedSafetyAnalysisResult = {
    ...input,
    item: { ...input.item },
    quick: {
      ...input.quick,
      topActions: [...input.quick.topActions],
      topNumbers: [...input.quick.topNumbers],
      topRisks: [...input.quick.topRisks],
    },
    do: {
      ...input.do,
      steps: [...input.do.steps],
      calculatorsNeeded: [...input.do.calculatorsNeeded],
      compatibilityChecks: [...input.do.compatibilityChecks],
    },
    safety: {
      ...input.safety,
      holdRules: [...input.safety.holdRules],
      monitor: [...input.safety.monitor],
      escalateWhen: [...input.safety.escalateWhen],
    },
    institutionalChecks: [...input.institutionalChecks],
    sbar: { ...input.sbar },
    modePriority: [...input.modePriority],
  };

  const shouldForceKind = expected.confidence === "high" && result.resultKind !== expected.expectedResultKind;

  if (shouldForceKind) {
    result.resultKind = expected.expectedResultKind;
    if (result.item.type === "unknown") {
      result.item.type = expected.expectedItemType;
    }
    result.confidenceNote = result.confidenceNote
      ? `${result.confidenceNote} 입력 분류 규칙에 따라 ${expected.expectedResultKind} 형식으로 보정되었습니다.`
      : `입력 분류 규칙에 따라 ${expected.expectedResultKind} 형식으로 보정되었습니다.`;
  }

  if (result.resultKind !== "scenario" && result.item.type === "unknown") {
    result.item.type = result.resultKind;
  }

  if (params.situation === "general" && result.resultKind !== "scenario") {
    const genericPrimaryUse = /(출력 안정화용|자동 정규화|약물\/의료도구 안전 확인|입력 항목)/i.test(result.item.primaryUse);
    if (genericPrimaryUse || !result.item.primaryUse) {
      result.item.primaryUse =
        result.resultKind === "medication"
          ? `${result.item.name}의 목적·핵심 작용·주요 주의점을 빠르게 확인`
          : `${result.item.name}의 용도·핵심 기능·알람/오작동 대응 포인트를 빠르게 확인`;
    }

    if (result.resultKind === "medication" && /^((GO|STOP|HOLD\/CHECK):|GO:|STOP:|HOLD\/CHECK:)/.test(result.oneLineConclusion)) {
      result.oneLineConclusion = `${result.item.name}은(는) 환자 상태에 따라 용량·속도·라인 호환을 먼저 확인해야 하는 약물입니다.`;
    }
    if (result.resultKind === "device" && /^((GO|STOP|HOLD\/CHECK):|GO:|STOP:|HOLD\/CHECK:)/.test(result.oneLineConclusion)) {
      result.oneLineConclusion = `${result.item.name}은(는) 사용 목적과 세팅, 알람 대응 순서를 먼저 확인해야 하는 의료도구입니다.`;
    }
  }

  if (!result.modePriority.length) {
    if (result.resultKind === "medication") {
      result.modePriority = params.locale === "ko" ? ["개요", "투여", "모니터링", "주의/보고"] : ["Overview", "Admin", "Monitor", "Escalate"];
    } else if (result.resultKind === "device") {
      result.modePriority = params.locale === "ko" ? ["개요", "세팅", "알람/문제", "유지관리"] : ["Overview", "Setup", "Alarms", "Maintenance"];
    } else {
      result.modePriority = params.locale === "ko" ? ["즉시행동", "체크", "처치", "보고"] : ["Immediate", "Checks", "Actions", "SBAR"];
    }
  }

  return result;
}

function buildFallbackAnalysisResult(
  params: AnalyzeParams,
  note: string,
  expected: ExpectedInputClassification
): MedSafetyAnalysisResult {
  const rawName = String(params.query || params.imageName || "입력 항목")
    .replace(/\s+/g, " ")
    .trim();
  const name = rawName.slice(0, 40) || "입력 항목";

  const situationActions: Record<ClinicalSituation, string[]> = {
    general: [
      "질문한 약물/도구의 목적과 현재 사용 맥락을 먼저 확인",
      "즉시 확인이 필요한 안전 포인트(알레르기·라인·단위/농도)를 우선 점검",
      "불명확 항목은 CHECK로 두고 병동 지침/처방 기준으로 재확인",
    ],
    pre_admin: [
      "투여 전 5R(환자·약물·용량·시간·경로)과 환자식별 2개를 먼저 재확인",
      "알레르기·금기·중복투여 가능성과 최신 활력징후/검사값을 확인",
      "확신이 낮거나 기준 이탈 시 투여 보류 후 즉시 보고",
    ],
    during_admin: [
      "현재 주입속도·누적량·펌프 설정과 라인 개방성/주입부 상태를 즉시 확인",
      "환자 증상 변화가 있으면 일시중지 후 ABC/V/S 재평가를 우선 수행",
      "중재 후 재개 조건과 보고 시점을 명확히 기록",
    ],
    event_response: [
      "알람/이상 징후 발생 시 즉시 STOP/HOLD 여부를 먼저 판단하고 환자 상태를 우선 확인",
      "라인 폐색·침윤·누출·장비 설정 오류를 순서대로 점검",
      "해결 불가, 상태 악화, 고위험 약물 관련이면 즉시 보고 및 추가 지시를 받음",
    ],
  };
  const fallbackStatus: MedSafetyQuickStatus = params.situation === "event_response" ? "STOP" : "CHECK";
  const fallbackKind: "medication" | "device" | "scenario" =
    params.situation === "general" ? expected.expectedResultKind : params.situation === "event_response" ? "scenario" : expected.expectedResultKind;

  const generalActionsByKind: Record<"medication" | "device" | "scenario", string[]> = {
    medication: [
      "이 약물이 무엇이며 어떤 환자 상태에서 사용하는지 먼저 확인",
      "용량·단위·투여 경로와 희석/속도를 처방·라벨로 대조 확인",
      "금기·알레르기·라인 호환성 미확인 시 CHECK 후 재확인",
    ],
    device: [
      "도구의 사용 목적과 현재 필요한 모드를 먼저 확인",
      "세팅값·연결 상태·알람 기준을 기관 기준과 대조 확인",
      "오작동·알람 반복 시 STOP/HOLD 기준에 따라 즉시 대응",
    ],
    scenario: [
      "현재 상황의 위험 신호와 우선 조치를 먼저 확인",
      "핵심 수치·라인·증상 변화를 짧은 간격으로 재평가",
      "기준 이탈 또는 해결 실패 시 즉시 보고",
    ],
  };

  const modePriority: Record<ClinicalMode, string[]> = {
    ward: ["투여 여부 판단", "핵심 수치 확인", "보고/기록"],
    er: ["즉시 위험 배제", "응급 처치 순서", "보고/협진"],
    icu: ["중단/홀드 기준", "모니터링 강화", "라인/호환 확인"],
  };

  return {
    resultKind: fallbackKind,
    oneLineConclusion: defaultOneLineConclusion(fallbackStatus, params.locale),
    riskLevel: coerceRiskLevel(null, fallbackStatus),
    item: {
      name,
      type: fallbackKind === "medication" ? "medication" : fallbackKind === "device" ? "device" : "unknown",
      aliases: [],
      highRiskBadges: [],
      primaryUse:
        fallbackKind === "medication"
          ? "약물의 역할·투여 확인·주의사항을 빠르게 정리"
          : fallbackKind === "device"
            ? "의료도구의 기능·세팅·알람 대응을 빠르게 정리"
            : "출력 안정화용 기본 안전 안내",
      confidence: 35,
    },
    quick: {
      status: fallbackStatus,
      topActions: params.situation === "general" ? generalActionsByKind[fallbackKind] : situationActions[params.situation],
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
    institutionalChecks: [
      "희석·속도·교체주기·알람 기준은 기관 프로토콜과 장비 IFU 확인",
      "High-alert 약물/기구는 기관 정책에 따른 더블체크 시행",
    ],
    sbar: {
      situation: "안전 우선 확인이 필요한 상황",
      background: "관련 투여/장비 사용 정보와 최근 변화 정리",
      assessment: "활력·의식·알람·주입부 상태를 재평가",
      recommendation: "즉시 조치 후 기준 이탈 시 담당의/당직 보고",
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
    if (situation === "general") return "General search";
    if (situation === "pre_admin") return "Pre-administration safety check";
    if (situation === "during_admin") return "During administration monitoring";
    return "Alarm/adverse event response";
  }
  if (situation === "general") return "일반 검색";
  if (situation === "pre_admin") return "투여 전 확인";
  if (situation === "during_admin") return "투여 중 모니터";
  return "이상/알람 대응";
}

function buildDeveloperPrompt(locale: "ko" | "en") {
  if (locale === "ko") {
    return [
      "너는 임상 간호사 개인용 임상 의사결정 보조 AI다.",
      "사용자는 바쁜 현장에서 즉시 실행 가능한 답을 원한다.",
      "답은 처방/진단을 대체하지 않으며, 기관 프로토콜·의사 지시·제조사 IFU가 최종 기준이다.",
      "근거 없는 수치/용량/속도/기준은 생성하지 않는다.",
      "불확실하면 단정하지 말고 확인 포인트를 제시한다.",
      "실무적으로 짧고 명확한 문장으로 작성한다.",
      "필드 값에는 JSON 키/중괄호/따옴표 조각을 넣지 않는다.",
      "반드시 유효한 JSON만 반환한다.",
    ].join("\n");
  }
  return [
    "You are a bedside nursing clinical decision support assistant.",
    "Provide immediate, safety-first, action-ready guidance aligned with trusted references and local protocols.",
    "Do not fabricate unsupported numbers or claims.",
    "Mark verification points when uncertain.",
    "Keep output concise and practical.",
    "Return valid JSON only.",
  ].join("\n");
}

function departmentFromMode(mode: ClinicalMode) {
  if (mode === "icu") return "ICU";
  if (mode === "er") return "ER";
  if (mode === "ward") return "WARD";
  return "unknown";
}

function timepointFromSituation(situation: ClinicalSituation) {
  if (situation === "pre_admin") return "pre";
  if (situation === "during_admin") return "during";
  if (situation === "event_response") return "alarm";
  return "unknown";
}


function buildUserPrompt(params: {
  query: string;
  mode: ClinicalMode;
  situation: ClinicalSituation;
  patientSummary?: string;
  locale: "ko" | "en";
  imageName?: string;
  expected: ExpectedInputClassification;
}) {
  const intent: QueryIntent = params.expected.expectedResultKind;
  const context = {
    mode: modeLabel(params.mode, params.locale),
    situation: situationLabel(params.situation, params.locale),
    department: departmentFromMode(params.mode),
    timepoint: timepointFromSituation(params.situation),
    category: params.expected.expectedResultKind,
    query: params.query || "(없음)",
    patient_summary: params.patientSummary || "(없음)",
    image_name: params.imageName || "(없음)",
    expected_result_kind: params.expected.expectedResultKind,
    expected_item_type: params.expected.expectedItemType,
    classification_confidence: params.expected.confidence,
    classification_reason: params.expected.reason,
    query_intent_selected: params.expected.confidence === "high" && params.expected.reason.startsWith("forced_by_query_intent")
      ? params.expected.expectedResultKind
      : "(auto)",
  };

  if (params.locale === "ko") {
    if (intent === "medication") {
      return [
        "현재 입력은 약물명 중심 조회다. 질문형 설명을 만들지 말고, 간호 실무에서 바로 필요한 약물 핵심을 채워라.",
        "약물 결과에는 아래 내용을 우선 포함한다:",
        "- 이 약이 무엇인지(분류/역할 1줄)",
        "- 언제 쓰는지(적응증 핵심)",
        "- 어떻게 주는지(경로/IV push 여부/희석·속도는 원칙+기관확인)",
        "- 반드시 확인할 금기/주의 Top 3",
        "- 반드시 모니터할 것 Top 3",
        "- 위험 신호/즉시 대응",
        "- 라인/호환/상호작용(치명적인 것 중심)",
        "- 환자 교육 포인트(필요 시)",
        "",
        "중요 안전 원칙:",
        "- 처방/진단/최종 용량결정은 하지 않는다.",
        "- 기관마다 다른 희석·속도·필터·교체주기는 단정하지 말고 '기관 프로토콜/약제부/IFU 확인'을 명시한다.",
        "- 단위(mg/mcg/mEq/IU), 농도, 속도, LASA, Y-site 혼합 오류를 우선 경고한다.",
        "",
        "JSON 필드 매핑 지침:",
        "- item.name: 약물명",
        "- item.primaryUse: 약물 정의+적응증 핵심",
        "- oneLineConclusion: 간호 관점 즉시 결론(Go/Hold/Stop 성격 포함)",
        "- quick.topActions: 투여 핵심 절차/세팅",
        "- quick.topNumbers: 투여 전 확인할 핵심 수치/데이터",
        "- quick.topRisks + safety.holdRules + safety.escalateWhen: 위험 신호/중단/호출 기준",
        "- do.compatibilityChecks: 라인·호환·상호작용",
        "- safety.monitor: 모니터링 항목과 재평가 타이밍",
        "- patientScript20s: 환자 교육 20초 설명",
        "- sbar: 바로 읽을 수 있는 보고 문장",
        "",
        "질문:",
        params.query || "(없음)",
        "",
        "추가 맥락:",
        JSON.stringify(context, null, 2),
        "",
        "반드시 스키마 JSON만 반환한다. JSON 키/중괄호 조각이나 원문 그대로 붙여넣기 금지.",
      ].join("\n");
    }

    if (intent === "device") {
      return [
        "현재 입력은 의료기구명 중심 조회다. 질문형 해설보다 세팅·정상기준·알람대응을 실무 중심으로 채워라.",
        "의료기구 결과에는 아래 내용을 우선 포함한다:",
        "- 기구가 무엇인지/언제 쓰는지",
        "- 준비물/셋업/사용 절차(현장 단계 중심)",
        "- 정상 작동 기준(정상 상태가 무엇인지)",
        "- 알람/트러블슈팅: 의미→먼저 볼 것→해결→안되면 보고",
        "- 합병증/Stop rules",
        "- 유지관리(기관 확인 필요한 부분 표시)",
        "",
        "중요 안전 원칙:",
        "- 처방/진단을 대체하지 않는다.",
        "- 제품별 세팅/교체주기/알람 기준은 기관 프로토콜·제조사 IFU 확인을 명시한다.",
        "- 알람 무시, 연결 오류, 라인 꺾임/누출/감염 징후 누락을 우선 경고한다.",
        "",
        "JSON 필드 매핑 지침:",
        "- item.name: 기구명",
        "- item.primaryUse: 기구 정의+사용 목적",
        "- oneLineConclusion: 지금 핵심 결론(사용 가능/확인/중단 성격)",
        "- quick.topActions: Setup→Start→Check 핵심 단계",
        "- quick.topNumbers: 정상 작동 기준/확인 수치",
        "- do.steps: 준비물·셋업·사용 절차",
        "- do.compatibilityChecks: 알람/트러블슈팅 핵심 체크",
        "- quick.topRisks + safety.holdRules + safety.escalateWhen: 합병증/중단·호출 기준",
        "- safety.monitor + institutionalChecks: 유지관리/기관확인 포인트",
        "- patientScript20s: 환자 협조·주의 안내",
        "- sbar: 바로 보고 가능한 문장",
        "",
        "질문:",
        params.query || "(없음)",
        "",
        "추가 맥락:",
        JSON.stringify(context, null, 2),
        "",
        "반드시 스키마 JSON만 반환한다. JSON 키/중괄호 조각이나 원문 그대로 붙여넣기 금지.",
      ].join("\n");
    }

    return [
      "현재 입력은 상황 질문이다.",
      "고정 템플릿(예: Quick/0-60/1-5 같은 섹션)을 강제하지 말고, 사용자가 실제로 물은 질문에 직접 답하라.",
      "질문 맥락에 맞는 우선순위 행동, 꼭 확인할 관찰/수치, 중단·호출 기준, 실수 방지 포인트를 간호사 관점으로 제시한다.",
      "정보가 부족하면 되묻기보다 가장 안전한 기본 행동과 추가 확인 최소 정보(최대 5개)만 제시한다.",
      "응급 가능성이 보이면 즉시 중단/ABC/산소/모니터 강화/즉시 호출을 최우선으로 둔다.",
      "처방·진단·최종 용량결정은 하지 않는다. 기관별 차이가 큰 항목은 기관 프로토콜/IFU 확인을 명시한다.",
      "",
      "JSON 필드 매핑 지침:",
      "- item.name: 상황 핵심 대상(약물/기구/문제명)",
      "- item.primaryUse + oneLineConclusion: 질문에 대한 핵심 결론",
      "- quick.topActions: 지금 바로 할 행동 3~5개",
      "- quick.topNumbers: 바로 확인할 관찰/수치 3~5개",
      "- do.steps: 질문에 대한 실행 순서",
      "- do.calculatorsNeeded: 추가로 확인할 최소 정보(최대 5개)",
      "- do.compatibilityChecks: 실수 방지/기관 확인 포인트",
      "- quick.topRisks + safety.holdRules + safety.escalateWhen: 위험 신호, 중단 기준, 호출 기준",
      "- safety.monitor: 재평가 타이밍과 모니터링",
      "- sbar: 바로 읽을 수 있는 SBAR",
      "- patientScript20s: 환자/보호자에게 설명할 짧은 문장(필요 시)",
      "",
      "질문에 없는 억지 섹션 생성 금지. 원문 질문 중심으로 답하라.",
      "",
      "질문:",
      params.query || "(없음)",
      "",
      "추가 맥락:",
      JSON.stringify(context, null, 2),
      "",
      "반드시 스키마 JSON만 반환한다. JSON 키/중괄호 조각이나 원문 그대로 붙여넣기 금지.",
    ].join("\n");
  }

  if (intent === "medication") {
    return [
      "This is medication-name lookup mode. Return practical bedside nursing guidance.",
      "Prioritize: what it is, key indications, administration principles, top contraindications, top monitoring, high-risk signs, line compatibility/interactions, and brief patient teaching.",
      "Do not make diagnosis or final prescribing decisions. Mark institution-dependent points for protocol/IFU verification.",
      "Map to schema fields and return JSON only.",
      "Question:",
      params.query || "(none)",
      "Context:",
      JSON.stringify(context, null, 2),
    ].join("\n");
  }

  if (intent === "device") {
    return [
      "This is device-name lookup mode. Return practical bedside setup and alarm-response guidance.",
      "Prioritize: what/when to use, setup workflow, normal operation criteria, alarm troubleshooting, stop rules/complications, and maintenance points.",
      "Do not make diagnosis or final orders. Mark protocol/IFU-dependent settings clearly.",
      "Map to schema fields and return JSON only.",
      "Question:",
      params.query || "(none)",
      "Context:",
      JSON.stringify(context, null, 2),
    ].join("\n");
  }

  return [
    "This is scenario-question mode. Do not force a fixed template.",
    "Answer the user's actual question directly with practical bedside nursing actions.",
    "Prioritize immediate safety actions, key checks, escalation criteria, and concise SBAR.",
    "If information is limited, provide safe defaults and up to 5 verification points.",
    "Context:",
    JSON.stringify(context, null, 2),
    "Question:",
    params.query || "(none)",
    "Map to schema fields and return JSON only.",
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
  maxOutputTokens: number;
}): Promise<ResponsesAttempt> {
  const { apiKey, model, developerPrompt, userPrompt, apiBaseUrl, imageDataUrl, signal, maxOutputTokens } = args;

  const userContent: Array<Record<string, unknown>> = [{ type: "input_text", text: userPrompt }];
  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
    });
  }

  const strictPayload = {
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
        schema: buildMedSafetyJsonSchema(),
      },
      verbosity: "low",
    },
    reasoning: {
      effort: "low",
    },
    max_output_tokens: maxOutputTokens,
    tools: [],
    store: false,
  };

  const relaxedPayload = {
    model,
    input: strictPayload.input,
    text: {
      format: { type: "text" as const },
      verbosity: "low" as const,
    },
    reasoning: strictPayload.reasoning,
    max_output_tokens: maxOutputTokens,
    tools: [],
    store: false,
  };

  const send = (body: unknown) =>
    fetch(`${apiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

  const parseSuccess = async (response: Response): Promise<ResponsesAttempt> => {
    const json = await response.json().catch(() => null);
    const text = extractResponsesText(json);
    if (!text) {
      return { text: null, error: `openai_empty_text_model:${model}`, json };
    }
    return { text: text || null, error: null, json };
  };

  let response: Response;
  try {
    response = await send(strictPayload);
  } catch (cause: any) {
    const reason = truncateError(String(cause?.message ?? cause ?? "fetch_failed"));
    return { text: null, error: `openai_network_${reason}`, json: null };
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    const shouldRetryWithoutSchema =
      response.status === 400 && /(json_schema|response_format|text\.format|strict|schema)/i.test(raw);
    if (shouldRetryWithoutSchema) {
      try {
        const relaxed = await send(relaxedPayload);
        if (!relaxed.ok) {
          const relaxedRaw = await relaxed.text().catch(() => "");
          return {
            text: null,
            error: `openai_responses_${relaxed.status}_model:${model}_${truncateError(relaxedRaw || "unknown_error")}`,
            json: null,
          };
        }
        return await parseSuccess(relaxed);
      } catch (cause: any) {
        const reason = truncateError(String(cause?.message ?? cause ?? "fetch_failed"));
        return { text: null, error: `openai_network_${reason}`, json: null };
      }
    }
    return {
      text: null,
      error: `openai_responses_${response.status}_model:${model}_${truncateError(raw || "unknown_error")}`,
      json: null,
    };
  }

  return await parseSuccess(response);
}

function parseAttemptResult(attempt: ResponsesAttempt): MedSafetyAnalysisResult | null {
  const fromJson = parseAnalysisResultFromResponseJson(attempt.json);
  if (fromJson) return fromJson;
  if (!attempt.text) return null;
  const parsed = safeJsonParse<unknown>(attempt.text);
  if (typeof parsed === "string") {
    const nested = safeJsonParse<unknown>(parsed);
    return parseAnalysisResult(nested);
  }
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
  apiBaseUrl: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}) {
  const { apiKey, model, rawText, locale, apiBaseUrl, maxOutputTokens, signal } = args;
  const modelCandidates = resolveModelCandidates(model);
  const developerPrompt = buildRepairDeveloperPrompt(locale);
  const userPrompt = buildRepairUserPrompt(rawText, locale);

  for (const candidateModel of modelCandidates) {
    const repaired = await callResponsesApi({
      apiKey,
      model: candidateModel,
      developerPrompt,
      userPrompt,
      apiBaseUrl,
      signal,
      maxOutputTokens,
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

  const modelCandidates = resolveModelCandidates();
  const primaryModel = modelCandidates[0] ?? "gpt-4.1-mini";
  const apiBaseUrl = resolveApiBaseUrl();
  const maxOutputTokens = resolveMaxOutputTokens();
  const expected = inferExpectedInputClassification({
    query: params.query,
    patientSummary: params.patientSummary,
    imageName: params.imageName,
    situation: params.situation,
    queryIntent: params.queryIntent,
  });
  const developerPrompt = buildDeveloperPrompt(params.locale);
  const userPrompt = buildUserPrompt({
    query: params.query,
    mode: params.mode,
    situation: params.situation,
    patientSummary: params.patientSummary,
    locale: params.locale,
    imageName: params.imageName,
    expected,
  });

  let parsed: MedSafetyAnalysisResult | null = null;
  let rawText = "";
  let selectedModel = primaryModel;
  let lastError = "openai_request_failed";

  for (const candidateModel of modelCandidates) {
    selectedModel = candidateModel;
    let attempt = await callResponsesApi({
      apiKey,
      model: candidateModel,
      developerPrompt,
      userPrompt,
      apiBaseUrl,
      imageDataUrl: params.imageDataUrl,
      signal: params.signal,
      maxOutputTokens,
    });
    if (attempt.error) lastError = attempt.error;
    if (attempt.text) rawText = attempt.text;

    let candidateParsed = parseAttemptResult(attempt);
    if (candidateParsed) {
      candidateParsed = alignAnalysisResultToInputKind(candidateParsed, expected, {
        query: params.query,
        situation: params.situation,
        locale: params.locale,
      });
    }

    if (!candidateParsed && !attempt.text && shouldRetryOpenAiError(attempt.error)) {
      const retry = await callResponsesApi({
        apiKey,
        model: candidateModel,
        developerPrompt,
        userPrompt,
        apiBaseUrl,
        imageDataUrl: params.imageDataUrl,
        signal: params.signal,
        maxOutputTokens,
      });
      attempt = retry;
      if (retry.error) lastError = retry.error;
      if (retry.text) rawText = retry.text;
      candidateParsed = parseAttemptResult(retry);
      if (candidateParsed) {
        candidateParsed = alignAnalysisResultToInputKind(candidateParsed, expected, {
          query: params.query,
          situation: params.situation,
          locale: params.locale,
        });
      }
    }

    if (candidateParsed) {
      parsed = candidateParsed;
      break;
    }

    if (attempt.text) {
      const repaired = await repairAnalysisFromRawText({
        apiKey,
        model: candidateModel,
        rawText: attempt.text,
        locale: params.locale,
        apiBaseUrl,
        maxOutputTokens,
        signal: params.signal,
      });
      if (repaired) {
        parsed = alignAnalysisResultToInputKind(repaired.parsed, expected, {
          query: params.query,
          situation: params.situation,
          locale: params.locale,
        });
        rawText = repaired.rawText;
        selectedModel = repaired.model;
        break;
      }
    }
  }

  if (!parsed && rawText) {
    const normalizedFromNarrative = parseAnalysisResultFromNarrativeText(rawText, params);
    if (normalizedFromNarrative) {
      return {
        result: alignAnalysisResultToInputKind(normalizedFromNarrative, expected, {
          query: params.query,
          situation: params.situation,
          locale: params.locale,
        }),
        model: selectedModel,
        rawText,
        fallbackReason: null,
      };
    }
  }

  if (!parsed && !rawText) {
    const fallback = buildFallbackAnalysisResult(
      params,
      fallbackNoteFromOpenAiError(lastError, params.locale),
      expected
    );
    return {
      result: fallback,
      model: selectedModel,
      rawText: "",
      fallbackReason: lastError || "openai_request_failed",
    };
  }

  if (!parsed) {
    const fallback = buildFallbackAnalysisResult(params, "AI 응답이 불완전해 안전 기본 모드로 복구되었습니다.", expected);
    return {
      result: fallback,
      model: selectedModel,
      rawText,
      fallbackReason: "openai_invalid_json_payload",
    };
  }

  return {
    result: alignAnalysisResultToInputKind(parsed, expected, {
      query: params.query,
      situation: params.situation,
      locale: params.locale,
    }),
    model: selectedModel,
    rawText,
    fallbackReason: null,
  };
}
