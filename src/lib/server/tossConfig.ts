export type TossKeyMode = "test" | "live";

type ClientKeyResult =
  | { ok: true; clientKey: string; mode: TossKeyMode }
  | { ok: false; error: string };

type SecretKeyResult =
  | { ok: true; secretKey: string; mode: TossKeyMode }
  | { ok: false; error: string };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function inferMode(key: string): TossKeyMode | null {
  if (key.startsWith("test_")) return "test";
  if (key.startsWith("live_")) return "live";
  return null;
}

export function readTossClientKeyFromEnv(): ClientKeyResult {
  const clientKey = clean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
  if (!clientKey) return { ok: false, error: "missing_toss_client_key" };
  if (!clientKey.includes("_ck_")) return { ok: false, error: "invalid_toss_client_key" };

  const mode = inferMode(clientKey);
  if (!mode) return { ok: false, error: "invalid_toss_client_key_mode" };

  return { ok: true, clientKey, mode };
}

export function readTossSecretKeyFromEnv(): SecretKeyResult {
  const secretKey = clean(process.env.TOSS_SECRET_KEY);
  if (!secretKey) return { ok: false, error: "missing_toss_secret_key" };
  if (!secretKey.includes("_sk_")) return { ok: false, error: "invalid_toss_secret_key" };

  const mode = inferMode(secretKey);
  if (!mode) return { ok: false, error: "invalid_toss_secret_key_mode" };

  return { ok: true, secretKey, mode };
}

export function buildConfirmIdempotencyKey(orderId: string) {
  const normalized = String(orderId).replace(/[^A-Za-z0-9_-]/g, "");
  return `confirm_${normalized}`.slice(0, 120);
}

export function buildCancelIdempotencyKey(orderId: string) {
  const normalized = String(orderId).replace(/[^A-Za-z0-9_-]/g, "");
  return `cancel_${normalized}`.slice(0, 120);
}

export function readTossAcceptLanguage(reqHeader: string | null): string | null {
  const requestValue = clean(reqHeader);
  const fallback = clean(process.env.TOSS_API_ACCEPT_LANGUAGE) || "ko-KR";
  const raw = requestValue || fallback;
  if (!raw) return null;

  // Prevent header injection while keeping common Accept-Language formats.
  if (!/^[A-Za-z0-9,;=._*\- ]{2,120}$/.test(raw)) return null;
  return raw;
}

export function readTossTestCodeFromEnv(mode: TossKeyMode): string | null {
  if (mode !== "test") return null;
  const testCode = clean(process.env.TOSS_TEST_CODE);
  if (!testCode) return null;
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(testCode)) return null;
  return testCode;
}
