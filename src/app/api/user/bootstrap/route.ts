import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function errorResponse(status: number, error: string) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    {
      status,
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
      return errorResponse(401, "login_required");
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
    return errorResponse(503, "failed_to_load_bootstrap");
  }
}
