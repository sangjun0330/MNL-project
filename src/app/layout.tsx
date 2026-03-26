import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "@/components/PWARegister";
import { AuthProvider } from "@/components/system/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";

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
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "RNest app icon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: ["/icons/icon-512.png"],
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

const chunkRecoveryScript = `
(() => {
  try {
    const KEY = "__rnest_chunk_recovery__";
    const buildReloadUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("__rnest_reload", String(Date.now()));
      return url.toString();
    };
    const shouldRecover = (value) => {
      const text =
        typeof value === "string"
          ? value
          : typeof value?.message === "string"
            ? value.message
            : value
              ? String(value)
              : "";
      return /ChunkLoadError|Loading chunk [0-9]+ failed|Failed to fetch dynamically imported module/i.test(text);
    };
    const cleanupAndReload = () => {
      const marker = window.location.pathname + window.location.search;
      if (window.sessionStorage.getItem(KEY) === marker) return;
      window.sessionStorage.setItem(KEY, marker);
      const tasks = [];
      if ("serviceWorker" in navigator) {
        tasks.push(
          navigator.serviceWorker
            .getRegistrations()
            .then((regs) => Promise.allSettled(regs.map((reg) => reg.unregister())))
        );
      }
      if ("caches" in window) {
        tasks.push(
          caches
            .keys()
            .then((keys) =>
              Promise.allSettled(
                keys.filter((key) => /^rnest-cache-/i.test(key)).map((key) => caches.delete(key))
              )
            )
        );
      }
      Promise.allSettled(tasks).finally(() => {
        window.location.replace(buildReloadUrl());
      });
    };

    window.addEventListener(
      "error",
      (event) => {
        const target = event.target;
        if (target instanceof HTMLScriptElement && /\\/[_]next\\/static\\/chunks\\//.test(target.src || "")) {
          cleanupAndReload();
          return;
        }
        if (shouldRecover(event.error)) {
          cleanupAndReload();
        }
      },
      true
    );

    window.addEventListener("unhandledrejection", (event) => {
      if (shouldRecover(event.reason)) {
        cleanupAndReload();
      }
    });

    window.addEventListener(
      "load",
      () => {
        window.sessionStorage.removeItem(KEY);
      },
      { once: true }
    );
  } catch {
    // ignore recovery bootstrap failures
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      </head>
      <body>
        <AuthProvider>
          <PWARegister />
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
