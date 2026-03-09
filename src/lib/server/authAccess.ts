const AUTH_ALLOWED_EMAIL_KEYS = [
  "AUTH_ALLOWED_EMAILS",
  "AUTH_GOOGLE_ALLOWED_EMAILS",
  "AUTH_TEST_ALLOWED_EMAILS",
] as const;

function readBooleanEnv(key: string) {
  const normalized = String(process.env[key] ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function readAllowedEmails() {
  const values = AUTH_ALLOWED_EMAIL_KEYS.flatMap((key) =>
    String(process.env[key] ?? "")
      .split(/[,\n]/)
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
  return new Set(values);
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
