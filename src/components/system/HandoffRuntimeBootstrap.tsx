"use client";

import { useEffect } from "react";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { evaluateHandoffPrivacyPolicy } from "@/lib/handoff/privacyPolicy";

const WEBLLM_ADAPTER_DEFAULT_URL = "/runtime/webllm-refine-adapter.js";
const WEBLLM_ADAPTER_SCRIPT_ID = "wnl-handoff-webllm-adapter";

function parseUrl(input: string | undefined) {
  const value = String(input ?? "").trim();
  if (!value) return "";
  return value;
}

function isRelativeOrSameOrigin(url: string, origin: string) {
  if (!url) return false;
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) return true;
  try {
    const parsed = new URL(url, origin);
    return parsed.origin === origin;
  } catch {
    return false;
  }
}

function ensureScript(url: string, id: string) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.src === new URL(url, window.location.origin).href) {
    return;
  }

  if (existing) {
    existing.remove();
  }

  const script = document.createElement("script");
  script.id = id;
  script.src = url;
  script.async = true;
  script.defer = true;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}

export function HandoffRuntimeBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!HANDOFF_FLAGS.handoffEnabled) return;
    if (!HANDOFF_FLAGS.handoffWebLlmRefineEnabled) return;

    const policy = evaluateHandoffPrivacyPolicy(HANDOFF_FLAGS);
    const configuredUrl = parseUrl(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_ADAPTER_URL);
    const adapterUrl = configuredUrl || WEBLLM_ADAPTER_DEFAULT_URL;

    if (!adapterUrl) return;

    const sameOriginReady = isRelativeOrSameOrigin(adapterUrl, window.location.origin);
    if ((policy.profile === "strict" || policy.executionMode === "local_only") && !sameOriginReady) {
      console.warn("[handoff-runtime] blocked cross-origin WebLLM adapter in strict/local_only mode", adapterUrl);
      return;
    }

    ensureScript(adapterUrl, WEBLLM_ADAPTER_SCRIPT_ID);
  }, []);

  return null;
}

export default HandoffRuntimeBootstrap;
