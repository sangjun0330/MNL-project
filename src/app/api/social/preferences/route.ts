import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { ScheduleVisibility } from "@/types/social";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SCHEDULE_VISIBILITY_VALUES: ScheduleVisibility[] = ["full", "off_only", "hidden"];

const DEFAULT_PREFS = {
  scheduleVisibility: "full" as ScheduleVisibility,
  statusMessageVisible: true,
  acceptInvites: true,
  notifyRequests: true,
};

function rowToPrefs(row: any) {
  return {
    scheduleVisibility: (SCHEDULE_VISIBILITY_VALUES.includes(row?.schedule_visibility)
      ? row.schedule_visibility
      : "full") as ScheduleVisibility,
    statusMessageVisible: row?.status_message_visible !== false,
    acceptInvites: row?.accept_invites !== false,
    notifyRequests: row?.notify_requests !== false,
  };
}

// GET /api/social/preferences — 없으면 기본값 반환
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const admin = getSupabaseAdmin();

  try {
    const { data: row, error } = await (admin as any)
      .from("rnest_social_preferences")
      .select("schedule_visibility, status_message_visible, accept_invites, notify_requests")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    return jsonNoStore({ ok: true, data: row ? rowToPrefs(row) : DEFAULT_PREFS });
  } catch (err: any) {
    console.error("[SocialPreferences/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_preferences" }, { status: 500 });
  }
}

// POST /api/social/preferences — UPSERT
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

  const scheduleVisibility = body?.scheduleVisibility;
  if (scheduleVisibility !== undefined && !SCHEDULE_VISIBILITY_VALUES.includes(scheduleVisibility)) {
    return jsonNoStore({ ok: false, error: "invalid_schedule_visibility" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    // 현재 값 조회 (부분 업데이트를 위해)
    const { data: current } = await (admin as any)
      .from("rnest_social_preferences")
      .select("schedule_visibility, status_message_visible, accept_invites, notify_requests")
      .eq("user_id", userId)
      .maybeSingle();

    const currentPrefs = current ? rowToPrefs(current) : DEFAULT_PREFS;

    const newRow = {
      user_id: userId,
      schedule_visibility: scheduleVisibility ?? currentPrefs.scheduleVisibility,
      status_message_visible:
        typeof body?.statusMessageVisible === "boolean"
          ? body.statusMessageVisible
          : currentPrefs.statusMessageVisible,
      accept_invites:
        typeof body?.acceptInvites === "boolean" ? body.acceptInvites : currentPrefs.acceptInvites,
      notify_requests:
        typeof body?.notifyRequests === "boolean" ? body.notifyRequests : currentPrefs.notifyRequests,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error } = await (admin as any)
      .from("rnest_social_preferences")
      .upsert(newRow, { onConflict: "user_id" })
      .select("schedule_visibility, status_message_visible, accept_invites, notify_requests")
      .single();

    if (error) throw error;

    return jsonNoStore({ ok: true, data: rowToPrefs(upserted) });
  } catch (err: any) {
    console.error("[SocialPreferences/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_save_preferences" }, { status: 500 });
  }
}
