"use client";

import { useMemo } from "react";
import { useAppStoreSelector } from "@/lib/store";
import { translate } from "@/lib/i18n";

export function useI18n() {
  const lang = useAppStoreSelector((s) => s.settings.language ?? "ko");
  const t = useMemo(
    () => (key: string, vars?: Record<string, string | number>) => translate(key, vars, lang),
    [lang]
  );
  return { t, lang };
}
