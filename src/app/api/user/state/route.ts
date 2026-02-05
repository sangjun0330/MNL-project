import { NextResponse } from "next/server";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login required");

  try {
    const row = await loadUserState(userId);
    return NextResponse.json({
      ok: true,
      state: row?.payload ?? null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e: any) {
    return bad(500, e?.message || "failed to load");
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid json");
  }

  const userId = await readUserIdFromRequest(req);
  const state = body?.state;

  if (!userId) return bad(401, "login required");
  if (!state) return bad(400, "state required");

  try {
    await saveUserState({ userId, payload: state });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(500, e?.message || "failed to save");
  }
}
