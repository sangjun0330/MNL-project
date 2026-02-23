import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

export type BillingAdminIdentity = {
  userId: string;
  email: string | null;
};

function parseCsvSet(value: string | undefined, normalize?: (raw: string) => string): Set<string> {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((s) => (normalize ? normalize(s.trim()) : s.trim()))
      .filter(Boolean)
  );
}

async function readUserEmailFromRequest(req: Request): Promise<string | null> {
  try {
    const supabase = await getRouteSupabaseClient();
    const bearer = req.headers.get("authorization") ?? "";
    const token = bearer.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : "";
    const { data } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

function readClientIp(req: Request): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim().slice(0, 80);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 80);
  return "unknown";
}

export async function requireBillingAdmin(
  req: Request
): Promise<
  | { ok: true; identity: BillingAdminIdentity }
  | { ok: false; status: number; error: string }
> {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return { ok: false, status: 401, error: "login_required" };

  const adminUserIds = parseCsvSet(process.env.BILLING_ADMIN_USER_IDS);
  const adminEmails = parseCsvSet(process.env.BILLING_ADMIN_EMAILS, (v) => v.toLowerCase());
  if (adminUserIds.size === 0 && adminEmails.size === 0) {
    console.error("[AdminAuth] BILLING_ADMIN_USER_IDS and BILLING_ADMIN_EMAILS are not configured");
    return { ok: false, status: 403, error: "forbidden" };
  }

  const email = await readUserEmailFromRequest(req);
  const normalizedEmail = email ? email.toLowerCase() : null;
  const isAllowed = adminUserIds.has(userId) || (normalizedEmail ? adminEmails.has(normalizedEmail) : false);

  if (!isAllowed) {
    // 인증 실패 시 서버 로그에 기록 (Cloudflare Logs에 캡처됨)
    // 클라이언트에는 상세 사유를 노출하지 않음
    const ip = readClientIp(req);
    const path = (() => { try { return new URL(req.url).pathname; } catch { return "unknown"; } })();
    console.warn(
      `[AdminAuth] Forbidden access attempt: userId=${userId}, ip=${ip}, path=${path}, ts=${new Date().toISOString()}`
    );
    return { ok: false, status: 403, error: "forbidden" };
  }

  return {
    ok: true,
    identity: {
      userId,
      email,
    },
  };
}
