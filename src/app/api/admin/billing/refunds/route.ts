import { NextResponse } from "next/server";
import { listRefundRequestsForAdmin } from "@/lib/server/billingStore";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const STATUS_MAP: Record<string, string> = {
  pending: "REQUESTED",
  requested: "REQUESTED",
  under_review: "UNDER_REVIEW",
  approved: "APPROVED",
  rejected: "REJECTED",
  executing: "EXECUTING",
  refunded: "REFUNDED",
  failed_retryable: "FAILED_RETRYABLE",
  failed_final: "FAILED_FINAL",
  withdrawn: "WITHDRAWN",
};

function normalizeStatus(value: string | null): string | null {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return null;
  return STATUS_MAP[key] ?? String(value).trim().toUpperCase();
}

function toLimit(value: string | null): number {
  const n = Number(value ?? "50");
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(200, Math.round(n)));
}

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return bad(admin.status, admin.error);

  const url = new URL(req.url);
  const status = normalizeStatus(url.searchParams.get("status"));
  const userId = String(url.searchParams.get("userId") ?? "").trim() || null;
  const limit = toLimit(url.searchParams.get("limit"));

  try {
    const requests = await listRefundRequestsForAdmin({ status, userId, limit });
    return NextResponse.json({
      ok: true,
      data: {
        requests,
      },
    });
  } catch (error: any) {
    return bad(500, String(error?.message ?? "failed_to_list_admin_refunds"));
  }
}
