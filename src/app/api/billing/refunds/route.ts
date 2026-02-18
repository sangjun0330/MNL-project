import { NextResponse } from "next/server";
import { listRefundRequestsForUser } from "@/lib/server/billingStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function toLimit(value: string | null): number {
  const n = Number(value ?? "20");
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(50, Math.round(n)));
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  const url = new URL(req.url);
  const limit = toLimit(url.searchParams.get("limit"));

  try {
    const requests = await listRefundRequestsForUser(userId, limit);
    return NextResponse.json({
      ok: true,
      data: {
        requests,
      },
    });
  } catch (error: any) {
    return bad(500, String(error?.message ?? "failed_to_list_refunds"));
  }
}
