# RNest • Shift Body Battery (PWA)

간호사/간호대학생을 위한 **일정(3교대) 기반 회복/피로 인사이트** 웹 기반 앱입니다.  
Google/Kakao 로그인으로 기록을 **계정에 안전하게 저장**하며, PWA로 설치하면 **모바일 앱처럼** 사용할 수 있어요.

## 포함 기능 (v0.1)
- ✅ 로그인 기반 동기화 : Google/Kakao 계정에 기록 저장 (앱 삭제/기기 변경에도 복원)
- ✅ 홈(오늘 컨디션) : 회복 점수 + 추천 수면/카페인 컷오프 + 케어 멘트
- ✅ 7일 피로 예보 : 숫자(0-100) + 위험/주의/양호 컬러
- ✅ 근무표 입력 : 월 캘린더에서 날짜 탭 → D/E/N/OFF/VAC 선택
- ✅ 선택 날짜 디테일 : 전날 복사 / 일정 변경
- ✅ 인사이트 : 최근 14일 평균/최저/최고/위험일수 요약
- ✅ 인사이트 잠금 : 건강 기록이 **7일 이상** 누적되어야 열림
- ✅ PWA : manifest + service worker(프로덕션에서만 등록)

## 실행 방법
> Node.js 18+ 권장

```bash
npm install
npm run dev
```

- 브라우저에서 http://localhost:3000 접속

## 환경 변수 설정
`.env.local`에 아래 값을 넣어주세요.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `AUTH_ALLOWED_EMAILS` (선택, 테스트 중 허용할 이메일만 `,` 또는 줄바꿈으로 지정)
- `AUTH_REQUIRE_EXISTING_USER=true` (선택, 폐쇄 테스트에서 기존 앱 사용자만 재로그인 허용)

Google 로그인은 앱 코드에서 직접 OAuth client id/secret을 읽지 않고, Supabase Dashboard의 `Authentication > Providers > Google` 설정을 사용합니다.

- 로컬 개발에서는 현재 접속 중인 브라우저 origin(`http://localhost:3000` 등)을 우선 사용해 OAuth callback을 보냅니다.
- `NEXT_PUBLIC_SITE_URL`은 메타데이터/이메일 링크용 기본 도메인으로도 쓰이므로 환경별로 맞게 관리해야 합니다.

## 프로덕션 빌드
```bash
npm run build
npm start
```

## PWA(앱처럼 설치) 안내
- iPhone(Safari): **공유 버튼 → “홈 화면에 추가”**
- Android/Chrome: 주소창 메뉴 → “앱 설치” 또는 “홈 화면에 추가”

> ⚠️ 서비스워커는 개발환경에서 캐시 혼선을 줄이기 위해 **production에서만 등록**됩니다.

## 회복/피로 알고리즘(간단 버전)
- 수면/근무/스트레스/카페인/생리주기/기분 정보를 통합해
- 0–100 스케일의 “회복 지표”로 보여줍니다.

> 이후 버전에서 “개인 수면 패턴/카페인 민감도” 설정만 추가해도 정확도가 크게 올라갑니다.

## 커스터마이징 포인트
- `src/lib/bodyBattery.ts` : 규칙(가중치/멘트/컷오프)을 병동/개인 스타일에 맞게 수정
- `src/components/home/*` : UI(카드/캘린더/게이지) 커스터마이징
- `public/icons/*` : 앱 아이콘 교체

---
Made for a clean, Apple-like aesthetic: soft shadows, generous spacing, subtle borders.


## 바디 배터리 알고리즘 (NurseBioRhythmAI 포팅)
- `src/lib/bodyBattery.ts` 는 사용자가 제공한 Python `NurseBioRhythmAI`를 TypeScript로 포팅한 버전입니다.
- 1시간 단위로 (Work/Rest/Sleep) 상태를 추정하고, **새벽 2~6시 생체리듬 페널티(peak 04:00)** 를 적용합니다.
- 캘린더/예보 숫자는 근무시간대에서의 **최저 배터리**를 사용하여 위험도를 더 현실적으로 표시합니다.
