import { NextResponse } from "next/server";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { serializeStateForSupabase } from "@/lib/statePersistence";

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
    const sanitized = row?.payload ? sanitizeStatePayload(row.payload) : null;
    return NextResponse.json({
      ok: true,
      state: sanitized,
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
    const serialized = serializeStateForSupabase(state);
    await saveUserState({ userId, payload: serialized });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return bad(500, e?.message || "failed to save");
  }
}
