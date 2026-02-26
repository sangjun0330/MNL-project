import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next.js 미들웨어는 항상 Edge Runtime에서 실행됨 — 'runtime' 선언 불필요

function toBase64(bytes: Uint8Array): string {
  let str = "";
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }
  return btoa(str);
}

function buildCSP(
  nonce: string,
  options?: {
    styleAuditReportOnly?: boolean;
    enforceStrictStyle?: boolean;
  },
): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supabaseOrigin = "";
  if (supabaseUrl) {
    try {
      supabaseOrigin = new URL(supabaseUrl).origin;
    } catch {
      // ignore malformed URL
    }
  }

  const tossScriptOrigin = "https://js.tosspayments.com";
  const tossApiOrigin = "https://api.tosspayments.com";
  const tossWildcard = "https://*.tosspayments.com";
  const tossLegacyPayOrigin = "https://pay.toss.im";

  const connectSources = [
    "'self'",
    "https://cloudflareinsights.com",
    tossApiOrigin,
    tossWildcard,
    tossLegacyPayOrigin,
  ];
  if (supabaseOrigin) {
    connectSources.push(supabaseOrigin);
    connectSources.push(supabaseOrigin.replace(/^http/i, "ws"));
  }

  const isDev = process.env.NODE_ENV === "development";

  // 'strict-dynamic': nonce로 신뢰된 스크립트가 동적으로 로드하는 스크립트도 허용
  // 이를 통해 Next.js가 청크를 동적으로 로드할 수 있게 됨
  const scriptSrcParts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://static.cloudflareinsights.com", tossScriptOrigin, tossWildcard];
  // 개발 환경에서만 unsafe-inline/eval 허용 (HMR, React DevTools 등)
  if (isDev) {
    scriptSrcParts.push("'unsafe-inline'", "'unsafe-eval'");
  }

  const styleDirectives = options?.styleAuditReportOnly
    ? [
        // 다음 단계 준비용 감사: 인라인 style 속성까지 제거 가능한지 Report-Only로 관찰
        "style-src 'self'",
        `style-src-elem 'self' 'nonce-${nonce}'`,
        "style-src-attr 'none'",
      ]
    : options?.enforceStrictStyle
      ? [
          // 단계적 강화: <style> 요소는 nonce 필요, React inline style 속성은 임시 허용
          "style-src 'self'",
          `style-src-elem 'self' 'nonce-${nonce}'`,
          "style-src-attr 'unsafe-inline'",
        ]
      : ["style-src 'self' 'unsafe-inline'"];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSrcParts.join(" ")}`,
    ...styleDirectives,
    `img-src 'self' data: blob: https://cloudflareinsights.com ${tossWildcard}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    `frame-src 'self' ${tossWildcard} ${tossLegacyPayOrigin}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = toBase64(bytes);
  const csp = buildCSP(nonce, { enforceStrictStyle: true });
  const cspReportOnly = buildCSP(nonce, { styleAuditReportOnly: true });

  // nonce를 request header로 전달해 layout.tsx에서 읽을 수 있도록 함
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  // 무중단 스타일 CSP 강화 단계: 위반은 차단하지 않고 관찰만 수행
  response.headers.set("Content-Security-Policy-Report-Only", cspReportOnly);
  // response header에도 포함: 일부 CDN/캐시 레이어에서 활용 가능
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    {
      // 정적 파일과 Next.js 내부 경로는 미들웨어 생략
      source: "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
