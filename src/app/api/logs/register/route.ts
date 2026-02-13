import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  void req;
  return NextResponse.json(
    { ok: false, error: "wnl_daily_logs_disabled_use_user_state" },
    { status: 410 }
  );
}

export async function GET(req: Request) {
  void req;
  return NextResponse.json(
    { ok: false, error: "wnl_daily_logs_disabled_use_user_state" },
    { status: 410 }
  );
}
