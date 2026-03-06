import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// 대문자+숫자, 오독 가능 문자 제외 (0/1/I/O)
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join("");
}

async function upsertCode(userId: string, code?: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const newCode = code ?? generateCode();

  // UNIQUE 충돌 시 최대 5회 재시도
  for (let attempt = 0; attempt < 5; attempt++) {
    const tryCode = attempt === 0 ? newCode : generateCode();
    const { error } = await (admin as any)
      .from("rnest_connect_codes")
      .upsert({ user_id: userId, code: tryCode, updated_at: new Date().toISOString() });

    if (!error) return tryCode;
    if (!error.message?.includes("unique")) throw error;
  }
  throw new Error("code_generation_failed");
}

// GET /api/social/code — 내 코드 조회 (없으면 자동 생성)
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await (admin as any)
      .from("rnest_connect_codes")
      .select("code, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return jsonNoStore({ ok: true, data: { code: data.code, createdAt: data.created_at } });
    }

    // 코드 없음 → 자동 생성
    const newCode = await upsertCode(userId);
    return jsonNoStore({
      ok: true,
      data: { code: newCode, createdAt: new Date().toISOString() },
    });
  } catch (err: any) {
    console.error("[SocialCode/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_code" }, { status: 500 });
  }
}

// POST /api/social/code — 코드 재생성
export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!body?.regenerate) {
    return jsonNoStore({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  try {
    const newCode = await upsertCode(userId);
    return jsonNoStore({
      ok: true,
      data: { code: newCode, createdAt: new Date().toISOString() },
    });
  } catch (err: any) {
    console.error("[SocialCode/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_regenerate_code" }, { status: 500 });
  }
}
