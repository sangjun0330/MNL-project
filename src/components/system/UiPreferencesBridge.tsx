"use client";

import { useEffect } from "react";
import { useAppStoreSelector } from "@/lib/store";
import { setCurrentLanguage } from "@/lib/i18n";

export function UiPreferencesBridge() {
  const theme = useAppStoreSelector((s) => s.settings.theme ?? "light");
  const language = useAppStoreSelector((s) => s.settings.language ?? "ko");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("wnl-night");
    else root.classList.remove("wnl-night");
  }, [theme]);

  useEffect(() => {
    setCurrentLanguage(language);
    if (typeof document === "undefined") return;
    document.documentElement.lang = language === "en" ? "en" : "ko";
  }, [language]);

  return null;
}
