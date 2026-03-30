# RNest

**교대 근무 간호사를 위한 회복·임상 AI 플랫폼**

RNest는 3교대 근무 환경에서 일하는 간호사가 피로를 관리하고 회복 패턴을 파악할 수 있도록 설계된 모바일 퍼스트 PWA입니다. 단순한 웰니스 앱이 아니라, 수면 부채·야간 근무·생리 주기·카페인 섭취 등 간호 직군의 현실을 반영한 회복 인사이트와 AI 임상 검색을 하나의 앱에서 제공합니다.

---

## 핵심 기능

### 홈 & 회복 대시보드
- 오늘의 회복 점수(Body Battery) — 근무·수면·스트레스·카페인·생리주기를 통합한 0–100 점수
- 추천 수면 시간 및 카페인 컷오프 시각 안내
- 피로 예보 — 향후 7일/14일 근무 일정 기반 위험도 미리보기

### 근무 일정 & 건강 기록
- 월 캘린더 기반 3교대(Day/Evening/Night/Off/Vacation) 입력
- 일별 건강 기록 — 수면, 감정, 컨디션, 메모
- 180일치 일정 및 90일치 건강 기록 자동 보관

### AI 회복 플래너 (Plus/Pro)
- 근무 강도·피로 누적·수면 패턴을 분석한 AI 7일 회복 오더 생성
- Pro 플랜: 14일 맞춤 회복 계획, gpt-5.4 기반 심층 분석

### AI 임상 검색
간호사가 현장에서 바로 쓸 수 있는 임상 AI 검색 서비스입니다.

| 구분 | 모델 | 특징 |
|------|------|------|
| 기본 검색 | gpt-5.2 | 투약·용량·금기 등 빠른 확인 |
| 프리미엄 검색 | gpt-5.4 | 복합 약물 상호작용·희귀 케이스 등 심층 해석 |

- 약물, 기구, 수치, 처치, 절차 등 다양한 질문 유형 지원
- 이미지 첨부 가능 (약물 포장지, 처방 스크린 등)
- 대화 이어가기(Continuation) 지원
- 민감 정보(개인 식별 정보) 입력 자동 차단

### 노트북 & 간호사 계산기
- 임상 메모 노트북 (실시간 클라우드 동기화)
- 간호사 실무 계산기 — BMI, BSA, CrCl, GCS, Pediatric Dose, Fluid Balance, Unit Converter

### 소셜 & 챌린지
- 간호사 커뮤니티 그룹
- 회복·건강 목표 챌린지 참여

### 쇼핑몰 & 주문
- 간호사 대상 상품 판매
- TossPayments 기반 결제
- 실시간 주문 상태 추적 (SweetTracker 배송 연동)
- 다중 배송지 관리

---

## 요금제

| 플랜 | 가격 | AI 임상 검색 | AI 회복 플래너 |
|------|------|-------------|----------------|
| Free | 무료 | 기본 2회 + 프리미엄 1회 체험 | - |
| Plus | 9,900원/월 | 기본 20회 + 프리미엄 5회 포함 | 7일 회복 플래너 |
| Pro | 16,900원/월 | 기본 50회 + 프리미엄 30회 포함 | 14일 맞춤 회복 계획 |

**추가 크레딧 구매 (Plus/Pro)**

| 상품 | 가격 |
|------|------|
| 기본 검색 10회 | 1,000원 |
| 기본 검색 30회 | 2,500원 |
| 프리미엄 검색 10회 | 1,500원 |
| 프리미엄 검색 30회 | 3,900원 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 15 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS |
| 런타임 | Edge Runtime (Cloudflare/Vercel) |
| 백엔드/DB | Supabase (PostgreSQL + RLS + Realtime + Storage) |
| 인증 | Supabase Auth — Google / Kakao 소셜 로그인 |
| AI | OpenAI Responses API (gpt-5.2 / gpt-5.4) |
| AI 게이트웨이 | Cloudflare AI Gateway (선택) |
| 결제 | TossPayments |
| 배송 추적 | SweetTracker |
| 이메일 | Resend |
| 상태 관리 | Zustand |
| PWA | manifest + service worker |

---

## 아키텍처 주요 파일

```
src/
├── app/                          # Next.js App Router 페이지 & API 라우트
│   └── api/
│       ├── tools/med-safety/     # AI 임상 검색 API
│       ├── billing/              # 구독·결제·크레딧 API
│       ├── shop/                 # 쇼핑몰 주문·결제 API
│       └── user/                 # 유저 상태 bootstrap/sync API
├── components/
│   ├── shell/AppShell.tsx        # 앱 부트스트랩 & 인증 게이트
│   ├── pages/                    # 각 화면 페이지 컴포넌트
│   ├── insights/                 # AI 회복 플래너 컴포넌트
│   └── system/CloudStateSync.tsx # 건강 상태 클라우드 동기화
├── lib/
│   ├── store.ts                  # Zustand 글로벌 상태
│   ├── model.ts                  # 앱 도메인 모델
│   ├── auth.ts                   # 인증 흐름 (AuthProvider)
│   ├── billing/
│   │   ├── plans.ts              # 요금제·크레딧 정의 (단일 진실 소스)
│   │   └── entitlements.ts       # 플랜별 권한 계산
│   ├── bodyBattery.ts            # 회복 점수 알고리즘
│   ├── rnestBatteryEngine.ts     # RNest 배터리 엔진
│   └── server/
│       ├── openaiMedSafety.ts    # AI 임상 검색 핵심 로직
│       ├── medSafetyPrompting.ts # 임상 검색 프롬프트 빌더
│       ├── billingStore.ts       # 결제·크레딧 DB 연산
│       └── shopOrderStore.ts     # 주문 처리 로직
└── supabase/migrations/          # DB 스키마 마이그레이션
```

---

## 로컬 개발

### 요구사항
- Node.js 18+
- npm

### 설치 & 실행
```bash
npm install
npm run dev
```
브라우저에서 `http://localhost:3000` 접속

### 빌드 확인
```bash
npm run build   # 프로덕션 빌드 (prebuild 클린업 포함)
npm run lint    # ESLint
npx tsc --noEmit  # 타입 체크
```

### 테스트 로그인 (개발 환경)
```
GET /api/dev/login?user=1&redirect=/path
```

---

## 환경 변수

`.env.local`에 설정합니다.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 사이트 URL
NEXT_PUBLIC_SITE_URL=

# OpenAI
OPENAI_API_KEY=

# TossPayments
TOSS_PAYMENTS_SECRET_KEY=
NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY=

# SweetTracker (배송 추적)
SWEETTRACKER_API_KEY=

# Resend (이메일)
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# 선택: Cloudflare AI Gateway
OPENAI_MED_SAFETY_BASE_URL=

# 선택: 개발 접근 제한
AUTH_ALLOWED_EMAILS=
AUTH_REQUIRE_EXISTING_USER=true
```

---

## PWA 설치

- **iPhone (Safari):** 공유 버튼 → "홈 화면에 추가"
- **Android / Chrome:** 주소창 메뉴 → "앱 설치"

> 서비스워커는 캐시 혼선 방지를 위해 **production 빌드에서만 등록**됩니다.

---

## 데이터 보관 정책

| 데이터 | 보관 기간 |
|--------|----------|
| 근무 일정 (schedule) | 180일 |
| 교대명 (shiftNames) | 180일 |
| 건강 기록 (bio, emotions, notes) | 90일 |
| 상태 리비전 (revisions) | 최근 30개 |

---

## 보안 & 안전

- 모든 민감 API는 same-origin 검증 + `Cache-Control: no-store` 적용
- AI 임상 검색: 개인 식별 정보(이메일·전화번호·주민번호) 입력 자동 차단
- 결제·크레딧 차감은 서비스 동의 완료 사용자에게만 허용
- Supabase RLS(Row Level Security)로 사용자 데이터 격리

---

## 라이선스

Private — All rights reserved.
