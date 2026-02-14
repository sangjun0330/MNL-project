import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.HANDOFF_E2E_PORT ?? 3100);
const HOST = process.env.HANDOFF_E2E_HOST ?? "127.0.0.1";
const BASE_URL = process.env.HANDOFF_E2E_BASE_URL ?? `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: "./e2e/handoff",
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
  },
  webServer: {
    command: `npm run dev -- --hostname ${HOST} --port ${PORT}`,
    port: PORT,
    reuseExistingServer: process.env.HANDOFF_E2E_REUSE_SERVER === "true",
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_HANDOFF_ENABLED: "true",
      NEXT_PUBLIC_HANDOFF_EXECUTION_MODE: "local_only",
      NEXT_PUBLIC_HANDOFF_REMOTE_SYNC_ENABLED: "false",
      NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE: "standard",
      NEXT_PUBLIC_HANDOFF_REQUIRE_AUTH: "false",
      NEXT_PUBLIC_HANDOFF_LOCAL_ASR_ENABLED: "true",
      NEXT_PUBLIC_HANDOFF_EVIDENCE_ENABLED: "true",
      NEXT_PUBLIC_HANDOFF_ASR_PROVIDER: "manual",
      NEXT_PUBLIC_HANDOFF_WEB_AUDIO_CAPTURE_ENABLED: "false",
      NEXT_PUBLIC_HANDOFF_WASM_ASR_ENABLED: "false",
      NEXT_PUBLIC_AUTH_INTERACTION_GUARD_ENABLED: "false",
    },
  },
});
