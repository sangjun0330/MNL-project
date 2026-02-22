import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { listDueRetryableRefundRequests } from "@/lib/server/billingStore";
import { executeRefundRequest, toExecuteRefundHttpError } from "@/lib/server/refundExecution";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function clean(value: unknown, size = 220) {
  return String(value ?? "").trim().slice(0, size);
}

function toLimit(value: unknown, fallback = 10): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(30, Math.round(n)));
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) {
    let diff = 0;
    for (let i = 0; i < Math.max(aBytes.length, bBytes.length); i++) {
      diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function readCronAuthorization(req: Request): { ok: true; actorUserId: string } | { ok: false } {
  const expected = clean(process.env.BILLING_RETRY_CRON_SECRET, 180);
  if (!expected) return { ok: false };
  const token = clean(req.headers.get("x-billing-cron-secret"), 180);
  if (!token || !timingSafeEqual(token, expected)) return { ok: false };
  return { ok: true, actorUserId: "system:refund-retry-cron" };
}

export async function POST(req: Request) {
  const cronAuth = readCronAuthorization(req);
  let actorUserId = cronAuth.ok ? cronAuth.actorUserId : "";

  if (!cronAuth.ok) {
    const admin = await requireBillingAdmin(req);
    if (!admin.ok) return bad(admin.status, admin.error);
    actorUserId = admin.identity.userId;
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const limit = toLimit(body?.limit, 10);
  const dryRun = Boolean(body?.dryRun);

  try {
    const dueRequests = await listDueRetryableRefundRequests(limit);
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        data: {
          dryRun: true,
          count: dueRequests.length,
          requests: dueRequests.map((r) => ({
            id: r.id,
            orderId: r.orderId,
            status: r.status,
            retryCount: r.retryCount,
            nextRetryAt: r.nextRetryAt,
          })),
        },
      });
    }

    const note = cronAuth.ok ? "자동 재시도 배치 실행" : "관리자 수동 재시도 배치 실행";
    const items: Array<Record<string, unknown>> = [];
    let successCount = 0;
    let failCount = 0;

    for (const request of dueRequests) {
      try {
        const result = await executeRefundRequest({
          refundId: request.id,
          actorUserId,
          note,
          allowedRequestStatuses: ["FAILED_RETRYABLE", "APPROVED", "EXECUTING"],
          requestAcceptLanguage: req.headers.get("accept-language"),
        });
        successCount += 1;
        items.push({
          refundId: request.id,
          status: "ok",
          cancelStatus: result.cancelStatus,
          alreadyRefunded: result.alreadyRefunded,
        });
      } catch (error: any) {
        failCount += 1;
        const parsed = toExecuteRefundHttpError(error);
        items.push({
          refundId: request.id,
          status: "error",
          error: parsed.message,
          httpStatus: parsed.status,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        dryRun: false,
        total: dueRequests.length,
        successCount,
        failCount,
        items,
      },
    });
  } catch {
    return bad(500, "retry_batch_failed");
  }
}
