"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/useI18n";

/* ------------------------------------------------------------------ */
/*  Browser / platform detection helpers                               */
/* ------------------------------------------------------------------ */

type Platform = "ios-safari" | "android-chrome" | "chromium" | "samsung" | "firefox" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) return "ios-safari";

  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Firefox/.test(ua) && !(/Seamonkey/.test(ua))) return "firefox";

  // Android Chrome or Chromium-based desktop
  const isChromium = /Chrome/.test(ua) && !/Edg/.test(ua);
  if (/Android/.test(ua) && isChromium) return "android-chrome";
  if (isChromium || /Edg/.test(ua)) return "chromium";

  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PWAInstallButton() {
  const { t } = useI18n();
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const deferredPrompt = useRef<any>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  /* Detect standalone on mount */
  useEffect(() => {
    setInstalled(isStandalone());
    setPlatform(detectPlatform());
  }, []);

  /* Chromium beforeinstallprompt */
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setInstalled(true);
      setCanPrompt(false);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  /* Native chromium install */
  const handleInstall = useCallback(async () => {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const result = await deferredPrompt.current.userChoice;
      if (result.outcome === "accepted") {
        setInstalled(true);
      }
      deferredPrompt.current = null;
      setCanPrompt(false);
    } else {
      setShowGuide(true);
    }
  }, []);

  /* Already installed as PWA */
  if (installed) {
    return (
      <div className="rounded-apple border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-green-500/10">
            <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-bold text-green-800">
              {t("앱으로 실행 중")}
            </div>
            <div className="text-[12.5px] text-green-700/70">
              {t("홈 화면에서 앱으로 실행되고 있어요.")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Install card */}
      <button
        type="button"
        onClick={handleInstall}
        className="w-full rounded-apple border border-ios-sep bg-white p-4 shadow-apple transition-all active:scale-[0.98] hover:translate-y-[-1px] text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
            {/* Download / install icon */}
            <svg className="h-5.5 w-5.5 text-white" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-ios-text">
              {t("앱으로 설치하기")}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ios-sub leading-snug">
              {t("홈 화면에 추가하면 앱처럼 빠르게 실행할 수 있어요.")}
            </div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-ios-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Guide overlay */}
      {showGuide && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 wnl-backdrop" onClick={() => setShowGuide(false)}>
          <div
            className="w-full max-w-[480px] rounded-t-[20px] bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 wnl-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag indicator */}
            <div className="mb-4 flex justify-center">
              <div className="h-[5px] w-[36px] rounded-full bg-gray-300" />
            </div>

            <div className="text-[18px] font-bold text-ios-text mb-1">
              {t("앱으로 설치하기")}
            </div>
            <div className="text-[13px] text-ios-sub mb-4">
              {t("아래 안내를 따라 홈 화면에 추가해 주세요.")}
            </div>

            {/* iOS Safari guide */}
            {(platform === "ios-safari") && (
              <div className="space-y-3">
                <Step n={1} text={t("하단 공유 버튼(□↑)을 탭하세요")} />
                <Step n={2} text={t("'홈 화면에 추가'를 선택하세요")} />
                <Step n={3} text={t("'추가' 버튼을 눌러 완료하세요")} />
              </div>
            )}

            {/* Samsung Browser */}
            {platform === "samsung" && (
              <div className="space-y-3">
                <Step n={1} text={t("오른쪽 하단 메뉴(≡)를 탭하세요")} />
                <Step n={2} text={t("'홈 화면에 추가'를 선택하세요")} />
                <Step n={3} text={t("'추가' 버튼을 눌러 완료하세요")} />
              </div>
            )}

            {/* Firefox */}
            {platform === "firefox" && (
              <div className="space-y-3">
                <Step n={1} text={t("주소창 오른쪽 메뉴(⋯)를 탭하세요")} />
                <Step n={2} text={t("'홈 화면에 추가' 또는 '설치'를 선택하세요")} />
                <Step n={3} text={t("'추가' 버튼을 눌러 완료하세요")} />
              </div>
            )}

            {/* Chrome/Edge/other Chromium without beforeinstallprompt */}
            {(platform === "chromium" || platform === "android-chrome" || platform === "other") && (
              <div className="space-y-3">
                <Step n={1} text={t("주소창 오른쪽 메뉴(⋮)를 탭하세요")} />
                <Step n={2} text={t("'홈 화면에 추가' 또는 '앱 설치'를 선택하세요")} />
                <Step n={3} text={t("'설치' 버튼을 눌러 완료하세요")} />
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-full bg-black py-3 text-[14px] font-semibold text-white transition-all active:scale-[0.97]"
            >
              {t("확인")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Step indicator                                                     */
/* ------------------------------------------------------------------ */

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[13px] font-bold text-white">
        {n}
      </div>
      <div className="pt-0.5 text-[14px] text-ios-text leading-snug">{text}</div>
    </div>
  );
}
