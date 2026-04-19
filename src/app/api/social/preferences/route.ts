import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialReadAccess,
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { HealthVisibility, ScheduleVisibility } from "@/types/social";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SCHEDULE_VISIBILITY_VALUES: ScheduleVisibility[] = ["full", "off_only", "hidden"];
const HEALTH_VISIBILITY_VALUES: HealthVisibility[] = ["full", "hidden"];

const DEFAULT_PREFS = {
  scheduleVisibility: "full" as ScheduleVisibility,
  statusMessageVisible: true,
  acceptInvites: true,
  notifyRequests: true,
  healthVisibility: "hidden" as HealthVisibility,
};

function rowToPrefs(row: any) {
  return {
    scheduleVisibility: (SCHEDULE_VISIBILITY_VALUES.includes(row?.schedule_visibility)
      ? row.schedule_visibility
      : "full") as ScheduleVisibility,
    statusMessageVisible: row?.status_message_visible !== false,
    acceptInvites: row?.accept_invites !== false,
    notifyRequests: row?.notify_requests !== false,
    healthVisibility: (HEALTH_VISIBILITY_VALUES.includes(row?.health_visibility)
      ? row.health_visibility
      : "hidden") as HealthVisibility,
  };
}

// GET /api/social/preferences — 없으면 기본값 반환
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: true, data: DEFAULT_PREFS });

  const admin = getSupabaseAdmin();

  try {
    await assertSocialReadAccess(admin, userId);
    const { data: row, error } = await (admin as any)
      .from("rnest_social_preferences")
      .select("schedule_visibility, status_message_visible, accept_invites, notify_requests, health_visibility")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    return jsonNoStore({ ok: true, data: row ? rowToPrefs(row) : DEFAULT_PREFS });
  } catch (err: any) {
    // health_visibility 컬럼이 아직 없을 때 fallback
    if (
      String(err?.message ?? "").includes("column") ||
      String(err?.message ?? "").includes("does not exist") ||
      err?.code === "42703"
    ) {
      try {
        const { data: row } = await (admin as any)
          .from("rnest_social_preferences")
          .select("schedule_visibility, status_message_visible, accept_invites, notify_requests")
          .eq("user_id", userId)
          .maybeSingle();
        return jsonNoStore({ ok: true, data: row ? { ...rowToPrefs(row), healthVisibility: "hidden" as HealthVisibility } : DEFAULT_PREFS });
      } catch {
        return jsonNoStore({ ok: true, data: DEFAULT_PREFS });
      }
    }
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
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

  const healthVisibility = body?.healthVisibility;
  if (healthVisibility !== undefined && !HEALTH_VISIBILITY_VALUES.includes(healthVisibility)) {
    return jsonNoStore({ ok: false, error: "invalid_health_visibility" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    await assertSocialWriteAccess(admin, userId);
    // 현재 값 조회 (부분 업데이트를 위해)
    let currentPrefs = DEFAULT_PREFS;
    try {
      const { data: current } = await (admin as any)
        .from("rnest_social_preferences")
        .select("schedule_visibility, status_message_visible, accept_invites, notify_requests, health_visibility")
        .eq("user_id", userId)
        .maybeSingle();
      if (current) currentPrefs = rowToPrefs(current);
    } catch {
      // health_visibility 컬럼 없을 때 기존 컬럼만 조회
      try {
        const { data: current } = await (admin as any)
          .from("rnest_social_preferences")
          .select("schedule_visibility, status_message_visible, accept_invites, notify_requests")
          .eq("user_id", userId)
          .maybeSingle();
        if (current) currentPrefs = { ...rowToPrefs(current), healthVisibility: "hidden" as HealthVisibility };
      } catch {}
    }

    const newRow: Record<string, unknown> = {
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

    // health_visibility는 컬럼이 있을 때만 포함
    if (healthVisibility !== undefined) {
      newRow.health_visibility = healthVisibility;
    } else if (currentPrefs.healthVisibility !== "hidden") {
      // 기존 값 유지 (변경 없을 때)
      newRow.health_visibility = currentPrefs.healthVisibility;
    } else {
      newRow.health_visibility = "hidden";
    }

    let upserted: any = null;
    let upsertError: any = null;

    // health_visibility 포함해서 먼저 시도
    try {
      const result = await (admin as any)
        .from("rnest_social_preferences")
        .upsert(newRow, { onConflict: "user_id" })
        .select("schedule_visibility, status_message_visible, accept_invites, notify_requests, health_visibility")
        .single();
      upserted = result.data;
      upsertError = result.error;
    } catch (err) {
      upsertError = err;
    }

    // health_visibility 컬럼이 없을 때 fallback
    if (upsertError) {
      const msg = String(upsertError?.message ?? "");
      if (msg.includes("column") || msg.includes("does not exist") || upsertError?.code === "42703") {
        // health_visibility 키를 제외한 row 빌드 (컬럼 없을 때 fallback)
        const { health_visibility: _drop, ...rowWithoutHealth } = newRow;
        void _drop;
        const result = await (admin as any)
          .from("rnest_social_preferences")
          .upsert(rowWithoutHealth, { onConflict: "user_id" })
          .select("schedule_visibility, status_message_visible, accept_invites, notify_requests")
          .single();
        if (result.error) throw result.error;
        return jsonNoStore({
          ok: true,
          data: { ...rowToPrefs(result.data), healthVisibility: "hidden" as HealthVisibility },
        });
      }
      throw upsertError;
    }

    return jsonNoStore({ ok: true, data: rowToPrefs(upserted) });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    console.error("[SocialPreferences/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_save_preferences" }, { status: 500 });
  }
}
