"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/useI18n";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type InstallPlatform = "ios-safari" | "ios-other" | "android-chrome" | "android-other" | "desktop";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
}

function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;

  if (isIOS()) {
    return isIOSSafari() ? "ios-safari" : "ios-other";
  }
  if (isAndroid()) {
    if (/Chrome|CriOS|EdgA|EdgiOS/i.test(ua) && !/SamsungBrowser/i.test(ua)) {
      return "android-chrome";
    }
    return "android-other";
  }
  return "desktop";
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
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const deferredPrompt = useRef<any>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setPlatform(detectInstallPlatform());
  }, []);

  /* Chromium beforeinstallprompt — 버튼 한 번으로 바로 설치 */
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setCanPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const done = () => {
      setInstalled(true);
      setCanPrompt(false);
    };
    window.addEventListener("appinstalled", done);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    // Chrome/Edge: 네이티브 설치 팝업 바로 실행
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const result = await deferredPrompt.current.userChoice;
      if (result.outcome === "accepted") setInstalled(true);
      deferredPrompt.current = null;
      setCanPrompt(false);
      return;
    }
    // 수동 설치 안내
    setShowGuide(true);
  }, []);

  /* 이미 앱으로 실행 중 → 아무것도 렌더링하지 않음 */
  if (installed) return null;

  /* 모바일 브라우저에서만 노출 */
  if (platform === "desktop") return null;

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className="w-full rounded-apple border border-ios-sep bg-white p-4 shadow-apple transition-all active:scale-[0.98] hover:translate-y-[-1px] text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md">
            <svg className="text-white" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
              {canPrompt
                ? t("한 번 탭하면 바로 설치할 수 있어요.")
                : t("한 번 탭하면 홈 화면 추가 방법을 바로 안내해요.")}
            </div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-ios-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 wnl-backdrop" onClick={() => setShowGuide(false)}>
          <div
            className="w-full max-w-[480px] rounded-t-[20px] bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 wnl-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex justify-center">
              <div className="h-[5px] w-[36px] rounded-full bg-gray-300" />
            </div>

            <div className="text-[17px] font-bold text-ios-text mb-3">
              {t("앱으로 설치하기")}
            </div>

            <div className="space-y-2.5">
              {platform === "ios-safari" ? (
                <>
                  <Step n={1} text={t("하단 공유 버튼(□↑)을 탭하세요")} />
                  <Step n={2} text={t("'홈 화면에 추가'를 선택하세요")} />
                  <Step n={3} text={t("'추가' 버튼을 눌러 완료하세요")} />
                </>
              ) : null}

              {platform === "ios-other" ? (
                <>
                  <Step n={1} text={t("브라우저 메뉴(⋯) 또는 공유 버튼을 탭하세요")} />
                  <Step n={2} text={t("'홈 화면에 추가'를 선택하세요")} />
                  <Step n={3} text={t("메뉴에 없으면 Safari에서 같은 주소를 열어 추가하세요")} />
                </>
              ) : null}

              {platform === "android-chrome" ? (
                <>
                  <Step n={1} text={t("화면 하단의 '설치' 버튼이 보이면 먼저 탭하세요")} />
                  <Step n={2} text={t("보이지 않으면 주소창 오른쪽 메뉴(⋮)를 탭하세요")} />
                  <Step n={3} text={t("'앱 설치' 또는 '홈 화면에 추가'를 선택하세요")} />
                </>
              ) : null}

              {platform === "android-other" ? (
                <>
                  <Step n={1} text={t("브라우저 메뉴(⋮)를 탭하세요")} />
                  <Step n={2} text={t("'홈 화면에 추가' 또는 '설치'를 선택하세요")} />
                  <Step n={3} text={t("'설치' 또는 '추가' 버튼을 눌러 완료하세요")} />
                </>
              ) : null}
            </div>

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

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[13px] font-bold text-white">
        {n}
      </div>
      <div className="text-[14px] text-ios-text">{text}</div>
    </div>
  );
}
