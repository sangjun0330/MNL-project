import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// GET /api/social/friends/schedule?months=YYYY-MM,YYYY-MM
// 하위 호환: ?month=YYYY-MM 단일 파라미터도 동작
export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const url = new URL(req.url);
  // months=2026-03,2026-04 또는 month=2026-03 (하위 호환)
  const rawMonths = url.searchParams.get("months") ?? url.searchParams.get("month") ?? "";
  const monthList = rawMonths
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^\d{4}-\d{2}$/.test(m));

  // 0개 또는 3개 이상이면 오류
  if (monthList.length === 0 || monthList.length > 2) {
    return jsonNoStore({ ok: false, error: "invalid_month_format" }, { status: 400 });
  }

  // commonOffDays 계산은 첫 번째 월(현재월) 기준
  const primaryMonth = monthList[0];
  const prefixes = monthList.map((m) => m + "-");

  const admin = getSupabaseAdmin();

  try {
    // 1. accepted 연결에서 친구 userId 목록
    const { data: conns, error: connErr } = await (admin as any)
      .from("rnest_connections")
      .select("requester_id, receiver_id")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq("status", "accepted");

    if (connErr) throw connErr;

    const friendIds: string[] = (conns ?? []).map((c: any) =>
      c.requester_id === userId ? c.receiver_id : c.requester_id
    );

    if (friendIds.length === 0) {
      return jsonNoStore({ ok: true, data: { friends: [], commonOffDays: [] } });
    }

    // 2. 소셜 프로필
    const { data: profiles } = await (admin as any)
      .from("rnest_social_profiles")
      .select("user_id, nickname, avatar_emoji, status_message")
      .in("user_id", friendIds);

    const profileMap: Record<string, { nickname: string; avatar_emoji: string; status_message: string }> = {};
    for (const p of profiles ?? []) {
      profileMap[p.user_id] = {
        nickname: p.nickname,
        avatar_emoji: p.avatar_emoji,
        status_message: p.status_message ?? "",
      };
    }

    // 3. 친구 스케줄 조회 — payload 전체를 서버에서 조회 후 schedule만 추출
    // (bio/emotions는 절대 클라이언트에 반환하지 않음)
    const { data: states, error: stateErr } = await (admin as any)
      .from("rnest_user_state")
      .select("user_id, payload")
      .in("user_id", friendIds);

    if (stateErr) throw stateErr;

    // 4. 해당 월(들) 데이터만 필터링 (서버에서 필터링)
    const friends = (states ?? []).map((s: any) => {
      // payload.schedule만 추출 — bio, emotions, notes 등은 사용하지 않음
      const rawSchedule: Record<string, string> = (s.payload as any)?.schedule ?? {};
      const monthSchedule: Record<string, string> = {};
      for (const [date, shift] of Object.entries(rawSchedule)) {
        // prefixes 중 하나라도 매칭되면 포함 (다중 월 지원)
        if (prefixes.some((p) => date.startsWith(p)) && typeof shift === "string") {
          monthSchedule[date] = shift;
        }
      }
      const profile = profileMap[s.user_id] ?? { nickname: "", avatar_emoji: "🐧", status_message: "" };
      return {
        userId: s.user_id,
        nickname: profile.nickname,
        avatarEmoji: profile.avatar_emoji,
        statusMessage: profile.status_message,
        schedule: monthSchedule,
      };
    });

    // 5. 내 스케줄도 조회하여 commonOffDays 계산
    const { data: myState } = await (admin as any)
      .from("rnest_user_state")
      .select("payload")
      .eq("user_id", userId)
      .maybeSingle();

    const mySchedule: Record<string, string> = (myState?.payload as any)?.schedule ?? {};
    // commonOffDays는 현재월(primaryMonth) 기준만 계산
    const primaryPrefix = primaryMonth + "-";
    const myOffDays = new Set(
      Object.entries(mySchedule)
        .filter(([date, shift]) => date.startsWith(primaryPrefix) && (shift === "OFF" || shift === "VAC"))
        .map(([date]) => date)
    );

    // 모든 친구가 동시에 OFF/VAC인 날
    let commonOffDays: string[] = [];
    if (myOffDays.size > 0 && friends.length > 0) {
      const allOffSets = friends.map(
        (f: { schedule: Record<string, string> }) =>
          new Set(
            Object.entries(f.schedule)
              .filter(([, shift]) => shift === "OFF" || shift === "VAC")
              .map(([date]) => date)
          )
      );
      commonOffDays = Array.from(myOffDays)
        .filter((date) => allOffSets.every((s: Set<string>) => s.has(date)))
        .sort();
    }

    return jsonNoStore({
      ok: true,
      data: { friends, commonOffDays },
    });
  } catch (err: any) {
    console.error("[SocialFriendsSchedule/GET] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_get_friends_schedule" }, { status: 500 });
  }
}
