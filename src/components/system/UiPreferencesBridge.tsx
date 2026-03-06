"use client";

import { useEffect } from "react";
import { useAppStoreSelector } from "@/lib/store";
import { setCurrentLanguage } from "@/lib/i18n";

export function UiPreferencesBridge() {
  const language = useAppStoreSelector((s) => s.settings.language ?? "ko");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("rnest-night");
  }, []);

  useEffect(() => {
    setCurrentLanguage(language);
    if (typeof document === "undefined") return;
    document.documentElement.lang = language === "en" ? "en" : "ko";
  }, [language]);

  return null;
}
