import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";
import { AuthProvider } from "@/components/system/AuthProvider";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rnest.kr";
const SHARE_TITLE = "RNest | Shift Worker Recovery Coach";
const SHARE_DESCRIPTION =
  "AI-powered recovery guidance from your health logs, shift schedule, and cycle data.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SHARE_TITLE,
  description: SHARE_DESCRIPTION,
  applicationName: "RNest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "RNest",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "RNest app preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: ["/opengraph-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "RNest",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // middleware.ts에서 설정한 nonce를 읽어 Next.js의 내부 스크립트에 전달
  // https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <html lang="ko">
      <head>
        {/* Next.js가 이 nonce를 자신이 생성하는 인라인 스크립트에 자동으로 적용 */}
        {nonce && <meta property="csp-nonce" content={nonce} />}
      </head>
      <body>
        <AuthProvider>
          <PWARegister />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
