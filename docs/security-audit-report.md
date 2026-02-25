# RNest 보안 감사 리포트 (Security Audit Report)

> **작성일:** 2026-02-23
> **대상 브랜치:** master (commit `1c7ab83` 기준)
> **감사 범위:** 전체 소스코드, git 히스토리, 환경설정, 데이터 파일
> **감사자:** 자동화 보안 분석 (Claude Security Audit)

---

## 요약 (Executive Summary)

| 등급 | 건수 | 즉시 조치 필요 |
|------|------|----------------|
| 🔴 CRITICAL | 3 | ✅ 즉시 |
| 🟠 HIGH | 7 | ✅ 즉시 |
| 🟡 MEDIUM | 5 | 1주일 내 |
| 🔵 LOW | 3 | 1개월 내 |
| **합계** | **18** | |

---

## 🔴 CRITICAL — 즉시 대응 필요

---

### [CRITICAL-1] 실제 사용자 PII/건강정보가 Git 히스토리에 커밋됨

**파일 경로:**
```
.wnl_users/google_USER_ID_REDACTED_gmail_com/state.json
.wnl_logs/google_USER_ID_REDACTED_gmail_com/2026-01-20.json
.wnl_logs/google_USER_ID_REDACTED_gmail_com/2026-01-27.json
.wnl_logs/google_USER_ID_REDACTED_gmail_com/2026-01-29.json
.wnl_logs/google_USER_ID_REDACTED_gmail_com/2026-02-01.json
```

**커밋:** `084a6ef3648c3c8ae155284d4f6986128320363f` ("Rebuild database and refund controls", 2026-02-20)

**노출된 민감 정보:**
```json
// state.json — 이메일, 교대근무 스케줄, 건강정보, 생리주기 전체 포함
{
  "userId": "USER_EMAIL_REDACTED",     // ← 실제 이메일 주소 (PII)
  "payload": {
    "settings": {
      "menstrual": {
        "enabled": true,
        "lastPeriodStart": "2026-01-05",           // ← 생리 시작일 (민감 건강정보)
        "cycleLength": 26,
        "periodLength": 6,
        "lutealLength": 14,
        "pmsDays": 4,
        "sensitivity": 1
      }
    },
    "bio": {
      "2026-01-27": {
        "sleepHours": 6,
        "stress": 2,
        "caffeineMg": 240,
        "symptomSeverity": 3                       // ← 증상 심각도 (건강정보)
      }
    },
    "emotions": { ... },                           // ← 일별 감정/기분 기록
    "notes": { ... }                               // ← 개인 메모 (한국어)
  }
}
```

**근본 원인 — .gitignore 경로명 오류:**
```
# .gitignore 현재 설정 (잘못됨)
.rnest_logs      ← 실제 폴더와 이름이 다름
.rnest_users     ← 실제 폴더와 이름이 다름

# 실제 존재하는 폴더
.wnl_logs/       ← gitignore에 없음 → 추적됨
.wnl_users/      ← gitignore에 없음 → 추적됨
```

**위험도:** CRITICAL — 개인정보보호법(PIPA), GDPR 위반 가능. 개발자 이메일 및 민감 건강정보가 git 클론 시 누구나 열람 가능.

**수정 계획:**
1. `.gitignore` 즉시 수정: `.rnest_*` → `.wnl_*` 패턴 추가
2. `git filter-repo` 또는 `BFG Repo-Cleaner`로 git 히스토리에서 파일 완전 제거
3. 원격 저장소 force-push로 히스토리 정정
4. 해당 유저에게 데이터 노출 사실 통보 (법적 의무)

```bash
# 수정 방법 (예시)
pip install git-filter-repo
git filter-repo --path .wnl_users --invert-paths
git filter-repo --path .wnl_logs --invert-paths
git push origin --force --all
```

---

### [CRITICAL-2] 결제 Order ID 생성에 암호학적으로 안전하지 않은 난수 사용

**파일:** `src/app/api/billing/checkout/route.ts:17`

**문제 코드:**
```typescript
function buildOrderId(productId: "pro" | "credit10") {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);  // ← Math.random() 사용
  return `rnest_${productId}_${stamp}_${rand}`.slice(0, 64);
}
```

**관련 파일:** `src/app/api/tools/med-safety/analyze/route.ts:232`
```typescript
id: `msr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
// ← AI 콘텐츠 ID에도 Math.random() 사용
```

**위험도:** HIGH → CRITICAL
`Math.random()`은 PRNG(의사 난수 생성기)로 예측 가능합니다. 공격자가 타임스탬프를 알고 있다면 Order ID를 예측하여 주문을 탈취하거나 조작할 수 있습니다.

**수정 계획:**
```typescript
// ❌ 현재 (예측 가능)
const rand = Math.random().toString(36).slice(2, 10);

// ✅ 수정 후 (암호학적으로 안전)
import { randomBytes } from 'crypto';  // Node.js
// 또는 Edge Runtime에서는:
const randBytes = crypto.getRandomValues(new Uint8Array(8));
const rand = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
```

---

---

### [CRITICAL-3] 관리자 이메일 주소 소스코드에 하드코딩

**파일:** `src/lib/server/refundNotification.ts:27`

**문제 코드:**
```typescript
const REFUND_ADMIN_EMAIL = "REFUND_ADMIN_EMAIL_REDACTED";  // ← 실제 관리자 이메일 하드코딩
```

**위험도:** CRITICAL
관리자 이메일이 소스코드에 그대로 포함되어 있습니다. 저장소 접근 권한이 있는 누구나 이를 확인할 수 있으며:
- 타깃형 피싱(Spear Phishing) 공격 대상이 됨
- 스팸/소셜 엔지니어링 공격에 악용 가능
- 개인정보(PII)를 코드베이스에 포함하는 것은 보안 정책 위반

**수정 계획:**
```typescript
// ❌ 현재
const REFUND_ADMIN_EMAIL = "REFUND_ADMIN_EMAIL_REDACTED";

// ✅ 수정 후 — 환경변수로 이동
const REFUND_ADMIN_EMAIL = process.env.REFUND_ADMIN_EMAIL ?? "";
if (!REFUND_ADMIN_EMAIL) {
  console.error("[RefundNotification] REFUND_ADMIN_EMAIL not configured");
}
```

`.env.example`에 추가:
```
# ⚠️ 필수: 환불 처리 알림을 받을 관리자 이메일
REFUND_ADMIN_EMAIL=your-admin@example.com
```

---

## 🟠 HIGH — 빠른 조치 필요

---

### [HIGH-1] CSP `script-src 'unsafe-inline'` — XSS 방어 무력화

**파일:** `next.config.mjs:41`

**문제 코드:**
```javascript
const scriptSourceParts = [
  "'self'",
  "'unsafe-inline'",   // ← XSS 공격자가 인라인 스크립트 실행 가능
  "https://static.cloudflareinsights.com",
  tossScriptOrigin,
  tossWildcard,
];
```

**위험도:** HIGH
`'unsafe-inline'`이 설정되면 CSP의 XSS 방어 효과가 사실상 없어집니다. XSS 취약점 발견 시 공격자가 인라인 스크립트를 직접 주입할 수 있습니다.

**수정 계획:**
```javascript
// ❌ 현재
"'unsafe-inline'"

// ✅ nonce 기반으로 교체
// next.config.mjs에서 nonce 미들웨어 + 동적 CSP 설정
// Next.js 미들웨어에서 nonce 생성:
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
// CSP: script-src 'self' 'nonce-{nonce}' https://static.cloudflareinsights.com ...
```

참고: Next.js 공식 문서 — [Content Security Policy with Nonces](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)

---

### [HIGH-2] HSTS(HTTP Strict Transport Security) 헤더 누락

**파일:** `next.config.mjs` (securityHeaders 배열)

**현재 설정:**
```javascript
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  // ← Strict-Transport-Security 없음
];
```

**위험도:** HIGH
HSTS가 없으면 사용자가 최초 접속 시 HTTP로 접근할 경우 중간자 공격(MITM)에 노출됩니다. 의료/건강 데이터를 다루는 앱에서는 필수입니다.

**수정 계획:**
```javascript
// next.config.mjs에 추가
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
```

---

### [HIGH-3] 관리자 이메일이 API 응답에 노출됨

**파일:** `src/app/api/admin/billing/access/route.ts:37`

**문제 코드:**
```typescript
return NextResponse.json({
  ok: true,
  data: {
    isAdmin: true,
    userId: admin.identity.userId,
    email: admin.identity.email,   // ← 관리자 이메일 응답에 포함
  },
});
```

**위험도:** HIGH
관리자 이메일이 응답에 포함되면 브라우저 개발자 도구, 로그, 네트워크 스니핑으로 노출됩니다. 사회공학(피싱) 공격에 활용될 수 있습니다.

**수정 계획:**
```typescript
// ❌ 현재
return NextResponse.json({ ok: true, data: { isAdmin: true, userId, email } });

// ✅ 수정 후 — 이메일 제거
return NextResponse.json({ ok: true, data: { isAdmin: true } });
```

---

### [HIGH-4] 웹훅 IP 허용목록 미설정 시 모든 IP 허용 (보안 기본값 오류)

**파일:** `src/app/api/billing/webhook/route.ts:128`

**문제 코드:**
```typescript
function isWebhookIpAllowed(req: Request): boolean {
  const rules = clean(process.env.TOSS_WEBHOOK_IP_ALLOWLIST, 1200)
    .split(",").map((s) => s.trim()).filter(Boolean);

  if (rules.length === 0) return true;  // ← 환경변수 미설정 시 모든 IP 허용 (fail-open)
  // ...
}
```

**위험도:** HIGH
Fail-open 패턴입니다. 운영 환경에서 `TOSS_WEBHOOK_IP_ALLOWLIST`를 설정하지 않으면 임의의 IP에서 위조 웹훅을 전송할 수 있습니다. 토큰 인증(`isWebhookAuthorized`)만으로는 부족합니다.

**수정 계획:**
- 운영 환경 `.env`에 `TOSS_WEBHOOK_IP_ALLOWLIST` 반드시 설정
- 토스페이먼츠 IP 대역 추가: `211.249.220.0/24,121.254.200.0/24` (공식 문서 확인 후)
- 또는 배포 단계에서 `TOSS_WEBHOOK_IP_ALLOWLIST` 미설정 시 서버 시작을 차단하는 체크 추가

---

### [HIGH-5] `NEXT_PUBLIC_OPENAI_API_KEY` 폴백 — OpenAI 키 브라우저 노출 위험

**파일:**
- `src/lib/server/openaiMedSafety.ts:93`
- `src/lib/server/openaiRecovery.ts:125`

**문제 코드:**
```typescript
const key =
  process.env.OPENAI_API_KEY ??
  process.env.OPENAI_KEY ??
  process.env.OPENAI_API_TOKEN ??
  process.env.OPENAI_SECRET_KEY ??
  process.env.NEXT_PUBLIC_OPENAI_API_KEY ??  // ← NEXT_PUBLIC_ 접두사 = 브라우저에 노출
  "";
```

**위험도:** HIGH
`NEXT_PUBLIC_` 접두사가 붙은 환경변수는 Next.js 빌드 시 번들에 포함되어 **브라우저 JavaScript로 완전 공개**됩니다. 만약 개발자가 `NEXT_PUBLIC_OPENAI_API_KEY`를 설정하면 API 키가 클라이언트에 그대로 노출되어 누구나 해당 키로 무제한 OpenAI API 호출이 가능합니다.

**수정 계획:**
```typescript
// ❌ 현재 — NEXT_PUBLIC_ 폴백 제거
const key =
  process.env.OPENAI_API_KEY ??
  process.env.OPENAI_KEY ??
  process.env.OPENAI_API_TOKEN ??
  process.env.OPENAI_SECRET_KEY ??
  // process.env.NEXT_PUBLIC_OPENAI_API_KEY ← 완전 제거
  "";
```

그리고 `.env.example` 주석에 경고 추가:
```
# ⚠️ NEVER use NEXT_PUBLIC_OPENAI_API_KEY — use OPENAI_API_KEY (server-only)
OPENAI_API_KEY=sk-your-key-here
```

---

### [HIGH-6] npm 의존성 패키지 HIGH 취약점 18건

**현재 상태:**
```
npm audit 결과: HIGH 18건, MODERATE 1건
- @eslint/eslintrc          HIGH
- @typescript-eslint/*      HIGH (다수)
- eslint                    HIGH
- eslint-config-next        HIGH
- ajv                       MODERATE
```

**위험도:** MEDIUM → HIGH
이 취약점들은 모두 **개발(dev) 의존성**이라 프로덕션 런타임에는 직접 영향을 주지 않습니다. 그러나:
- CI/CD 파이프라인, 빌드 서버에서 실행되는 코드에 영향
- 빌드 시스템 공격(supply chain attack)의 진입점이 될 수 있음
- 향후 프로덕션 의존성으로 전환될 경우 위험

**수정 계획:**
```bash
# 자동 수정 (주요 버전 충돌 없는 경우)
npm audit fix

# 강제 수정 (주요 버전 변경 포함, 테스트 필요)
npm audit fix --force

# 또는 특정 패키지 업데이트
npm update eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

---

### [HIGH-7] 결제 API에 요청 레이트 리미팅 없음

**파일:**
- `src/app/api/billing/checkout/route.ts`
- `src/app/api/billing/confirm/route.ts`

**현재 상태:** 인증된 사용자가 초당 수백 건의 결제 요청을 보낼 수 있는 제한 없음.

**위험도:** HIGH
- 주문 테이블 무한 생성 → DB 스토리지/성능 고갈
- Toss API 할당량(quota) 소진 가능
- 크레딧 시스템 race condition 악용 가능성

**수정 계획:**
```typescript
// Cloudflare 레이트 리미팅 (권장) 또는 Upstash Redis 기반 구현
// 예: checkout - 사용자당 시간당 10회, confirm - 사용자당 시간당 5회
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "1 h"),
});

const { success } = await ratelimit.limit(userId);
if (!success) return bad(429, "rate_limit_exceeded");
```

---

## 🟡 MEDIUM — 1주일 내 조치

---

### [MEDIUM-1] 시스템 설정 상태가 에러 메시지로 노출됨

**파일:** `src/lib/server/billingAdminAuth.ts:50`

**문제 코드:**
```typescript
if (adminUserIds.size === 0 && adminEmails.size === 0) {
  return { ok: false, status: 500, error: "billing_admin_not_configured" };
  //                                       ↑ 시스템 설정 미비 상태를 외부에 노출
}
```

그리고 이 에러가 클라이언트에 그대로 전달됩니다 (`admin/billing/access/route.ts:18`):
```typescript
data: { isAdmin: false, reason: admin.error }  // ← "billing_admin_not_configured" 노출
```

**위험도:** MEDIUM
공격자가 시스템 설정 상태를 파악할 수 있으며, 설정 미비 시점을 타겟으로 공격할 수 있습니다.

**수정 계획:**
```typescript
// ❌ 현재
return { ok: false, status: 500, error: "billing_admin_not_configured" };

// ✅ 수정 후 — 일반 에러로 통합 (서버 로그에만 상세 기록)
console.error("[AdminAuth] BILLING_ADMIN_USER_IDS/EMAILS not configured");
return { ok: false, status: 403, error: "forbidden" };
```

---

### [MEDIUM-2] 복구 스크립트의 SQL 인젝션 취약점

**파일:** `scripts/restore-rnest-user-state-from-local.mjs:25-26, 83-95`

**문제 코드:**
```javascript
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;  // 단순 이스케이프만
}

// SQL 문자열 직접 조합
lines.push(
  `insert into public.rnest_user_state (user_id, payload, updated_at) ` +
  `values (${sqlString(record.userId)}, '${payloadJson}'::jsonb, ...)`
  //                   ↑ userId가 조작된 경우: "foo'; DROP TABLE rnest_user_state; --"
);
```

**위험도:** MEDIUM (운영 환경 직접 실행 시 HIGH)
이 스크립트가 생성하는 SQL 파일을 Supabase에서 실행하면 데이터 조작이 가능합니다. `.wnl_users/` 폴더 내 파일이 외부에서 조작되었다면 SQL 인젝션으로 이어질 수 있습니다.

**수정 계획:**
- 스크립트는 dev/admin 전용이므로 실행 전 입력 파일의 출처 검증 필수
- `userId` 형식 검증 강화 (예: `google:` 또는 `kakao:` prefix + 이메일 형식만 허용)
- 가능하면 Supabase JavaScript 클라이언트로 교체하여 파라미터화된 쿼리 사용

```javascript
// ✅ 검증 추가
const VALID_USER_ID = /^(google|kakao):[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
if (!VALID_USER_ID.test(record.userId)) {
  console.warn(`[warn] invalid userId format, skipping: ${record.source}`);
  continue;
}
```

---

### [MEDIUM-3] `TOSS_WEBHOOK_TOKEN` 환경변수가 선택적(optional)으로 설계됨

**파일:** `src/app/api/billing/webhook/route.ts:70-72`

```typescript
const expected = clean(process.env.TOSS_WEBHOOK_TOKEN, 120);
if (!expected) return false;  // 미설정 시 모든 웹훅 거부 (good)
```

현재는 미설정 시 거부하지만, `.env.example`에서 선택 항목으로 표시됩니다:
```
# Optional: verify incoming webhook with query/header token
TOSS_WEBHOOK_TOKEN=    ← 빈 값으로 설정 유도
```

**위험도:** MEDIUM
개발자가 `TOSS_WEBHOOK_TOKEN`을 설정하지 않고 배포할 경우 모든 웹훅이 차단되어 결제 처리 실패. 또는 개발자가 의도적으로 빈값을 허용하도록 코드를 수정할 위험이 있습니다.

**수정 계획:**
```
# .env.example 수정 — 필수 항목으로 변경 및 경고 추가
# ⚠️ 필수: 미설정 시 모든 결제 웹훅 처리 불가
TOSS_WEBHOOK_TOKEN=your-random-token-min-32-chars
```

그리고 서버 시작 시 환경변수 검증 로직 추가:
```typescript
// src/lib/server/startupChecks.ts
if (!process.env.TOSS_WEBHOOK_TOKEN && process.env.NODE_ENV === 'production') {
  throw new Error('TOSS_WEBHOOK_TOKEN must be set in production');
}
```

---

### [MEDIUM-4] CSP에 `'unsafe-inline'` 스타일 허용

**파일:** `next.config.mjs:58`

```javascript
"style-src 'self' 'unsafe-inline'",  // ← CSS 인젝션 가능
```

**위험도:** MEDIUM
`style-src 'unsafe-inline'`은 CSS 인젝션 공격을 가능하게 합니다. 특히 데이터 exfiltration에 CSS selector를 악용할 수 있습니다.

**수정 계획:**
- Tailwind CSS + Next.js는 CSS-in-JS 또는 외부 스타일시트로 전환하여 `unsafe-inline` 제거 가능
- 단기적으로는 nonce 기반 스타일 CSP 적용

---

### [MEDIUM-5] ESLint 빌드 시 비활성화

**파일:** `next.config.mjs:78`

```javascript
eslint: { ignoreDuringBuilds: true },  // ← 프로덕션 빌드에서 ESLint 무시
```

**위험도:** MEDIUM
보안 관련 ESLint 규칙이 빌드 단계에서 검증되지 않아 취약한 코드가 프로덕션에 배포될 수 있습니다.

**수정 계획:**
```javascript
// next.config.mjs
eslint: { ignoreDuringBuilds: false },  // ← ESLint 재활성화
```

ESLint 보안 플러그인 추가:
```bash
npm install --save-dev eslint-plugin-security eslint-plugin-no-secrets
```

---

## 🔵 LOW — 1개월 내 조치

---

### [LOW-1] Dev 로그 페이지 인증이 URL 파라미터 토큰에만 의존

**파일:** `src/app/dev/logs/page.tsx:10-12`

```typescript
const token = (typeof params.token === "string" ? params.token : "")?.trim();
const required = process.env.DEV_LOG_VIEW_TOKEN;
if (!required || token !== required) { ... }
```

**위험도:** LOW
URL에 포함된 토큰은 브라우저 히스토리, 서버 액세스 로그, HTTP 리퍼러 헤더에 노출될 수 있습니다.

**수정 계획:**
- 프로덕션 빌드에서 해당 페이지를 완전히 제거하거나 `next.config.mjs`의 redirects로 차단
- 또는 Authorization 헤더 기반 인증으로 변경

---

### [LOW-2] 문서 파일에 로컬 절대 경로 노출

**파일:** `supabase/manual/restore-rnest-user-state.md`

```markdown
실행 파일: `PROJECT_ROOT/supabase/migrations/...`
           ↑ 개발자의 로컬 맥 경로 노출
```

**위험도:** LOW
개발자의 실제 맥 사용자명과 로컬 폴더 구조가 노출됩니다.

**수정 계획:** 절대 경로를 상대 경로 또는 `<project-root>` 같은 플레이스홀더로 교체.

---

### [LOW-3] `Cross-Origin-Opener-Policy` 결제 페이지에서 완화됨

**파일:** `next.config.mjs:93-98`

```javascript
{
  source: "/settings/billing/:path*",
  headers: [
    {
      key: "Cross-Origin-Opener-Policy",
      value: "same-origin-allow-popups",  // ← 팝업 허용으로 완화됨
    },
  ],
},
```

**위험도:** LOW
토스페이먼츠 결제창이 팝업으로 열리기 때문에 불가피하지만, `same-origin-allow-popups`는 Spectre 스타일 공격에 일부 취약할 수 있습니다.

**수정 계획:** 현재 설정을 유지하되, Toss 결제창이 팝업 외 iframe 방식을 지원하는 경우 전환 검토.

---

## 수정 우선순위 및 실행 계획 (Fix Priority & Action Plan)

### Phase 1 — 즉시 (24시간 이내)

| # | 작업 | 담당 | 파일 |
|---|------|------|------|
| 1 | `.gitignore`에 `.wnl_*` 패턴 추가 | 개발자 | `.gitignore` |
| 2 | git 히스토리에서 `.wnl_users/`, `.wnl_logs/` 제거 | 개발자 | git history |
| 3 | 하드코딩된 관리자 이메일 환경변수로 이동 | 개발자 | `refundNotification.ts:27` |
| 4 | `NEXT_PUBLIC_OPENAI_API_KEY` 폴백 코드 제거 | 개발자 | `openaiMedSafety.ts`, `openaiRecovery.ts` |
| 5 | `Math.random()` → `crypto.getRandomValues()` 교체 | 개발자 | `checkout/route.ts`, `analyze/route.ts` |
| 6 | `TOSS_WEBHOOK_IP_ALLOWLIST` 운영 환경에 즉시 설정 | 운영 | `.env` |
| 7 | 관리자 API 응답에서 `email` 필드 제거 | 개발자 | `admin/billing/access/route.ts` |

### Phase 2 — 단기 (1주일 이내)

| # | 작업 | 담당 | 파일 |
|---|------|------|------|
| 8 | HSTS 헤더 추가 | 개발자 | `next.config.mjs` |
| 9 | 결제 API 레이트 리미팅 구현 | 개발자 | `checkout/route.ts`, `confirm/route.ts` |
| 10 | `npm audit fix` 실행 및 취약 패키지 업데이트 | 개발자 | `package.json` |
| 11 | `billing_admin_not_configured` 에러 메시지 숨김 | 개발자 | `billingAdminAuth.ts` |
| 12 | SQL 복구 스크립트 userId 형식 검증 강화 | 개발자 | `restore-rnest-user-state-from-local.mjs` |
| 13 | `.env.example`에서 `TOSS_WEBHOOK_TOKEN` 필수 표시 | 개발자 | `.env.example` |

### Phase 3 — 중기 (1개월 이내)

| # | 작업 | 담당 | 파일 |
|---|------|------|------|
| 14 | CSP nonce 기반으로 `'unsafe-inline'` 제거 | 개발자 | `next.config.mjs`, middleware |
| 15 | ESLint 빌드 재활성화 + 보안 플러그인 추가 | 개발자 | `next.config.mjs`, `.eslintrc` |
| 16 | Dev 로그 페이지 프로덕션 접근 차단 | 개발자 | `next.config.mjs`, `dev/logs/page.tsx` |
| 17 | 문서 파일 로컬 경로 제거 | 개발자 | `supabase/manual/*.md` |
| 18 | 개인정보 노출 관련 유저 통보 검토 | 법무/개발자 | — |

---

## 잘 구현된 보안 항목 (Positive Findings)

다음 항목들은 이미 올바르게 구현되어 있어 유지해야 합니다:

- ✅ **Timing-safe 비교** — `timingSafeEqual()` 직접 구현으로 타이밍 공격 방지 (`webhook/route.ts:50-67`)
- ✅ **Bearer 토큰 폴스루 방지** — 토큰 제공 시 쿠키 인증으로 폴백하지 않음 (`readUserId.ts:18-25`)
- ✅ **Supabase RLS** — 전체 사용자 테이블에 Row-Level Security 적용
- ✅ **웹훅 무결성** — 토큰 미설정 시 모든 웹훅 거부 (fail-closed)
- ✅ **X-Frame-Options: DENY** — 클릭재킹 방어
- ✅ **서비스 롤 키 서버 사이드 한정** — 클라이언트 코드에 노출 없음
- ✅ **에러 메시지 정제** — 내부 스택 트레이스 클라이언트 미노출
- ✅ **이미지 업로드 크기 제한** — 6MB 제한 적용
- ✅ **Idempotency Key** — 결제 confirm에 멱등성 키 적용
- ✅ **감사 로그** — 환불/결제 상태 변경 이력 완전 기록
- ✅ **관리자 접근 실패 로깅** — IP/경로/시각 기록

---

## 참고 자료

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Next.js CSP with Nonces](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)
- [토스페이먼츠 웹훅 IP 대역](https://docs.tosspayments.com/reference/webhook)
- [BFG Repo-Cleaner (git history 정리)](https://rtyley.github.io/bfg-repo-cleaner/)
- [개인정보 보호법 제34조 (침해 신고 의무)](https://www.law.go.kr/법령/개인정보보호법)
- [crypto.getRandomValues (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)

---

*이 리포트는 소스코드 정적 분석을 기반으로 작성되었습니다. 동적 침투 테스트(Penetration Test) 및 의존성 패키지 취약점 스캔(npm audit)을 추가로 수행할 것을 권장합니다.*
