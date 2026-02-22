import { getRouteSupabaseClient } from "@/lib/server/supabaseRouteClient";

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return null;
  return scheme.toLowerCase() === "bearer" ? token : null;
}

export async function readUserIdFromRequest(req: Request): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return "";

  const supabase = await getRouteSupabaseClient();
  const bearer = extractBearerToken(req);

  if (bearer) {
    // Bearer 토큰이 명시적으로 제공된 경우: 해당 토큰으로만 인증.
    // 토큰이 무효하더라도 cookie 기반 인증으로 폴스루하지 않아
    // 토큰 위조나 세션 혼용 공격을 방지한다.
    const { data, error } = await supabase.auth.getUser(bearer);
    if (!error && data.user?.id) return data.user.id;
    return "";
  }

  // Bearer 토큰이 없을 때만 cookie 기반 인증 시도
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "";
}
