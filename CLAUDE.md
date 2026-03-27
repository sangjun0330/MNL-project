<!--
Keep this root file short and broadly applicable.
If project instructions become too large, move path-specific guidance into .claude/rules/ or focused docs.
-->

# RNest

## Product Identity
- RNest is a Korean, mobile-first nurse/shift-worker recovery platform, not a generic wellness demo.
- Core surfaces: Home, Schedule, Insights/Recovery Planner, Tools (AI clinical search, notebook, nurse calculators), Social/Groups/Challenges, Shop/Orders, Billing/Admin.
- Preserve the current product tone: practical, calm, supportive, clinically cautious, and Korean-first by default.
- Preserve the current visual language: light UI, rounded cards, soft shadows, lavender accent, Apple-like spacing/motion, and phone-first flows.

## Stack
- Next.js 15 App Router + React 19 + TypeScript strict + Tailwind CSS.
- Supabase handles auth, database, storage, and realtime.
- Many API routes run on Edge (`runtime = "edge"`). Avoid Node-only APIs unless you intentionally change runtime and verify deployment impact.
- Payments use TossPayments.
- AI features use the OpenAI Responses API, optionally through Cloudflare AI Gateway helpers.
- Use the `@/*` import alias for `src/*`.

## High-Value Architecture
- Global client state lives in `src/lib/store.ts` and the domain model in `src/lib/model.ts`.
- App bootstrap/auth gating lives in `src/components/shell/AppShell.tsx`, `src/lib/auth.ts`, `/api/user/bootstrap`, and `/api/user/state`.
- Main health-state sync goes through `src/components/system/CloudStateSync.tsx`; notebook sync is separate via `CloudNotebookSync`.
- Recovery/vitals logic lives in `src/lib/bodyBattery.ts`, `src/lib/rnestBatteryEngine.ts`, `src/lib/rnestInsight.ts`, and related `insights*` modules.
- Billing logic lives in `src/lib/billing/*`, `src/lib/server/billing*`, and `src/app/api/billing/*`.
- AI clinical search flows live in `src/components/pages/tools/ToolMedSafetyPage.tsx`, `src/app/api/tools/med-safety/analyze/route.ts`, and `src/lib/server/openaiMedSafety.ts`.
- Shop and social are real product areas, not mock pages. Treat `src/lib/server/shop*`, `src/lib/server/social*`, and matching API routes as production code.
- API routes commonly rely on `src/lib/server/requestSecurity.ts` helpers for `no-store` responses and same-origin mutation checks.
- Supabase schema changes must go through `supabase/migrations/` and stay aligned with `src/types/supabase.ts`.

## Commands
- Install deps: `npm install`
- Dev server: `npm run dev`
- Build check: `npm run build`
- Lint: `npm run lint`
- Optional TS-only check: `npx tsc --noEmit`
- Prefer `npm run build` over raw `next build` because the repo uses `scripts/run-next-build.mjs` and custom prebuild cleanup.
- There is no dedicated `npm test` script today. For risky changes, use build/lint plus targeted manual verification.

## Manual Verification
- Validate the exact affected surface in the browser whenever UI, auth, billing, AI, social, shop, or sync logic changes.
- In local development, `GET /api/dev/login?user=1&redirect=/path` can fast-login seeded test users. This route is development-only.
- For auth/sync changes, verify login, bootstrap, remote state load, local draft fallback, and save/refresh flows.
- For billing changes, verify plan state, checkout start/confirm/fail paths, and admin/refund flows.
- For schema changes, inspect relevant migrations and confirm store/API contracts still line up.

## Product and UX Constraints
- Default to Korean UX and copy unless the task explicitly targets English i18n. Existing bilingual support uses `src/lib/i18n.ts` and `useI18n()`.
- Keep the app mobile-first and PWA-friendly. Many screens rely on bottom sheets, touch interactions, and narrow-width layouts.
- Prefer existing `src/components/ui/*` primitives and RNest tokens in `src/app/globals.css` over ad hoc one-off UI patterns.
- Do not flatten recovery features into generic wellness advice. Shift work, fatigue, sleep debt, menstrual cycle, caffeine, and nurse workflow context are first-class inputs.
- Preserve plan boundaries and value differentiation between Free / Plus / Pro when changing billing or AI access flows.

## Safety, Privacy, and Security
- This repo handles health-like data, account state, payment state, and AI outputs. Be conservative with persistence, logs, and error messages.
- Never commit secrets, tokens, `.env*`, or real user data.
- Never reintroduce tracked local dumps such as `.wnl_*` data.
- Preserve `no-store` response behavior and same-origin checks on mutating routes unless there is a clear, reviewed reason to change them.
- Do not weaken service-consent gates, auth checks, billing entitlement checks, credit/quota accounting, or admin authorization.
- In AI clinical search and recovery flows, keep safety language, sensitive-query blocking, and quota/history-retention logic intact.

## Working Style For This Repo
- For multi-file or ambiguous work, follow: explore first, then plan, then implement, then verify.
- Read the existing local pattern before editing. This codebase is large and mixed; follow nearby conventions instead of imposing a new style.
- Reuse existing helpers, stores, and route utilities before creating parallel abstractions.
- Keep diffs tight. Avoid unrelated refactors unless they are required to safely complete the task.
- If README and code disagree, trust the current `src/`, `docs/`, and `supabase/migrations/` state over the older README summary.

## High-Signal References
- Product scope and monetization context: `docs/rnest-paid-plan-strategy-report.md`
- State/storage flow: `docs/supabase-storage-map.md`
- Main runtime shell: `src/components/shell/AppShell.tsx`
- App state model/store: `src/lib/model.ts`, `src/lib/store.ts`
- Billing plans and entitlements: `src/lib/billing/plans.ts`, `src/lib/billing/entitlements.ts`
- Supabase route/admin clients: `src/lib/server/supabaseRouteClient.ts`, `src/lib/server/supabaseAdmin.ts`

## Keep This File Lean
- Only keep instructions here that change Claude's behavior across many tasks.
- If this file gets large, split path-specific guidance into `.claude/rules/` or focused docs instead of bloating the root memory.
