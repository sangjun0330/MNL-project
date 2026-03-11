type Locale = "ko" | "en";

export type MedSafetyContinuationMemoryTurn = {
  query: string;
  answer: string;
  hadImage?: boolean;
};

type MedSafetyContinuationPayloadV1 = {
  v: 1;
  uid: string;
  rid: string | null;
  cid: string | null;
  iat: number;
  exp: number;
  mem: Array<{
    query?: string;
    answer?: string;
  }>;
};

type MedSafetyContinuationPayloadV2 = {
  v: 2;
  uid: string;
  iat: number;
  exp: number;
  sum: string;
  last: {
    query: string;
    answer: string;
    hadImage?: boolean;
  } | null;
};

const TOKEN_PREFIX = "msct1";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_LINES = 8;
const MAX_SUMMARY_TOTAL_CHARS = 1500;
const MAX_QUERY_CHARS = 220;
const MAX_ANSWER_CHARS = 620;
const MAX_TURN_SUMMARY_LINES = 6;
const CONTINUATION_CUE_RE =
  /^(그럼|그러면|그런데|추가로|이 경우|이거|이 약|이 수치|이 결과|이 알람|이 사진|이 이미지|그 약|그 수치|그 결과|그 알람|그 이미지|그럼 이|그럼 그|그러면 이|그러면 그|왜|어떻게|그럼 중심정맥|사진상|이미지상|then|so|what about|how about|why|in that case|based on that|from that image|from this image)\b/i;
const NEW_TOPIC_CUE_RE = /^(새 질문|새 주제|다른 질문|주제 바꿔|새 검색|another question|new topic|different topic)\b/i;
const TOPIC_STOPWORDS = new Set([
  "이거",
  "그거",
  "그럼",
  "그러면",
  "그리고",
  "추가로",
  "이",
  "그",
  "저",
  "좀",
  "관련",
  "대해",
  "설명",
  "질문",
  "주제",
  "해줘",
  "알려줘",
  "의미",
  "해석",
  "then",
  "what",
  "about",
  "with",
  "from",
  "that",
  "this",
  "please",
  "help",
]);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, max: number) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function stripBulletPrefix(value: string) {
  return String(value ?? "")
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function normalizeStateId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^[A-Za-z0-9_-]{8,220}$/.test(text)) return null;
  return text;
}

function cleanAnswerLine(value: string) {
  return stripBulletPrefix(
    String(value ?? "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function isHeadingLine(value: string) {
  const line = cleanAnswerLine(value);
  if (!line) return false;
  if (!/[:：]$/.test(line)) return false;
  const heading = line.replace(/[:：]$/, "").trim();
  return heading.length > 0 && heading.length <= 36;
}

function splitSummaryLines(value: string) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function dedupeLines(lines: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = normalizeText(raw);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function extractSalientAnswerLines(answer: string) {
  const lines = String(answer ?? "")
    .replace(/\r/g, "")
    .split("\n");
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const cleaned = cleanAnswerLine(raw);
    if (!cleaned) continue;
    const line = isHeadingLine(cleaned) ? cleaned.replace(/[:：]$/, "") : cleaned;
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.includes("본 결과는 참고용 자동 생성 정보")) continue;
    if (lower.includes("모든 처치는 병원 지침")) continue;
    if (lower.includes("기관 프로토콜")) continue;
    const truncated = truncateText(line, 180);
    const key = truncated.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(truncated);
    if (out.length >= MAX_TURN_SUMMARY_LINES) break;
  }

  return out;
}

function mergeSummaryLines(previousSummary: string, currentLines: string[]) {
  const merged = dedupeLines([...currentLines, ...splitSummaryLines(previousSummary)]);
  const out: string[] = [];
  let totalChars = 0;
  for (const line of merged) {
    if (out.length >= MAX_SUMMARY_LINES) break;
    const nextChars = totalChars + line.length;
    if (out.length > 0 && nextChars > MAX_SUMMARY_TOTAL_CHARS) continue;
    out.push(line);
    totalChars = nextChars;
  }
  return out.join("\n");
}

function compactLastTurn(turn?: MedSafetyContinuationMemoryTurn | null) {
  if (!turn) return null;
  const query = truncateText(turn.query, MAX_QUERY_CHARS);
  const answer = truncateText(turn.answer, MAX_ANSWER_CHARS);
  if (!query || !answer) return null;
  return {
    query,
    answer,
    ...(turn.hadImage ? { hadImage: true } : {}),
  };
}

function buildTurnSummaryLines(args: {
  query: string;
  answer: string;
  locale: Locale;
  hadImage?: boolean;
}) {
  const lines = [
    args.locale === "en" ? `Topic: ${truncateText(args.query, 120)}` : `주제: ${truncateText(args.query, 120)}`,
    ...(args.hadImage
      ? [args.locale === "en" ? "This topic started from an attached image." : "이 주제는 첨부 이미지로 시작되었다."]
      : []),
    ...extractSalientAnswerLines(args.answer),
  ];
  return dedupeLines(lines);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`;
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
}

function resolveContinuationSecret() {
  return String(
    process.env.MED_SAFETY_CONTINUATION_SECRET ??
      process.env.OPENAI_MED_SAFETY_CONTINUATION_SECRET ??
      process.env.NEXTAUTH_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.OPENAI_API_KEY ??
      ""
  ).trim();
}

async function importAesKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function tokenizeForTopic(value: string) {
  const tokens = normalizeText(value)
    .toLowerCase()
    .match(/[a-z0-9]{2,}|[가-힣]{2,}/g);
  if (!tokens) return [];
  return tokens.filter((token) => !TOPIC_STOPWORDS.has(token));
}

function buildLegacyState(memoryTurns: MedSafetyContinuationMemoryTurn[]) {
  const compact = memoryTurns
    .map((turn) => compactLastTurn(turn))
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof compactLastTurn>>>;
  if (!compact.length) return { summary: "", lastTurn: null };

  let summary = "";
  compact.forEach((turn) => {
    summary = mergeSummaryLines(
      summary,
      buildTurnSummaryLines({
        query: turn.query,
        answer: turn.answer,
        locale: "ko",
        hadImage: turn.hadImage,
      })
    );
  });

  return {
    summary,
    lastTurn: compact[compact.length - 1] ?? null,
  };
}

export async function createMedSafetyContinuationToken(args: {
  userId: string;
  previousSummary?: string | null;
  query: string;
  answer: string;
  hadImage?: boolean;
  now?: number;
}) {
  const secret = resolveContinuationSecret();
  if (!secret) return null;

  const now = Number.isFinite(args.now) ? Number(args.now) : Date.now();
  const nextSummary = mergeSummaryLines(
    String(args.previousSummary ?? ""),
    buildTurnSummaryLines({
      query: args.query,
      answer: args.answer,
      locale: "ko",
      hadImage: args.hadImage,
    })
  );
  const nextLastTurn = compactLastTurn({
    query: args.query,
    answer: args.answer,
    hadImage: args.hadImage,
  });
  const payload: MedSafetyContinuationPayloadV2 = {
    v: 2,
    uid: String(args.userId ?? "").trim(),
    iat: now,
    exp: now + TOKEN_TTL_MS,
    sum: nextSummary,
    last: nextLastTurn,
  };

  if (!payload.uid || (!payload.sum && !payload.last)) return null;

  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${TOKEN_PREFIX}.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(cipherBuffer))}`;
}

export async function readMedSafetyContinuationToken(args: { token?: string | null; userId: string; now?: number }) {
  const token = String(args.token ?? "").trim();
  const userId = String(args.userId ?? "").trim();
  if (!token || !userId) return null;
  const secret = resolveContinuationSecret();
  if (!secret) return null;

  const [prefix, ivPart, cipherPart] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !ivPart || !cipherPart) return null;

  try {
    const key = await importAesKey(secret);
    const iv = base64UrlDecode(ivPart);
    const cipher = base64UrlDecode(cipherPart);
    if (iv.length !== 12 || !cipher.length) return null;
    const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const payload = JSON.parse(new TextDecoder().decode(plainBuffer)) as Record<string, unknown> | null;
    if (!payload) return null;
    const now = Number.isFinite(args.now) ? Number(args.now) : Date.now();
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now) return null;
    if (String(payload.uid ?? "") !== userId) return null;

    if (payload?.v === 2) {
      return {
        summary: truncateText(String(payload.sum ?? ""), MAX_SUMMARY_TOTAL_CHARS),
        lastTurn: compactLastTurn((payload.last as MedSafetyContinuationMemoryTurn | null | undefined) ?? null),
      };
    }

    if (payload?.v === 1) {
      const legacyTurns = Array.isArray(payload.mem)
        ? payload.mem.map((turn) => ({
            query: String(turn?.query ?? ""),
            answer: String(turn?.answer ?? ""),
          }))
        : [];
      return buildLegacyState(legacyTurns);
    }

    return null;
  } catch {
    return null;
  }
}

export function shouldStartFreshMedSafetySession(args: {
  query: string;
  summary?: string | null;
  lastTurn?: MedSafetyContinuationMemoryTurn | null;
  hasNewImage?: boolean;
}) {
  const query = normalizeText(args.query);
  if (!query) return false;
  if (!args.summary && !args.lastTurn) return false;
  if (args.hasNewImage) return true;
  if (NEW_TOPIC_CUE_RE.test(query)) return true;
  if (CONTINUATION_CUE_RE.test(query)) return false;

  const queryTokens = tokenizeForTopic(query);
  if (!queryTokens.length) return false;

  const contextTokens = new Set<string>([
    ...tokenizeForTopic(String(args.summary ?? "")),
    ...tokenizeForTopic(String(args.lastTurn?.query ?? "")),
    ...tokenizeForTopic(String(args.lastTurn?.answer ?? "")),
  ]);
  if (!contextTokens.size) return false;

  let overlap = 0;
  queryTokens.forEach((token) => {
    if (contextTokens.has(token)) overlap += 1;
  });

  if (overlap >= 2) return false;
  if (overlap >= 1 && queryTokens.length <= 4) return false;
  return true;
}

export function buildMedSafetyContinuationMemoryText(args: {
  summary?: string | null;
  lastTurn?: MedSafetyContinuationMemoryTurn | null;
  locale: Locale;
}) {
  const summaryLines = splitSummaryLines(String(args.summary ?? ""));
  const lastTurn = compactLastTurn(args.lastTurn ?? null);
  if (!summaryLines.length && !lastTurn) return "";

  const lines: string[] = [];
  if (summaryLines.length) {
    lines.push(args.locale === "en" ? "Session summary:" : "세션 핵심 요약:");
    lines.push(...summaryLines);
  }
  if (lastTurn) {
    lines.push("");
    lines.push(args.locale === "en" ? "Most recent exchange:" : "직전 대화:");
    lines.push(args.locale === "en" ? `Previous user question: ${lastTurn.query}` : `직전 사용자 질문: ${lastTurn.query}`);
    lines.push(args.locale === "en" ? `Previous assistant answer: ${lastTurn.answer}` : `직전 AI 답변: ${lastTurn.answer}`);
  }
  return lines.join("\n").trim();
}
