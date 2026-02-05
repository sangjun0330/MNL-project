import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export async function getRouteSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    throw new Error("Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value ?? null;
      },
      set(name: string, value: string, options: CookieOptions) {
        const store: any = cookieStore;
        if (typeof store.set !== "function") return;
        store.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        const store: any = cookieStore;
        if (typeof store.set !== "function") return;
        store.set({ name, value: "", ...options });
      },
    },
  });
}
