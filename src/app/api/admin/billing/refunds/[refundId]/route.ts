import { NextResponse } from "next/server";
import { listRefundEventsByRequestId, readRefundRequestById } from "@/lib/server/billingStore";
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

function toLimit(value: string | null): number {
  const n = Number(value ?? "100");
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(300, Math.round(n)));
}

export async function GET(req: Request, ctx: any) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return bad(admin.status, admin.error);

  const refundId = await readRefundIdFromContext(ctx);
  if (!refundId) return bad(400, "invalid_refund_id");

  const url = new URL(req.url);
  const eventLimit = toLimit(url.searchParams.get("eventLimit"));

  try {
    const request = await readRefundRequestById(refundId);
    if (!request) return bad(404, "refund_request_not_found");

    const events = await listRefundEventsByRequestId(refundId, eventLimit);
    return NextResponse.json({
      ok: true,
      data: {
        request,
        events,
      },
    });
  } catch (error: any) {
    return bad(500, String(error?.message ?? "failed_to_read_refund_request"));
  }
}
