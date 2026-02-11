import { NextResponse } from "next/server";
import { makeSignedToken } from "@/lib/server/logStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/logs/register
 *
 * - 클라이언트가 생성/보관하는 deviceId를 받아 서버에서 토큰을 발급합니다.
 * - DATABASE_URL / pg 설치 여부와 무관하게 동작해야 하므로, 여기서는 DB를 사용하지 않습니다.
 * - LOG_SIGNING_SECRET이 없으면 makeSignedToken()이 ""를 반환할 수 있고,
 *   verifySignedToken()은 개발 환경에서 검증을 스킵하도록 되어있습니다.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const deviceId = String((body as any)?.deviceId ?? "").trim();

  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId is required" }, { status: 400 });
  }

  const token = await makeSignedToken(deviceId);
  return NextResponse.json({ ok: true, deviceId, token });
}

// 간단한 헬스체크
export async function GET() {
  return NextResponse.json({ ok: true });
}
