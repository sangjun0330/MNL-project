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

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,

  // ✅ Next.js 15+에서는 allowedDevOrigins가 experimental이 아니라 최상위 옵션입니다.
  // 개발 환경에서 LAN/프록시/리버스프록시로 접속할 때 dev overlay / _next 리소스 차단을 방지합니다.
  allowedDevOrigins,

  // PWA is handled via public/manifest + public/sw.js + runtime registration (no extra deps).
  webpack: (config, { dev }) => {
    if (dev) {
      // Dev 환경에서 webpack cache 파일 오류 방지
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
