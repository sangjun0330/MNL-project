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

// Content-Security-Policy는 src/middleware.ts에서 요청별 nonce와 함께 동적으로 설정됩니다.
// 여기서는 CSP 이외의 보안 헤더만 정적으로 선언합니다.

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Content-Security-Policy: middleware.ts에서 요청별 nonce와 함께 동적으로 설정됨
];

const nextConfig = {
  eslint: { ignoreDuringBuilds: false },
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
