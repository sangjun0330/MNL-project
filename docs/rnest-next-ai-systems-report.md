# RNest 차세대 AI 기능/시스템 제안 리포트

작성일: 2026-04-01  
기준 코드베이스: `/Users/osangjun/Desktop/WNL_updated`  
작성 방식: RNest 소스코드 정적 분석 + 외부 공식 문서/학술 자료 조사

## 한 줄 결론

RNest의 다음 단계 AI는 "채팅을 더 잘하는 기능"이 아니라, **예측하고, 계산하고, 기록을 만들고, 근거를 보여주고, 다음 행동까지 연결하는 운영형 AI 시스템**이어야 한다.

지금 RNest는 이미 다음 자산을 갖고 있다.

- 결정론 회복 엔진: `src/lib/rnestBatteryEngine.ts`
- AI 회복 세션/오더 구조: `src/lib/server/aiRecovery.ts`
- 고도화된 임상 검색 파이프라인: `src/lib/server/openaiMedSafety.ts`
- 간호 계산기와 경고 로직: `src/lib/nurseCalculators.ts`
- 메모/체크리스트/템플릿 시스템: `src/lib/notebook.ts`, `src/lib/medSafetyMemo.ts`
- 원격 동기화/권한/과금/크론 패턴: `CloudStateSync`, `/api/jobs/*`, billing routes

즉 RNest는 "AI 챗봇 앱"이 아니라, 이미 **회복 엔진 + 임상 툴 + 노트 + 과금 + 스케줄러**를 가진 상태다.  
그래서 가장 잘 맞는 방향은 새 챗봇을 늘리는 것이 아니라, **AI를 기존 엔진과 툴에 연결해 실제 업무 흐름을 한 단계 자동화**하는 것이다.

---

## 1. 현재 AI가 1차원적으로 느껴지는 이유

코드 기준으로 현재 AI는 생각보다 정교하다.

### 1.1 AI 임상 검색

- 이미지 업로드
- continuation 토큰 기반 대화 이어가기
- 프롬프트 라우팅/품질게이트/리페어
- 크레딧 차감/복원
- 최근 검색 저장

하지만 사용자 경험은 결국 **"질문 -> 텍스트 답변"** 중심이다.

### 1.2 AI 맞춤회복

- RNest 배터리 엔진과 기록을 기반으로 세션을 만들고
- wake/postShift 슬롯별로 brief와 orders를 생성한다.

하지만 이것도 여전히 **"요청 시점에 생성되는 텍스트형 브리프"** 성격이 강하다.

### 1.3 RNest가 다음 단계로 가려면 바뀌어야 할 축

RNest는 아래 5축으로 진화해야 한다.

1. `Reactive -> Proactive`
2. `Free-text only -> Structured action`
3. `Single answer -> Longitudinal memory`
4. `LLM-only -> LLM + deterministic engine`
5. `Chat surface -> Workflow surface`

---

## 2. RNest에 가장 맞는 차세대 AI 후보

우선순위 기준은 아래 4가지로 잡았다.

- RNest의 현재 자산을 그대로 활용할 수 있는가
- 간호사의 실제 시간 절감/판단 보조가 큰가
- 과금 포인트가 명확한가
- 의료/안전 리스크를 통제 가능한가

| 우선순위 | 기능/시스템 | RNest 적합도 | 기대효과 | 구현 난이도 |
|---|---|---:|---:|---:|
| P0 | 근거기반 임상 코파일럿 | 매우 높음 | 매우 큼 | 중 |
| P0 | 처방/주입 오더 파서 + 계산기 결합 | 매우 높음 | 매우 큼 | 중 |
| P0 | 예측형 회복 코파일럿(JITAI) | 매우 높음 | 매우 큼 | 중 |
| P1 | SBAR/인계/메모 자동 생성 | 매우 높음 | 큼 | 낮음~중 |
| P1 | 개인 회복 프로파일 학습 시스템 | 높음 | 큼 | 중 |
| P2 | 멀티모달 캡처(음성/사진 -> 구조화) | 높음 | 큼 | 중~상 |
| P2 | 팀/그룹 인텔리전스 | 중상 | 중~큼 | 중 |
| P3 | FHIR/SMART on FHIR 연동층 | 중 | 장기적 큼 | 상 |

---

## 3. 추천 1: 근거기반 임상 코파일럿

### 무엇이 다른가

지금의 AI 임상 검색이 "잘 답변하는 검색"이라면, 다음 단계는 **"근거와 출처를 함께 보여주는 bedside copilot"** 이다.

사용자 경험은 아래처럼 바뀌어야 한다.

`질문 -> 답변`

에서

`질문 -> 핵심 결론 + 행동 우선순위 + 금기/경고 + 출처 + 최신성 + 불확실성`

으로 바뀌어야 한다.

### RNest에 맞는 이유

- RNest는 이미 `ward / er / icu`, `pre_admin / during_admin / event_response` 같은 문맥을 갖고 있다.
- 지금 강점은 프롬프트 복잡도인데, 다음 경쟁력은 **답변 품질보다 근거 전달 구조**여야 한다.
- 간호사는 "설명"보다 **바로 확인 가능한 기준, 금기, 보고 포인트, 확인 순서**가 중요하다.

### 외부 근거

- FDA는 의료진이 **근거의 기반을 독립적으로 검토**할 수 있는 소프트웨어 예시를 명시하고 있다. 특히 약물 상호작용/금기 알림도 "현재의 FDA 승인 라벨 또는 최신 peer-reviewed source"와 함께, 의료진이 근거를 검토할 수 있어야 한다고 본다.  
  출처: [FDA examples of software functions that are not medical devices](https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices)
- openFDA drug label API는 SPL 라벨이 **주간 업데이트**되며, 동시에 "medical care 의사결정을 위해 openFDA만 의존하지 말라"고 명시한다.  
  출처: [openFDA drug labeling API](https://open.fda.gov/apis/drug/label/)
- DailyMed는 REST API와 라벨 히스토리, 마지막 업데이트 정보, PDF/ZIP 다운로드를 제공한다.  
  출처: [DailyMed web services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm)
- 한국에서는 HIRA DUR이 실시간 금기/중복/안전성 정보를 제공하는 공식 체계다.  
  출처: [HIRA DUR 안내](https://www.hira.or.kr/cms/guide_busi/03/03/index.html)

### 구현 방식

#### 1) 답변 생성 전 "Grounding layer" 추가

새로운 서버 계층:

- `src/lib/server/medGrounding.ts`
- `src/lib/server/medEvidenceIndex.ts`
- `src/lib/server/medEvidenceSources/*`

역할:

- 약물/기구/상황 엔티티 추출
- 공식 데이터 소스 검색
- source chunk 정규화
- 모델에 source packet 전달

#### 2) 검색 소스 우선순위 설계

권장 우선순위:

1. 국내 공식 안전성/금기 소스
2. DailyMed / FDA SPL
3. 기관 프로토콜 또는 내부 검증 자료
4. 일반 문헌/요약 자료

여기서 중요한 점은 **LLM이 근거를 생성하지 않고, 근거 위에서 설명만 하게 만드는 것**이다.

#### 3) 응답 계약(Answer contract) 변경

임상 검색 응답을 아래처럼 구조화한다.

- `summary`
- `immediate_actions`
- `do_not_do`
- `need_to_verify`
- `escalation`
- `sources[]`
- `freshness`
- `confidence_note`

Premium 검색은 여기에 추가로:

- `conflicting_points`
- `multi-source comparison`
- `SBAR draft`
- `patient explanation`

#### 4) UI 변경

`ToolMedSafetyPage.tsx`에 아래 카드 추가:

- 핵심 결론
- 지금 확인할 것
- 중단/보고 기준
- 근거 출처
- 마지막 업데이트

답변 복사 시 `buildMedSafetyMemoBlocks()`가 출처 링크와 불확실성까지 같이 메모에 넣도록 확장한다.

#### 현재 코드 접점

- `src/lib/server/openaiMedSafety.ts`
- `src/app/api/tools/med-safety/analyze/route.ts`
- `src/components/pages/tools/ToolMedSafetyPage.tsx`
- `src/lib/medSafetyMemo.ts`

### 데이터/DB 권장

현재 `ai_content`는 `user_id` 단일 upsert 구조라서, grounded evidence를 시스템 레벨로 쌓기엔 맞지 않는다. 캐시 용도로는 유지하되, 아래 전용 테이블을 따로 두는 편이 맞다.

- `rnest_med_evidence_documents`
- `rnest_med_evidence_chunks`
- `rnest_med_entity_aliases`
- `rnest_med_answer_cache`

### 과금 포인트

- `Free`: 요약형 1-2 source answer
- `Plus`: grounded standard answer + 최근 저장 + 메모 변환
- `Pro`: multi-source comparison + conflict handling + SBAR/action pack

---

## 4. 추천 2: 처방/주입 오더 파서 + 계산기 결합

### 무엇이 다른가

간호사 입장에서 가장 실용적인 AI는 "질문을 잘하는 AI"가 아니라 **오더를 읽고 계산기와 연결해주는 AI**다.

예시:

- 처방 문구 붙여넣기
- 약물 라벨/처방 스크린 촬영
- AI가 `drug / amount / volume / rate / unit / weight-needed`를 추출
- RNest 계산기가 계산
- AI가 검산 포인트와 위험 차이를 설명

### RNest에 맞는 이유

- RNest에는 이미 펌프/IVPB/드립/희석/검산/CrCl/소아용량 계산기가 있다.
- `src/lib/nurseCalculators.ts`에는 경고, ratio warning, 10x/100x check 같은 안전장치가 이미 있다.
- 지금 부족한 것은 계산기가 아니라 **입력 진입장벽을 낮추는 파서와 연결 경험**이다.

### 외부 근거

- FDA는 의료진이 근거를 검토 가능한 형태의 patient-specific 정보 제공과 drug interaction/contraindication 알림을 예시로 든다.  
  출처: [FDA examples](https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices)
- 한국 HIRA DUR도 실시간 약물 안전성 점검을 지원한다.  
  출처: [HIRA DUR 안내](https://www.hira.or.kr/cms/guide_busi/03/03/index.html)
- 2025년 간호 문서/데이터 분야 연구에서는 GenAI가 **nursing flowsheet reasoning에 어려움을 보였다**는 결과가 있어, 숫자/용량 판단은 결정론 엔진과 결합하는 쪽이 안전하다.  
  출처: [Generative AI Demonstrated Difficulty Reasoning on Nursing Flowsheet Data](https://pubmed.ncbi.nlm.nih.gov/40417556/)

### 구현 방식

#### 핵심 원칙

- **LLM은 파싱과 설명만**
- **계산은 반드시 deterministic engine**

#### 새 플로우

1. 입력: 텍스트/이미지
2. 모델이 JSON schema로 구조화
3. 서버가 적절한 계산기 선택
4. `nurseCalculators.ts` 실행
5. 계산 결과와 warning을 다시 LLM이 bedside-friendly wording으로 정리

#### 새 API 후보

- `POST /api/tools/order-check/parse`
- `POST /api/tools/order-check/analyze`

#### 새 UI 후보

- `도구 > 통합 간호 계산기` 상단에 `오더 붙여넣기 / 사진으로 시작`
- 결과 화면에:
  - 추출된 입력값
  - 계산 결과
  - 자동 경고
  - 처방 대비 차이
  - 인계용 한 줄 복사

### 안전 원칙

- 모델이 직접 mL/hr 최종값을 결정하지 않음
- 파싱된 각 필드를 사용자에게 노출
- 확신 낮으면 계산하지 않고 "확인 필요 필드"만 반환
- 약물명/농도/단위 중 1개라도 불명확하면 `safe fail`

#### 현재 코드 접점

- `src/lib/nurseCalculators.ts`
- `src/components/pages/tools/ToolNurseCalculatorsPage.tsx`
- `src/components/pages/tools/ToolMedSafetyPage.tsx`
- `src/app/api/tools/med-safety/analyze/route.ts`

### 예상 효과

이 기능은 RNest의 **임상 검색 + 계산기**를 하나로 묶어, RNest를 "찾는 앱"에서 **실제 검산 도구**로 올려준다.

---

## 5. 추천 3: 예측형 회복 코파일럿(JITAI)

### 무엇이 다른가

AI 맞춤회복을 "생성형 리포트"에서 **타이밍 맞는 개입 시스템**으로 바꾸는 것이다.

예시:

- Night 2연속 + sleep debt 증가 -> 퇴근 전 "귀가 전 카페인/운전 위험" 브리프
- quick return 발생 -> 퇴근 직후 낮잠/광노출/수면 window 제안
- 생리 + 야간 + 고스트레스 겹침 -> 오늘 일정 재배치/활동량 하향 제안
- 배터리 급락 예측 -> 내일 회복 order 사전 발행

### RNest에 맞는 이유

- RNest는 이미 `sleepDebt`, `nightStreak`, `chronotype`, `caffeine`, `menstrual`, `workEvent`를 보고 있다.
- 부족한 것은 예측 능력이 아니라 **언제 개입할지 결정하는 이벤트 엔진**이다.

### 외부 근거

- CDC/NIOSH의 간호사 shift work training은 성인의 수면 필요량, 피로, night/evening shift 대응, nap countermeasure, fatigue risk management system까지 다룬다.  
  출처: [NIOSH Training for Nurses on Shift Work and Long Work Hours](https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod2/08.html)
- 2024년 JMIR microrandomized trial은 vulnerable sleep state에서 **실시간 sleep feedback이 이후 수면 시간을 최대 40분 늘리고**, 그 효과가 최대 7일 지속될 수 있음을 보고했다.  
  출처: [Just-in-Time Adaptive Intervention for Stabilizing Sleep Hours of Japanese Workers](https://pubmed.ncbi.nlm.nih.gov/38861313/)

### 구현 방식

#### 1) 이벤트 엔진 추가

신규 서버 모듈:

- `src/lib/server/recoveryEvents.ts`
- `src/lib/server/recoveryInterventions.ts`

역할:

- 매일 또는 1시간 단위 risk evaluation
- 조건 충족 시 intervention draft 생성
- intervention lifecycle 관리

#### 2) 기존 `/api/jobs` 패턴 활용

이미 RNest는 `shop`, `social`에 cron job 패턴이 있다.  
같은 방식으로 아래 추가:

- `POST /api/jobs/recovery/evaluate`

#### 3) 추천 이벤트 타입

- `pre_night_shift_brief`
- `quick_return_warning`
- `drive_home_fatigue_warning`
- `late_caffeine_risk`
- `cycle_overlap_recovery_adjustment`
- `night_streak_recovery_block`

#### 4) 데이터 저장

`user_state` blob에 넣기보다, 쿼리와 추적을 위해 별도 테이블 권장:

- `rnest_ai_recovery_events`
- `rnest_ai_recovery_interventions`
- `rnest_ai_recovery_event_feedback`

#### 현재 코드 접점

- `src/lib/server/aiRecovery.ts`
- `src/lib/rnestBatteryEngine.ts`
- `src/components/insights/useAIRecoverySession.ts`
- `src/components/insights/useAIRecoveryPlanner.ts`
- `src/app/api/insights/recovery/ai/route.ts`
- `src/app/api/jobs/*`

### 제품 효과

이 기능이 붙으면 AI 맞춤회복은 "읽는 콘텐츠"가 아니라 **하루 흐름을 관리하는 운영 기능**이 된다.  
이게 RNest의 가장 강한 차별화 포인트가 될 가능성이 높다.

---

## 6. 추천 4: SBAR/인계/메모 자동 생성

### 무엇이 다른가

AI 임상 검색 결과나 회복 이벤트를 **곧바로 메모/인계 문서/체크리스트**로 바꾼다.

예시:

- 약물 검색 후 `SBAR로 변환`
- 기구 이상 대응 검색 후 `점검 checklist로 변환`
- 오늘 회복 상태 후 `퇴근 후 자기관리 note로 변환`
- 야간 근무 전 `handoff prep card` 생성

### RNest에 맞는 이유

- 이미 `buildMedSafetyMemoBlocks()`가 AI 답변을 메모 블록으로 변환한다.
- notebook template 시스템도 있다.
- 즉 이 기능은 새 제품을 만드는 게 아니라 **현재 산출물에 workflow 출구를 붙이는 일**이다.

### 외부 근거

- AHRQ는 TeamSTEPPS/CUSP 문맥에서 SBAR, handoff, daily goals checklist 같은 구조화 도구를 환자안전 커뮤니케이션 수단으로 제시한다.  
  출처: [AHRQ Improving Teamwork and Communication](https://www.ahrq.gov/antibiotic-use/long-term-care/safety/teamwork.html), [AHRQ TeamSTEPPS Module 1: Communication](https://www.ahrq.gov/teamstepps-program/curriculum/communication/index.html)
- 2023년 electronic nursing handover 연구는 전자 인계 시스템이 handover quality/efficiency를 높이고 clinical error 가능성을 줄이며 patient safety를 높였다고 보고했다.  
  출처: [Electronic Nursing Handover System study](https://pubmed.ncbi.nlm.nih.gov/37221502/)
- 2025년 co-designed nurse handover tool 연구는 구조화된 visual handover tool이 critical information inclusion에 도움이 됐다고 보고했다.  
  출처: [Co-design of a nurse handover tool](https://pubmed.ncbi.nlm.nih.gov/39925665/)

### 구현 방식

#### 산출물 타입 추가

- `SBAR`
- `patient_explainer`
- `handoff_card`
- `checklist`
- `note_template`

#### 코드 접점

- `src/lib/medSafetyMemo.ts` 확장
- `src/components/pages/tools/ToolNotebookPage.tsx`에서 "AI 산출물 가져오기"
- notebook templates API 재사용

#### 간호 문서 포맷 확장

중기적으로는 아래 포맷도 지원 가능:

- SOAPIE
- Focus DAR
- narrative note

이 방향은 2025년 한국 기반 간호 문서 AI 연구와도 맞는다.  
출처: [Generative AI-Based Nursing Diagnosis and Documentation Recommendation](https://pubmed.ncbi.nlm.nih.gov/40384067/)

---

## 7. 추천 5: 개인 회복 프로파일 학습 시스템

### 무엇이 다른가

지금 RNest는 프로필 설정에 `chronotype`, `caffeineSensitivity`를 수동 입력받는다.  
다음 단계는 **사용자 실제 기록으로 profile을 학습**하는 것이다.

예시:

- 이 사용자는 야간 다음날 5.5h 수면이면 배터리 회복이 거의 안 된다
- 이 사용자는 카페인 200mg을 오후 4시 이후 마시면 다음날 회복점수 하락폭이 크다
- 이 사용자는 PMS 기간에 stress 입력이 없더라도 symptom severity가 회복에 더 크게 반영된다

### RNest에 맞는 이유

- 이건 일반 챗봇이 못 하는 영역이고 RNest 데이터가 있어야만 가능한 영역이다.
- 경쟁사 모방이 어려운 RNest 전용 자산이 된다.

### 구현 방식

#### 새 학습 파이프라인

- 최근 60~90일 기록에서 개인 계수 추정
- 기본 엔진 계수는 유지
- 개인화 보정치만 별도 저장

#### 저장 구조

- `rnest_ai_user_profile`
- `rnest_ai_user_profile_revisions`

저장 항목 예시:

- inferred chronotype
- inferred caffeine decay sensitivity
- sleep debt recovery slope
- night shift tolerance
- cycle sensitivity modifier
- recommendation acceptance patterns

#### UI 원칙

블랙박스처럼 보이면 안 된다.  
반드시 아래를 같이 보여줘야 한다.

- "최근 6주 기록 기준"
- "야간 연속 근무 후 회복 지연이 큰 편"
- "최근 추천 중 잘 지켜진 항목/잘 안 지켜진 항목"

---

## 8. 추천 6: 멀티모달 캡처(사진/음성 -> 구조화)

### 무엇이 다른가

텍스트 입력 부담을 줄이는 것이다.

예시:

- 약물 라벨 사진 -> 임상 검색/오더 파서로 연결
- 퇴근 후 음성 메모 -> 회복 note + 감정/증상 후보 추출
- 환자 설명용 메모 녹음 -> notebook 초안 생성

### RNest에 맞는 이유

- 임상 검색은 이미 이미지 입력을 받는다.
- notebook은 파일/첨부 구조가 있다.
- 간호사는 이동 중, 교대 중, 짧은 틈에 입력한다. 텍스트만 강제하면 사용성이 한계가 있다.

### 외부 근거

- 2024~2025 연구들은 ambient/AI documentation이 문서 시간과 workload를 줄일 수 있음을 보여주지만, 동시에 정확도/누락/환각/동의 문제가 남아 있음을 보여준다.  
  출처: [Use of an ambient AI tool to improve clinical documentation quality](https://pubmed.ncbi.nlm.nih.gov/39371531/), [Ambient AI reduces documentation time and enhances quality](https://pubmed.ncbi.nlm.nih.gov/41198484/), [Informed Consent for Ambient Documentation Using Generative AI](https://pubmed.ncbi.nlm.nih.gov/40694347/)

### 구현 방식

#### 권장 원칙

- full ambient scribe부터 가지 말고 **short capture -> structured draft**부터 시작
- 병원 업무 음성은 consent/privacy를 가장 보수적으로 다룰 것
- PHI redaction이 선행되지 않으면 저장하지 않을 것

#### 1차 구현

- `30~60초 음성 메모`
- 서버 STT
- 개인 회복 note / notebook 초안 생성
- 사용자 승인 후만 저장

이 기능은 바로 전면화하기보다 `Pro beta`로 검증하는 것이 맞다.

---

## 9. 추천 7: 팀/그룹 인텔리전스

### 무엇이 다른가

소셜을 "커뮤니티"에서 **운영 정보**로 올리는 기능이다.

예시:

- 그룹 단위 피로 heatmap
- 공통 off + 낮은 피로 날짜 추천
- 그룹 챌린지 자동 생성
- 익명 집계 기반 "이번 주 night streak 과다 비율"

### RNest에 맞는 이유

- 이미 social groups/challenges/events가 있다.
- 개인 회복과 그룹 리텐션을 같이 올릴 수 있다.

### 주의점

- 개인 건강 데이터 직접 노출 금지
- 반드시 익명/집계/opt-in
- 개인 위험 경고를 그룹에 흘리면 안 됨

이 영역은 개인 B2C보다 향후 `팀 플랜`과 더 잘 맞는다.

---

## 10. 추천 8: FHIR/SMART on FHIR 연동층

### 결론부터

이건 **지금 당장 메인 우선순위는 아니다.**  
하지만 중장기적으로 RNest의 기업형 확장성을 결정한다.

### 왜 필요한가

- FHIR는 전자적 의료정보 교환 표준이다.
- SMART on FHIR는 FHIR + OAuth2/OpenID Connect 기반으로 EHR 앱 생태계를 여는 방식이다.

### 외부 근거

- HL7 FHIR는 전자적 healthcare information exchange 표준이며, resources, clinical reasoning, workflow, medication, diagnostics를 포함한다.  
  출처: [HL7 FHIR overview](https://hl7.org/fhir/overview.html)
- SMART on FHIR는 FHIR 기반 데이터 접근 + OAuth2/OpenID Connect를 사용하는 앱 플랫폼으로, major EHR products에 built in 되었다고 설명한다.  
  출처: [SMART for developers](https://smarthealthit.org/for-developers/), [SMART on FHIR API](https://smarthealthit.org/smart-on-fhir-api/)

### RNest 적용 방향

지금은 write-back까지 가지 말고 아래만 준비하는 것이 맞다.

- `FHIR-ready internal schema`
- `Observation`, `MedicationRequest`, `CarePlan` 대응 계층
- import/export adapter

즉 **지금은 내부 모델을 FHIR 친화적으로 다듬고**, 실제 병원 연동은 나중에 여는 전략이 맞다.

---

## 11. RNest에 필요한 공통 시스템 5개

위 기능들은 개별 기능처럼 보이지만, 실제로는 아래 공통 시스템이 핵심이다.

### 11.1 Evidence Layer

역할:

- 공식 소스 수집
- 버전/최신성 관리
- citation packet 생성

### 11.2 Deterministic Safety Layer

역할:

- 계산
- 임계치/금기/경고
- fail-safe

RNest는 이미 이 레이어의 씨앗이 있다:

- `rnestBatteryEngine.ts`
- `nurseCalculators.ts`

### 11.3 Event Engine

역할:

- 어떤 시점에 개입할지 결정
- 재발행/만료/중복 방지
- 피드/알림/브리프 발행

### 11.4 Personal Memory Layer

역할:

- 장기 패턴 축적
- 추천 반응 학습
- 프로파일 revision 관리

### 11.5 Evaluation / AI Ops Layer

역할:

- hallucination/coverage/fallback 추적
- grounded vs non-grounded answer 비교
- 사용자 수용도/수정률/재질문률 측정

현재 RNest는 prompt engineering은 강하지만, 다음 단계에선 **AI ops와 artifact quality measurement**가 중요해진다.

---

## 12. 구현 우선순위 로드맵

## 0~6주

- 임상 검색 grounded source packet 설계
- med-safety answer contract 구조화
- 오더 파서 PoC
- SBAR / checklist / notebook export 개선

성과 기준:

- 출처 포함 답변 비율
- 계산기 연결 클릭률
- 메모 전환률

## 6~12주

- recovery event engine 추가
- proactive brief feed 구축
- 개인 회복 profile v1
- AI 산출물 저장 전용 테이블 도입

성과 기준:

- proactive brief 열람률
- recommendation completion률
- recovery churn 감소

## 3~6개월

- 멀티모달 입력 확대
- group intelligence beta
- FHIR-ready internal adapters
- enterprise/team plan 탐색

---

## 13. 지금 하지 않는 것이 맞는 것

### 13.1 자율 판단형 dosing AI

하면 안 된다.  
RNest는 **보조, 검산, 구조화, 근거 제공**까지가 맞고, 자율 처방/자율 설정은 리스크가 너무 크다.

### 13.2 EHR write-back 우선 개발

지금 RNest의 핵심 차별화는 개인 회복 + bedside nurse workflow다.  
직접 EHR 쓰기까지 가면 인증/보안/영업 복잡도가 급격히 올라간다.

### 13.3 단순 대화형 general assistant 추가

가장 쉬워 보이지만 차별화가 약하다.  
RNest는 이미 general chat보다 더 강한 자산을 갖고 있다.

---

## 14. 최종 추천

RNest에서 가장 먼저 해야 할 3가지는 아래다.

1. **근거기반 임상 코파일럿**
   - 이유: 지금 임상 검색을 가장 빠르게 "신뢰 가능한 제품"으로 한 단계 끌어올린다.
2. **오더 파서 + 계산기 결합**
   - 이유: 간호사 실사용 가치가 가장 높고, RNest 기존 계산기 자산을 바로 살린다.
3. **예측형 회복 코파일럿**
   - 이유: RNest만 할 수 있는 차별화 영역이며 구독 가치가 크다.

그 다음 순서는 아래가 좋다.

4. SBAR/인계/메모 자동화  
5. 개인 회복 프로파일 학습  
6. 멀티모달 캡처  
7. 그룹 인텔리전스  
8. FHIR/SMART on FHIR

즉 RNest의 다음 AI는 "채팅을 더 잘하는 AI"가 아니라,

**근거를 보여주고 -> 계산을 돌리고 -> 타이밍 맞게 개입하고 -> 문서를 만들고 -> 사용자 패턴을 학습하는 AI 운영체계**

가 되어야 한다.

---

## 참고 자료

- [FDA: Examples of Software Functions That Are NOT Medical Devices](https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices)
- [openFDA Drug Labeling API](https://open.fda.gov/apis/drug/label/)
- [DailyMed Web Services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm)
- [HIRA DUR 안내](https://www.hira.or.kr/cms/guide_busi/03/03/index.html)
- [CDC/NIOSH Training for Nurses on Shift Work and Long Work Hours](https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod2/08.html)
- [Just-in-Time Adaptive Intervention for Stabilizing Sleep Hours of Japanese Workers](https://pubmed.ncbi.nlm.nih.gov/38861313/)
- [AHRQ TeamSTEPPS Module 1: Communication](https://www.ahrq.gov/teamstepps-program/curriculum/communication/index.html)
- [AHRQ Improving Teamwork and Communication](https://www.ahrq.gov/antibiotic-use/long-term-care/safety/teamwork.html)
- [Electronic Nursing Handover System study](https://pubmed.ncbi.nlm.nih.gov/37221502/)
- [Co-design of a nurse handover tool](https://pubmed.ncbi.nlm.nih.gov/39925665/)
- [Generative AI-Based Nursing Diagnosis and Documentation Recommendation](https://pubmed.ncbi.nlm.nih.gov/40384067/)
- [Use of an ambient AI tool to improve quality of clinical documentation](https://pubmed.ncbi.nlm.nih.gov/39371531/)
- [Ambient AI reduces documentation time and enhances quality](https://pubmed.ncbi.nlm.nih.gov/41198484/)
- [Informed Consent for Ambient Documentation Using Generative AI](https://pubmed.ncbi.nlm.nih.gov/40694347/)
- [Generative AI Demonstrated Difficulty Reasoning on Nursing Flowsheet Data](https://pubmed.ncbi.nlm.nih.gov/40417556/)
- [HL7 FHIR Overview](https://hl7.org/fhir/overview.html)
- [SMART on FHIR for Developers](https://smarthealthit.org/for-developers/)
- [SMART on FHIR API](https://smarthealthit.org/smart-on-fhir-api/)
