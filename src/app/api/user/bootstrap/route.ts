import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function degradedResponse() {
  return NextResponse.json(
    {
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
          memo: { folders: {}, documents: {}, recent: [], personalTemplates: [] },
          records: { templates: {}, entries: {}, recent: [] },
          settings: null,
        },
        stateRevision: null,
        bootstrapRevision: null,
        updatedAt: null,
        degraded: true,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}

export async function GET(req: Request) {
  try {
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId");
    const { loadUserBootstrap } = await import("@/lib/server/serviceConsentStore");

    // sameOriginRequestError 체크 제거:
    // Referrer-Policy: no-referrer 설정으로 브라우저가 Referer 헤더를 전송하지 않아
    // GET 요청은 Origin 헤더도 없어 항상 403이 반환됨.
    // JWT Authorization 헤더가 이미 인증을 담당하므로 CSRF 체크는 불필요.

    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return degradedResponse();
    }
    const data = await loadUserBootstrap(userId);
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    try {
      console.error("[UserBootstrap] failed_to_load_bootstrap", {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Ignore logging failures.
    }
    return degradedResponse();
  }
}
