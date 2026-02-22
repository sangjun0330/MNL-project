import { NextResponse } from "next/server";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { withdrawRefundRequestByUser } from "@/lib/server/billingStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toRefundId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function readRefundIdFromContext(ctx: any): Promise<number | null> {
  const params = await Promise.resolve(ctx?.params);
  return toRefundId(params?.refundId);
}

function clean(value: unknown, size = 500) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, size);
}

function parseErr(error: any): { status: number; message: string } {
  const message = String(error?.message ?? "withdraw_refund_failed");
  if (message === "refund_request_not_found") return { status: 404, message };
  if (message === "refund_request_forbidden") return { status: 403, message };
  if (message.startsWith("invalid_refund_request_state:")) return { status: 409, message };
  if (message === "refund_request_conflict") return { status: 409, message };
  // 예상치 못한 에러는 내부 정보 노출 방지를 위해 일반 메시지 반환
  return { status: 500, message: "withdraw_refund_failed" };
}

export async function POST(req: Request, ctx: any) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  const refundId = await readRefundIdFromContext(ctx);
  if (!refundId) return bad(400, "invalid_refund_id");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  try {
    const request = await withdrawRefundRequestByUser({
      id: refundId,
      userId,
      note: clean(body?.note),
    });
    return NextResponse.json({
      ok: true,
      data: {
        request,
      },
    });
  } catch (error: any) {
    const parsed = parseErr(error);
    return bad(parsed.status, parsed.message);
  }
}
