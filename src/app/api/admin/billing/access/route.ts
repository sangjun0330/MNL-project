import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) {
    // 에러 세부 사유(설정 상태, 이메일 등)는 외부에 노출하지 않음
    if (admin.status === 401 || admin.status === 403 || admin.status === 500) {
      return NextResponse.json({ ok: true, data: { isAdmin: false } });
    }
    return bad(admin.status, admin.error);
  }

  // userId·email은 응답에서 제외 — 관리자 여부만 반환
  return NextResponse.json({ ok: true, data: { isAdmin: true } });
}
