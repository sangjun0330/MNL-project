import { NextResponse } from "next/server";
import { requireSocialAdmin } from "@/lib/server/socialAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireSocialAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ ok: true, data: { isAdmin: false } });
  }
  return NextResponse.json({ ok: true, data: { isAdmin: true } });
}
