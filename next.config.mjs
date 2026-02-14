/** @type {import('next').NextConfig} */
const allowedFromEnv = process.env.NEXT_ALLOWED_DEV_ORIGINS
  ? process.env.NEXT_ALLOWED_DEV_ORIGINS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

// 개발 중엔 기본 로컬 오리진은 항상 허용
const devDefaults = ["http://localhost:3000", "http://127.0.0.1:3000"];

const allowedDevOrigins =
  process.env.NODE_ENV === "development"
    ? Array.from(new Set([...devDefaults, ...allowedFromEnv]))
    : allowedFromEnv;

function toOrigin(input) {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = toOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const connectSources = ["'self'"];
if (supabaseOrigin) {
  connectSources.push(supabaseOrigin);
  connectSources.push(supabaseOrigin.replace(/^http/i, "ws"));
}

const isDev = process.env.NODE_ENV === "development";
const scriptSources = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const handoffNoStoreHeaders = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Pragma", value: "no-cache" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
];

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,

  // ✅ Next.js 15+에서는 allowedDevOrigins가 experimental이 아니라 최상위 옵션입니다.
  // 개발 환경에서 LAN/프록시/리버스프록시로 접속할 때 dev overlay / _next 리소스 차단을 방지합니다.
  allowedDevOrigins,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/tools/handoff",
        headers: handoffNoStoreHeaders,
      },
      {
        source: "/tools/handoff/:path*",
        headers: handoffNoStoreHeaders,
      },
      {
        source: "/handoff",
        headers: handoffNoStoreHeaders,
      },
      {
        source: "/handoff/:path*",
        headers: handoffNoStoreHeaders,
      },
      {
        source: "/settings/billing/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },

  // PWA is handled via public/manifest + public/sw.js + runtime registration (no extra deps).
};

export default nextConfig;
