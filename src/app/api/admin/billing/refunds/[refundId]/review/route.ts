import { NextResponse } from "next/server";
import { markRefundRequestUnderReview } from "@/lib/server/billingStore";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";

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

function parseErr(error: any): { status: number; message: string } {
  const message = String(error?.message ?? "review_refund_failed");
  if (message === "refund_request_not_found") return { status: 404, message };
  if (message.startsWith("invalid_refund_request_state:")) return { status: 409, message };
  if (message === "refund_request_conflict") return { status: 409, message };
  return { status: 500, message };
}

export async function POST(req: Request, ctx: any) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return bad(admin.status, admin.error);

  const refundId = await readRefundIdFromContext(ctx);
  if (!refundId) return bad(400, "invalid_refund_id");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  try {
    const request = await markRefundRequestUnderReview({
      id: refundId,
      adminUserId: admin.identity.userId,
      note: String(body?.note ?? "").trim() || null,
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
