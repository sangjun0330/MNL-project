import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadUserBootstrap } from "@/lib/server/serviceConsentStore";
import { defaultMemoState, defaultRecordState } from "@/lib/notebook";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
    }
    const data = await loadUserBootstrap(userId);
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    console.error("[UserBootstrap] failed_to_load_bootstrap", {
      userId: (() => {
        try {
          return req.headers.get("authorization") ? "auth_header_present" : "unknown";
        } catch {
          return "unknown";
        }
      })(),
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonNoStore({
      ok: true,
      data: {
        onboardingCompleted: true,
        consentCompleted: true,
        hasStoredState: false,
        consent: null,
        state: {
          selected: null,
          schedule: {},
          shiftNames: {},
          notes: {},
          emotions: {},
          bio: {},
          memo: defaultMemoState(),
          records: defaultRecordState(),
          settings: null,
        },
        updatedAt: null,
        degraded: true,
      },
    });
  }
}
