"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
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
    <div ref={rootRef} className="relative z-[70]">
      <button
        type="button"
        data-auth-allow
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-[30px] items-center gap-1 rounded-full border border-[#cad6e2] bg-[#f9fbfd] px-2 text-[11px] font-semibold text-[#425a76] transition hover:bg-white"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("언어")}
      >
        <span className="leading-none">{currentLabel}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[11px] w-[11px]">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[80] min-w-[58px] rounded-2xl border border-[#d9e2ec] bg-white p-1 shadow-[0_12px_28px_rgba(17,41,75,0.1)]">
          <button
            type="button"
            data-auth-allow
            onClick={() => {
              store.setSettings({ language: nextLang });
              setOpen(false);
            }}
            className="flex w-full items-center justify-center rounded-xl px-2 py-1.5 text-center text-[10.5px] font-semibold text-[#425a76] transition hover:bg-[#f4f8fb]"
            role="menuitem"
          >
            <span>{nextLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ShopLanguageSwitcher;
