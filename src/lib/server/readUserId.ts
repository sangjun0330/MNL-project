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
    const { data, error } = await supabase.auth.getUser(bearer);
    if (!error && data.user?.id) return data.user.id;
  }

  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? "";
}
