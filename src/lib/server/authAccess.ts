const AUTH_ALLOWED_EMAIL_KEYS = [
  "AUTH_ALLOWED_EMAILS",
  "AUTH_GOOGLE_ALLOWED_EMAILS",
  "AUTH_TEST_ALLOWED_EMAILS",
] as const;

const RECOVERY_TESTER_USER_ID_KEYS = ["BILLING_ADMIN_USER_IDS", "AI_RECOVERY_TESTER_USER_IDS"] as const;
const RECOVERY_TESTER_EMAIL_KEYS = [
  "BILLING_ADMIN_EMAILS",
  "AI_RECOVERY_TESTER_EMAILS",
  "DEV_USER_1_EMAIL",
  "DEV_USER_2_EMAIL",
] as const;

function readBooleanEnv(key: string) {
  const normalized = String(process.env[key] ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function parseCsvValues(keys: readonly string[], normalize?: (value: string) => string) {
  return keys.flatMap((key) =>
    String(process.env[key] ?? "")
      .split(/[,\n]/)
      .map((value) => (normalize ? normalize(value) : value.trim()))
      .filter(Boolean)
  );
}

function readAllowedEmails() {
  const values = parseCsvValues(AUTH_ALLOWED_EMAIL_KEYS, (value) => normalizeEmail(value));
  return new Set(values);
}

function readRecoveryTesterUserIds() {
  return new Set(parseCsvValues(RECOVERY_TESTER_USER_ID_KEYS, (value) => value.trim()));
}

function readRecoveryTesterEmails() {
  return new Set(parseCsvValues(RECOVERY_TESTER_EMAIL_KEYS, (value) => normalizeEmail(value)));
}

export function isAuthEmailAllowed(email: string | null | undefined) {
  const normalizedEmail = normalizeEmail(email);
  const allowed = readAllowedEmails();
  if (!allowed.size) return true;
  if (!normalizedEmail) return false;
  return allowed.has(normalizedEmail);
}

export function hasAuthEmailAllowlist() {
  return readAllowedEmails().size > 0;
}

export function shouldRequireExistingAuthUser() {
  return readBooleanEnv("AUTH_REQUIRE_EXISTING_USER");
}

export function isPrivilegedRecoveryTesterIdentity(args: { userId?: string | null; email?: string | null }) {
  const userId = String(args.userId ?? "").trim();
  const email = normalizeEmail(args.email);
  const userIds = readRecoveryTesterUserIds();
  if (userId && userIds.has(userId)) return true;
  if (!email) return false;
  return readRecoveryTesterEmails().has(email);
}
