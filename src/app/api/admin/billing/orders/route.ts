import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { listBillingOrdersForAdmin, type BillingOrderStatus } from "@/lib/server/billingStore";
import type { BillingOrderKind } from "@/lib/billing/plans";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const STATUS_MAP: Record<string, BillingOrderStatus> = {
  ready: "READY",
  done: "DONE",
  failed: "FAILED",
  canceled: "CANCELED",
};

function normalizeStatus(value: string | null): BillingOrderStatus | null {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return null;
  return STATUS_MAP[key] ?? null;
}

function normalizeOrderKind(value: string | null): BillingOrderKind | null {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return null;
  if (key === "subscription" || key === "credit_pack") return key;
  return null;
}

function toLimit(value: string | null): number {
  const n = Number(value ?? "120");
  if (!Number.isFinite(n)) return 120;
  return Math.max(1, Math.min(300, Math.round(n)));
}

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return bad(admin.status, admin.error);

  const url = new URL(req.url);
  const status = normalizeStatus(url.searchParams.get("status"));
  const orderKind = normalizeOrderKind(url.searchParams.get("orderKind"));
  const userId = String(url.searchParams.get("userId") ?? "").trim() || null;
  const limit = toLimit(url.searchParams.get("limit"));

  try {
    const orders = await listBillingOrdersForAdmin({
      status,
      orderKind,
      userId,
      limit,
    });
    return NextResponse.json({
      ok: true,
      data: {
        orders,
      },
    });
  } catch (error: any) {
    return bad(500, String(error?.message ?? "failed_to_list_admin_orders"));
  }
}

