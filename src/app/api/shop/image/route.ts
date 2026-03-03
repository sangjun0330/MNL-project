import { jsonNoStore } from "@/lib/server/requestSecurity";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isBlockedHost(hostname: string) {
  const lower = hostname.toLowerCase();
  if (!lower) return true;
  if (lower === "localhost" || lower === "::1" || lower === "[::1]") return true;
  if (lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (isPrivateIpv4(lower)) return true;
  return false;
}

function sanitizeSource(raw: string | null) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isBlockedHost(url.hostname)) return null;
    if (url.port && url.port !== "80" && url.port !== "443") return null;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const src = sanitizeSource(new URL(req.url).searchParams.get("src"));
  if (!src) {
    return jsonNoStore({ ok: false, error: "invalid_image_src" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), 10_000);

  try {
    const upstream = await fetch(src, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (!upstream.ok) {
      return jsonNoStore({ ok: false, error: "image_fetch_failed" }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return jsonNoStore({ ok: false, error: "invalid_image_content_type" }, { status: 415 });
    }

    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return jsonNoStore({ ok: false, error: "image_fetch_failed" }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
