import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { executeRefundRequest, toExecuteRefundHttpError } from "@/lib/server/refundExecution";

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

function clean(value: unknown, size = 220) {
  return String(value ?? "").trim().slice(0, size);
}

function toAmount(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
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

  const note = clean(body?.note, 500) || null;
  const cancelAmount = toAmount(body?.cancelAmount);

  try {
    const result = await executeRefundRequest({
      refundId,
      actorUserId: admin.identity.userId,
      note,
      cancelAmount,
      requestAcceptLanguage: req.headers.get("accept-language"),
    });

    return NextResponse.json({
      ok: true,
      data: {
        request: result.request,
        subscription: result.subscription,
        cancelStatus: result.cancelStatus,
        message: result.alreadyRefunded ? "already_refunded" : "refund_executed",
      },
    });
  } catch (error: any) {
    const parsed = toExecuteRefundHttpError(error);
    return bad(parsed.status, parsed.message);
  }
}
