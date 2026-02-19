import { NextResponse } from "next/server";
import { readBillingOrderByOrderIdAny, rejectRefundRequest } from "@/lib/server/billingStore";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { sendRefundRejectedNotification } from "@/lib/server/refundNotification";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

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
  const message = String(error?.message ?? "reject_refund_failed");
  if (message === "refund_request_not_found") return { status: 404, message };
  if (message.startsWith("invalid_refund_request_state:")) return { status: 409, message };
  if (message === "refund_request_conflict") return { status: 409, message };
  return { status: 500, message };
}

async function readEmailByUserId(userId: string): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return null;
    return data.user?.email ?? null;
  } catch {
    return null;
  }
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

  const reason = String(body?.reason ?? "").trim();
  if (!reason) return bad(400, "reject_reason_required");

  try {
    const request = await rejectRefundRequest({
      id: refundId,
      adminUserId: admin.identity.userId,
      reason,
      note: String(body?.note ?? "").trim() || null,
    });

    const [order, requesterEmail] = await Promise.all([
      readBillingOrderByOrderIdAny(request.orderId).catch(() => null),
      readEmailByUserId(request.userId),
    ]);

    const notify = await sendRefundRejectedNotification({
      requestId: request.id,
      userId: request.userId,
      requesterEmail,
      orderId: request.orderId,
      reason,
      amount: Math.max(0, Number(order?.amount ?? request.cancelAmount ?? 0)),
      planTier: order?.planTier ?? "free",
      requestedAt: request.requestedAt,
      rejectedAt: request.reviewedAt ?? new Date().toISOString(),
      reviewNote: request.reviewNote ?? null,
    }).catch((error) => ({ sent: false, message: String((error as any)?.message ?? "notify_failed") }));

    return NextResponse.json({
      ok: true,
      data: {
        request,
        notificationSent: Boolean(notify?.sent),
        notificationMessage: String(notify?.message ?? ""),
      },
    });
  } catch (error: any) {
    const parsed = parseErr(error);
    return bad(parsed.status, parsed.message);
  }
}
