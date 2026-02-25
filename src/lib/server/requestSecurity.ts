import { NextResponse } from "next/server";

const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";

export function buildPrivateNoStoreHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
  headers.set("Pragma", "no-cache");
  return headers;
}

export function jsonNoStore<T>(body: T, init: ResponseInit = {}) {
  const { headers, ...rest } = init;
  return NextResponse.json(body, {
    ...rest,
    headers: buildPrivateNoStoreHeaders(headers),
  });
}

export function sameOriginRequestError(req: Request): string | null {
  const expectedOrigin = new URL(req.url).origin;

  const origin = String(req.headers.get("origin") ?? "").trim();
  if (origin) {
    return origin === expectedOrigin ? null : "invalid_origin";
  }

  const referer = String(req.headers.get("referer") ?? "").trim();
  if (!referer) return "missing_origin";

  try {
    return new URL(referer).origin === expectedOrigin ? null : "invalid_referer_origin";
  } catch {
    return "invalid_referer";
  }
}
