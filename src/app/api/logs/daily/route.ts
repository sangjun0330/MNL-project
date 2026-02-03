import { NextResponse } from "next/server";
import { listDailyLogs, saveDailyLog, verifySignedToken } from "@/lib/server/logStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid json");
  }

  const deviceId = String(body?.deviceId ?? "").trim();
  const date = String(body?.date ?? "").trim();
  const payload = body?.payload;
  const clientUpdatedAt = Number(body?.clientUpdatedAt ?? Date.now());

  if (!deviceId || !date || payload == null) {
    return bad(400, "deviceId, date, payload required");
  }

  // (선택) 서명 토큰 검증
  const maybeToken = req.headers.get("x-log-token") || "";
  const secret = process.env.LOG_SIGNING_SECRET;
  if (secret) {
    if (!verifySignedToken(deviceId, maybeToken)) {
      return bad(401, "invalid token");
    }
  }

  try {
    await saveDailyLog({ deviceId, date, payload, clientUpdatedAt });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(500, e?.message || "failed to save");
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("deviceId")?.trim() || undefined;
  const from = url.searchParams.get("from")?.trim() || undefined;
  const to = url.searchParams.get("to")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 180);

  // GET은 기본적으로 개발자 전용으로 잠금(토큰이 없으면 404)
  const devToken = process.env.DEV_LOG_VIEW_TOKEN;
  if (devToken) {
    const given = url.searchParams.get("token") || req.headers.get("x-dev-token") || "";
    if (given !== devToken) {
      // 노출을 줄이기 위해 404
      return new NextResponse("Not Found", { status: 404 });
    }
  } else {
    // 토큰을 설정하지 않으면, 기본적으로 GET을 비활성화
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const rows = await listDailyLogs({ deviceId, from, to, limit: Number.isFinite(limit) ? limit : 180 });
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return bad(500, e?.message || "failed to load");
  }
}
