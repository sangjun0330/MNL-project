"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

export function SettingsGeneralPage() {
  const store = useAppStore();
  const { t } = useI18n();
  const theme = store.settings.theme ?? "light";
  const language = store.settings.language ?? "ko";

  const generalOptions = useMemo(
    () => [
      { value: "light", label: t("라이트 모드") },
      { value: "dark", label: t("다크 모드") },
    ],
    [t]
  );

  const languageOptions = useMemo(
    () => [
      { value: "ko", label: t("한국어") },
      { value: "en", label: t("영어 (미국)") },
    ],
    [t]
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/settings" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text">
          ←
        </Link>
        <div className="flex items-center gap-2 text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.02.02a2 2 0 0 1 0 2.82 2 2 0 0 1-2.82 0l-.02-.02a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a2 2 0 0 1-4 0v-.04a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.02.02a2 2 0 1 1-2.82-2.82l.02-.02a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a2 2 0 0 1 0-4h.04a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.02-.02a2 2 0 0 1 0-2.82 2 2 0 0 1 2.82 0l.02.02a1.6 1.6 0 0 0 1.76.32h.01a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 0 1 4 0v.04a1.6 1.6 0 0 0 .98 1.46h.01a1.6 1.6 0 0 0 1.76-.32l.02-.02a2 2 0 1 1 2.82 2.82l-.02.02a1.6 1.6 0 0 0-.32 1.76v.01a1.6 1.6 0 0 0 1.46.97H21a2 2 0 0 1 0 4h-.04a1.6 1.6 0 0 0-1.46.98z" />
          </svg>
          {t("일반")}
        </div>
      </div>

      <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
        <div className="space-y-4">
          <div>
            <div className="text-[13px] font-semibold text-ios-text">{t("모드 설정")}</div>
            <div className="mt-2">
              <Segmented
                value={theme}
                options={generalOptions}
                onValueChange={(v) => store.setSettings({ theme: v as "light" | "dark" })}
              />
            </div>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ios-text">{t("언어")}</div>
            <div className="mt-2">
              <Segmented
                value={language}
                options={languageOptions}
                onValueChange={(v) => store.setSettings({ language: v as "ko" | "en" })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsGeneralPage;

