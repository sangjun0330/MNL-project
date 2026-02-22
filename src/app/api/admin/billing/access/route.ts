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
    if (
      admin.error === "login_required" ||
      admin.error === "admin_forbidden" ||
      admin.error === "forbidden" ||
      admin.error === "billing_admin_not_configured"
    ) {
      return NextResponse.json({
        ok: true,
        data: {
          isAdmin: false,
          reason: admin.error,
        },
      });
    }
    return bad(admin.status, admin.error);
  }

  return NextResponse.json({
    ok: true,
    data: {
      isAdmin: true,
      userId: admin.identity.userId,
      email: admin.identity.email,
    },
  });
}
