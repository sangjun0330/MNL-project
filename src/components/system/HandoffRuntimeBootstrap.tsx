"use client";

import { useEffect } from "react";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { evaluateHandoffPrivacyPolicy } from "@/lib/handoff/privacyPolicy";
import { initWebLlmMlcBackend } from "@/lib/handoff/webLlmMlcBackend";

const WEBLLM_BACKEND_DEFAULT_URL = "/runtime/webllm-refine-backend.js";
const WEBLLM_ADAPTER_DEFAULT_URL = "/runtime/webllm-refine-adapter.js";
const WEBLLM_BACKEND_SCRIPT_ID = "wnl-handoff-webllm-backend";
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
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  const absolute = new URL(url, window.location.origin).href;
  if (existing?.src === absolute) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`failed_to_load_${id}`)), { once: true });
    });
  }

  if (existing) {
    existing.remove();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = url;
    script.async = false;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.dataset.loaded = "false";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`failed_to_load_${id}`)),
      { once: true }
    );
    document.head.appendChild(script);
  });
}

export function HandoffRuntimeBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!HANDOFF_FLAGS.handoffEnabled) return;
    if (!HANDOFF_FLAGS.handoffWebLlmRefineEnabled) return;

    const policy = evaluateHandoffPrivacyPolicy(HANDOFF_FLAGS);
    const configuredBackendUrl = parseUrl(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_BACKEND_URL);
    const configuredUrl = parseUrl(process.env.NEXT_PUBLIC_HANDOFF_WEBLLM_ADAPTER_URL);
    const backendUrl = configuredBackendUrl || WEBLLM_BACKEND_DEFAULT_URL;
    const adapterUrl = configuredUrl || WEBLLM_ADAPTER_DEFAULT_URL;

    if (!backendUrl || !adapterUrl) return;

    const backendSameOriginReady = isRelativeOrSameOrigin(backendUrl, window.location.origin);
    const adapterSameOriginReady = isRelativeOrSameOrigin(adapterUrl, window.location.origin);
    const useMlcBackend = HANDOFF_FLAGS.handoffWebLlmUseMlc;
    if ((policy.profile === "strict" || policy.executionMode === "local_only") && !adapterSameOriginReady) {
      console.warn("[handoff-runtime] blocked cross-origin WebLLM adapter in strict/local_only mode", adapterUrl);
      return;
    }

    if (useMlcBackend) {
      initWebLlmMlcBackend();
    }

    void (async () => {
      if (!useMlcBackend) {
        if ((policy.profile === "strict" || policy.executionMode === "local_only") && !backendSameOriginReady) {
          console.warn("[handoff-runtime] blocked cross-origin WebLLM backend in strict/local_only mode", backendUrl);
        } else {
          try {
            await ensureScript(backendUrl, WEBLLM_BACKEND_SCRIPT_ID);
          } catch (error) {
            // backend script is optional; adapter can still run with local heuristic fallback
            console.warn("[handoff-runtime] failed to load webllm backend script", error);
          }
        }
      }

      try {
        await ensureScript(adapterUrl, WEBLLM_ADAPTER_SCRIPT_ID);
      } catch (error) {
        console.warn("[handoff-runtime] failed to bootstrap webllm adapter", error);
      }
    })();
  }, []);

  return null;
}

export default HandoffRuntimeBootstrap;
