import { NextResponse } from "next/server";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { jsonNoStore } from "@/lib/server/requestSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
  }
  return jsonNoStore({ ok: true, userId });
}
