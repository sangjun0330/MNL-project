import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { readAdminAIBillingSummary } from "@/lib/server/billingAnalyticsStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const admin = await requireBillingAdmin(req);
  if (!admin.ok) return bad(admin.status, admin.error);

  const url = new URL(req.url);
  const rangeDays = Number(url.searchParams.get("rangeDays") ?? "30");

  try {
    const summary = await readAdminAIBillingSummary(rangeDays);
    return NextResponse.json({
      ok: true,
      data: {
        summary,
      },
    });
  } catch {
    return bad(500, "failed_to_read_ai_billing_summary");
  }
}
