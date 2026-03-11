type MedSafetyContinuationPayloadV1 = {
  v: 1;
  uid: string;
  rid: string | null;
  cid: string | null;
  iat: number;
  exp: number;
  mem?: Array<{
    query?: string;
    answer?: string;
  }>;
};

type MedSafetyContinuationPayloadV3 = {
  v: 3;
  uid: string;
  rid: string | null;
  cid: string | null;
  iat: number;
  exp: number;
};

const TOKEN_PREFIX = "msct1";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

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
  responseId?: string | null;
  conversationId?: string | null;
  now?: number;
}) {
  const secret = resolveContinuationSecret();
  if (!secret) return null;

  const payload: MedSafetyContinuationPayloadV3 = {
    v: 3,
    uid: String(args.userId ?? "").trim(),
    rid: normalizeStateId(args.responseId),
    cid: normalizeStateId(args.conversationId),
    iat: Number.isFinite(args.now) ? Number(args.now) : Date.now(),
    exp: (Number.isFinite(args.now) ? Number(args.now) : Date.now()) + TOKEN_TTL_MS,
  };

  if (!payload.uid || (!payload.rid && !payload.cid)) return null;

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
    const payload = JSON.parse(new TextDecoder().decode(plainBuffer)) as
      | MedSafetyContinuationPayloadV1
      | MedSafetyContinuationPayloadV3
      | Record<string, unknown>
      | null;
    if (!payload) return null;

    const now = Number.isFinite(args.now) ? Number(args.now) : Date.now();
    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now) return null;
    if (String(payload.uid ?? "") !== userId) return null;

    if (payload.v === 3 || payload.v === 1) {
      const previousResponseId = normalizeStateId(payload.rid);
      const conversationId = normalizeStateId(payload.cid);
      if (!previousResponseId && !conversationId) return null;
      return {
        previousResponseId,
        conversationId,
      };
    }

    return null;
  } catch {
    return null;
  }
}
