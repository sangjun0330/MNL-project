type Locale = "ko" | "en";

export type MedSafetyContinuationMemoryTurn = {
  query: string;
  answer: string;
};

type MedSafetyContinuationPayload = {
  v: 1;
  uid: string;
  rid: string | null;
  cid: string | null;
  iat: number;
  exp: number;
  mem: MedSafetyContinuationMemoryTurn[];
};

const TOKEN_PREFIX = "msct1";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MEMORY_TURNS = 3;
const MAX_QUERY_CHARS = 240;
const MAX_ANSWER_CHARS = 720;
const MAX_MEMORY_TOTAL_CHARS = 2200;

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

function normalizeStateId(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^[A-Za-z0-9_-]{8,220}$/.test(text)) return null;
  return text;
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

function compactMemoryTurns(turns: MedSafetyContinuationMemoryTurn[]) {
  const recent = turns
    .map((turn) => ({
      query: truncateText(turn.query, MAX_QUERY_CHARS),
      answer: truncateText(turn.answer, MAX_ANSWER_CHARS),
    }))
    .filter((turn) => turn.query && turn.answer)
    .slice(-MAX_MEMORY_TURNS);

  const out: MedSafetyContinuationMemoryTurn[] = [];
  let totalChars = 0;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const turn = recent[index]!;
    const nextChars = turn.query.length + turn.answer.length;
    if (out.length > 0 && totalChars + nextChars > MAX_MEMORY_TOTAL_CHARS) continue;
    out.unshift(turn);
    totalChars += nextChars;
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

export async function createMedSafetyContinuationToken(args: {
  userId: string;
  previousTurns?: MedSafetyContinuationMemoryTurn[];
  responseId?: string | null;
  conversationId?: string | null;
  query: string;
  answer: string;
  now?: number;
}) {
  const secret = resolveContinuationSecret();
  if (!secret) return null;

  const now = Number.isFinite(args.now) ? Number(args.now) : Date.now();
  const payload: MedSafetyContinuationPayload = {
    v: 1,
    uid: String(args.userId ?? "").trim(),
    rid: normalizeStateId(args.responseId),
    cid: normalizeStateId(args.conversationId),
    iat: now,
    exp: now + TOKEN_TTL_MS,
    mem: compactMemoryTurns([
      ...(Array.isArray(args.previousTurns) ? args.previousTurns : []),
      {
        query: args.query,
        answer: args.answer,
      },
    ]),
  };

  if (!payload.uid || (!payload.rid && !payload.cid && !payload.mem.length)) return null;

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
    const payload = JSON.parse(new TextDecoder().decode(plainBuffer)) as Partial<MedSafetyContinuationPayload>;
    const now = Number.isFinite(args.now) ? Number(args.now) : Date.now();
    if (payload?.v !== 1) return null;
    if (String(payload.uid ?? "") !== userId) return null;
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now) return null;

    return {
      previousResponseId: normalizeStateId(payload.rid),
      conversationId: normalizeStateId(payload.cid),
      memoryTurns: compactMemoryTurns(Array.isArray(payload.mem) ? payload.mem : []),
    };
  } catch {
    return null;
  }
}

export function buildMedSafetyContinuationMemoryText(turns: MedSafetyContinuationMemoryTurn[], locale: Locale) {
  const compact = compactMemoryTurns(Array.isArray(turns) ? turns : []);
  if (!compact.length) return "";

  const lines: string[] = [];
  compact.forEach((turn, index) => {
    const label = index + 1;
    if (locale === "en") {
      lines.push(`Previous user question ${label}: ${turn.query}`);
      lines.push(`Previous assistant answer ${label}: ${turn.answer}`);
      return;
    }
    lines.push(`이전 사용자 질문 ${label}: ${turn.query}`);
    lines.push(`이전 AI 답변 ${label}: ${turn.answer}`);
  });
  return lines.join("\n");
}
