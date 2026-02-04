import { NextResponse } from "next/server";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function readUserId(): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return "";

  const supabase = await getRouteSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "";
}

export async function GET(req: Request) {
  const userId = await readUserId();
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

  const userId = await readUserId();
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
