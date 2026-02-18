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
    return { ok: false, status: 500, error: "billing_admin_not_configured" };
  }

  const email = await readUserEmailFromRequest(req);
  const normalizedEmail = email ? email.toLowerCase() : null;
  const isAllowed = adminUserIds.has(userId) || (normalizedEmail ? adminEmails.has(normalizedEmail) : false);
  if (!isAllowed) return { ok: false, status: 403, error: "admin_forbidden" };

  return {
    ok: true,
    identity: {
      userId,
      email,
    },
  };
}
