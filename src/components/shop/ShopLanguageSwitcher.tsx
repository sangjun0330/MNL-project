"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { SHOP_ICON_BUTTON } from "@/lib/shopUi";
import { useI18n } from "@/lib/useI18n";

export function ShopLanguageSwitcher() {
  const store = useAppStore();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const currentLabel = lang === "en" ? "EN" : "KR";
  const nextLang = lang === "en" ? "ko" : "en";
  const nextLabel = nextLang === "en" ? "EN" : "KR";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        data-auth-allow
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-[#bfd0e1] bg-white px-2.5 text-[#425a76] shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] transition hover:bg-[#f7fafc]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("언어")}
      >
        <span className={`h-9 w-9 px-0 text-[16px] ${SHOP_ICON_BUTTON}`}>{currentLabel}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 min-w-[84px] rounded-[20px] border-2 border-[#bfd0e1] bg-white p-2 shadow-[0_16px_36px_rgba(17,41,75,0.12)]">
          <button
            type="button"
            data-auth-allow
            onClick={() => {
              store.setSettings({ language: nextLang });
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-[13px] font-semibold text-[#425a76] transition hover:bg-[#eef4fb]"
            role="menuitem"
          >
            <span>{nextLabel}</span>
            <span className="text-[11px] text-[#7b8ea4]">{nextLang === "en" ? "English" : "한국어"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ShopLanguageSwitcher;
