# AI 임상검색 프롬프트 시스템 개선 리포트

작성일: 2026-03-29

---

## 1. 현행 시스템 진단

### 1.1 전체 파이프라인 요약

```
질문 입력
  → Signal Lexicon (regex 30+개로 신호 25개 추출)
  → Route Decision (12축 규칙 기반 결정)
  → Tiny Router (불확실시 GPT로 보정, 선택적)
  → Artifact Planner (blueprint: microPack, directive, section hint)
  → Contract 선택 (base 4개 + optional 최대 4개) + Budget Fit (2600~4200자)
  → Developer Prompt 조립 (6개 섹션, bullet 15~20개)
  → OpenAI Responses API 호출 (gpt-5.4 또는 gpt-5.2)
  → Quality Gate (heuristic 18개 체크 + model gate)
  → Repair (실패시 답변 전체 재생성, 최대 2 pass)
  → 번역(en), 저장, continuation token 발급
```

### 1.2 잘 설계된 부분

- Signal lexicon → route decision 파이프라인의 분류 체계 자체는 정교하고 임상적으로 의미 있는 축을 잡고 있음
- 안전 가드(민감 패턴 차단, 크레딧 복원, retry with backoff)의 운영 안정성이 높음
- Blueprint의 microPack 점수 시스템이 질문 특성에 따라 답변 구성 요소를 선택하는 아이디어는 올바름
- 크레딧 차감 → 실패시 복원 패턴이 정확함

### 1.3 핵심 문제 3가지

| # | 증상 | 근본 원인 |
|---|---|---|
| P1 | 답변 내용이 끊겨 있고 연속적이지 않음 | Developer prompt가 독립 bullet 15~20개로 구성되어 모델이 체크리스트식으로 수행 |
| P2 | Premium 검색에서 토큰 과다 사용 | output token 상한이 과도하고 quality gate+repair 파이프라인이 답변 전체를 재생성 |
| P3 | 출력 퀄리티가 프롬프트 복잡도 대비 낮음 | Contract/directive가 너무 granular하여 오히려 모델의 자연스러운 서술을 방해 |

---

## 2. 문제별 상세 진단

### 2.1 [P1] 답변 연속성 문제

#### 현상

답변이 아래와 같은 패턴으로 나오는 경향:

```
[결론 1~2문장]

핵심
리드 문장...
- bullet
- bullet

빠른 구분 포인트
(갑자기 맥락 없이 한 줄 등장)

빠른 확인 순서
A → B → C → D

지금 할 일
리드 문장...
- bullet (위와 일부 중복)

보고 기준
- bullet

주의
- bullet (위 내용 반복)
```

#### 원인 분석

**A. Developer prompt의 구조적 문제**

현재 조립된 prompt는 6개 섹션에 걸쳐 bullet 15~20개가 나열됨:

```
[기본 원칙]
- 너는 간호사 전용 임상 AI다...
- 답변은 교과서식 설명보다...
- 위험 상황에서는 설명보다 행동과 escalation을...
- ...10개 내외

[질문 맞춤 초점]
- 이번 질문에서는 즉시 중단·보고 기준과...

[우선순위]
- 행동과 설명이 섞인 질문이므로...

[확인 범위]
- (projection directive)

[예외·보고·안전]
- 대상이 완전히 특정되지 않으면...

[출력 형식]
- 반드시 사용자의 실제 질문에 대한...
```

GPT-5.x는 이 bullet들을 **각각 별도의 과제**로 인식하고, 모든 지시를 만족시키려 시도함. 그 결과:
- "빠른 구분 포인트"를 억지로 삽입
- "빠른 확인 순서" 화살표를 별도 블록으로 삽입
- "보고 기준"을 또 별도 섹션으로 분리
- 각 블록이 독립적인 미니 답변처럼 작성되어 전체 흐름이 끊김

**B. "빠른 구분 포인트" / "빠른 확인 순서" 고정 포맷 강제**

`medSafetyArtifactPlanner.ts`의 projection에서 `needsFastDistinctionPoint`, `needsQuickCheckSequence` 플래그가 true이면 아래 지시가 추가됨:

```
"이번 답변에는 '빠른 구분 포인트'를 한 줄만 추가하고, 설명 문장은 붙이지 않는다."
"이번 답변에는 '빠른 확인 순서'를 3~5단계 화살표 한 줄로만 추가한다."
```

이 지시는 모델에게 **고정 포맷의 독립 블록을 삽입하라**는 명령이므로, 서술 흐름을 끊는 직접적 원인이 됨.

**C. Quality gate의 heuristic 체크가 포맷 준수를 강제**

`medSafetyQualityRubric.ts`의 `buildHeuristicQualityDecision()`에서 18개 atomic check 중:
- `fast_distinction_point_present`: "빠른 구분 포인트"가 있는지 체크
- `quick_check_sequence_present`: "빠른 확인 순서"가 있는지 체크
- `card_structure`: 카드 3단 구조(태그-리드-본문) 준수 여부 체크

이 체크들이 fail하면 `structure_gap` 또는 `bedside_gap`으로 분류되어 repair가 발동됨. 즉 모델이 자연스럽게 서술하려 해도 **gate가 강제로 포맷을 교정**하는 구조.

**D. Legacy prompt의 카드 3단 구조 규칙**

`MED_SAFETY_LEGACY_DENSE_CORE_PROMPT_REFERENCE`에 하드코딩된 규칙:

```
[카드 3단 구조 — 반드시 준수]
- 답변은 반드시 '카드 3단 구조'로 작성한다.
  1층(태그): 짧은 소제목 한 줄
  2층(리드): 핵심을 한 문장으로 요약
  3층(본문): 세부 내용을 bullet으로
```

이 구조 자체는 나쁘지 않으나, **모든 질문에 동일하게 적용**되면서 간단한 질문에도 과도한 구조화가 일어나고, 복합 질문에서는 각 카드가 단절됨.

#### 영향도

사용자가 답변을 읽을 때 "AI가 정리해준 문서"가 아니라 "따로따로 만든 블록을 붙여놓은 것" 같은 인상을 받음. 이것은 신뢰도와 가독성 모두에 부정적.

---

### 2.2 [P2] Premium 토큰 과다 사용

#### 현재 Premium 토큰 예산

**`buildPromptProfile()`에서 설정하는 outputTokenCandidates:**

| 질문 유형 | Standard | Premium |
|---|---|---|
| short + low risk | [3600, 3000, 2400] | [8000, 6000, 5000] |
| 일반 | [5400, 4800, 4200] | [14000, 12000, 10000] |
| high risk / detailed / image | [7000, 6200, 5400] | [16000, 14000, 12000] |

Premium이 Standard 대비 2.2~2.7배 높은 output token 상한을 가짐.

#### 실제 답변 길이 vs 할당량

실제 임상 답변은 보통:
- 짧은 질문: 800~1500자 (약 300~600 토큰)
- 일반 질문: 2000~4000자 (약 800~1600 토큰)
- 복합/고위험 질문: 4000~8000자 (약 1600~3200 토큰)

즉, max_output_tokens 16000 중 **실제 텍스트로 나오는 것은 10~20%**이고, 나머지는 reasoning token으로 소비됨.

#### 최악의 경우 토큰 소비 시나리오 (Premium, high risk)

| 단계 | 모델 | max_output_tokens | 실행 조건 |
|---|---|---|---|
| Tiny Router | gpt-5.2 | 220 | confidence≠high (대부분) |
| Main Answer | gpt-5.4 | 16000 | 항상 |
| Quality Gate (model) | gpt-5.2 | 220 | format=sectioned (거의 항상) |
| Repair Pass 1 | gpt-5.2 | 16000 | gate fail시 |
| Quality Gate 2 | gpt-5.2 | 220 | repair 후 재평가 |
| Repair Pass 2 | gpt-5.2 | 16000 | high risk + safety gap |
| Quality Gate 3 | gpt-5.2 | 220 | repair 2 후 재평가 |

**최악 총합: ~48,880 output tokens** (input tokens 별도)

main answer의 gpt-5.4가 reasoning을 많이 쓰면 input+output 합산 50,000~80,000 토큰도 가능.

#### 구조적 비효율 지점

**A. `shouldRunQualityGate()`가 거의 항상 true**

```typescript
if (args.decision.format === "sectioned") return true;
```

`format`이 `sectioned`이 아닌 경우는 `answerDepth=short + communicationProfile=none + detailProfile=lean`인 경우뿐. 대부분의 임상 질문은 `sectioned`으로 분류됨.

→ model gate가 거의 모든 질문에서 실행됨 (gpt-5.2 추가 호출).

**B. Repair가 답변 전체를 재생성**

```typescript
// repair의 max_output_tokens
maxOutputTokens: args.profile.outputTokenCandidates[0] ?? 1200,
```

main answer와 동일한 token 예산(premium: 14000~16000)으로 답변 전체를 재생성. 실제로는 기존 답변의 일부만 수정하면 되는데 전체 재작성을 요구.

**C. Heuristic pass여도 model gate를 호출**

현재 로직:
```typescript
const shouldCallModelGate =
  args.allowRepair &&
  shouldRunQualityGate({...});
```

heuristic 결과와 무관하게 `shouldRunQualityGate()` 조건만으로 판단. heuristic이 완전히 pass인 경우에도 model gate API 호출이 발생.

**D. 스트리밍 모드에서 repair가 비활성화**

```typescript
allowRepair: !mainAttempt.streamed,
```

스트리밍이 기본 모드이므로 대부분의 요청에서 repair가 안 돌아감. 반대로 repair가 돌 때는 비스트리밍이라 사용자 대기 시간이 극도로 길어짐 (main 생성 + gate + repair + 재 gate = 4회 순차 API 호출).

---

### 2.3 [P3] 프롬프트 인식 정교화

#### Signal Lexicon의 한계

현재 `medSafetySignalLexicon.ts`의 intent 분류:

```typescript
function inferIntentScores(query: string): IntentScoreMap {
  return {
    compare: countPatternHits(query, COMPARE_PATTERNS),
    numeric: countPatternHits(query, NUMERIC_PATTERNS),
    device: countPatternHits(query, DEVICE_PATTERNS),
    action: countPatternHits(query, ACTION_PATTERNS),
    knowledge: 0,  // 항상 0, fallback
  };
}
```

**문제점:**
- 패턴 매칭 횟수를 점수로 사용하므로, 길고 복합적인 질문일수록 여러 intent가 동시에 높은 점수를 받아 `mixedIntent`가 됨
- "PEEP를 올렸는데 SpO2가 안 올라요"는 device(PEEP) + numeric(SpO2) + action(안 올라요→대응 필요) 모두 매칭 → mixedIntent, 하지만 실제로는 단일 action 질문
- `knowledge`가 항상 0이므로, 순수 지식 질문도 다른 intent 패턴이 하나라도 걸리면 해당 intent로 분류됨

#### Contract 시스템의 과도한 세분화

18개 contract ID:
```
base_role_goal, base_decision_priority, base_safety_certainty, base_render_discipline,
intent_knowledge, intent_action, intent_compare, intent_numeric,
risk_high_modifier, risk_mixed_modifier,
communication_modifier, exception_modifier, ambiguity_modifier,
domain_vent_abga, domain_med_device, domain_reporting,
output_safety_guard, output_no_meta_guard
```

각 contract는 하나의 bullet 지시문을 생성. 여기에 projection directive 8개가 추가됨:
```
openingDirective, priorityDirective, coverageDirective, exceptionDirective,
communicationDirective, safetyDirective, compressionDirective, renderDirective
```

**총 최대 26개의 개별 지시가 developer prompt에 들어갈 수 있음.** Budget fit에서 일부가 drop되지만, 그래도 15~20개가 잔존.

이 수준의 granularity는 GPT-5.x에서 역효과:
- 모델이 지시를 각각 만족시키려 하면서 답변이 기계적이 됨
- 서로 약간 모순되는 지시가 있을 때 모델이 어느 쪽을 우선할지 판단 불가
- 같은 의미를 다른 말로 반복하는 지시가 있어 혼란 (overlap suppression이 있지만 의미적 유사를 완전히 잡지 못함)

#### Legacy prompt vs Dynamic prompt의 갭

`hybrid_shadow` 모드에서 legacy와 dynamic을 비교한 shadow comparison이 있는데, 이 데이터가 의사결정에 반영되는 경로가 없음. 즉 어느 쪽이 더 나은지 측정은 하는데 개선 루프가 닫혀있지 않음.

---

## 3. 개선 방안

### 3.1 Phase 1: 토큰 절감 (퀄리티 무변경)

난이도: 낮음 | 예상 효과: Premium 토큰 30~50% 절감 | 리스크: 낮음

#### 3.1.1 Premium outputTokenCandidates 하향

**현재:**
```typescript
isPremiumSearch
  ? shortSimple ? [8000, 6000, 5000]
    : highRiskDetailed ? [16000, 14000, 12000]
    : [14000, 12000, 10000]
```

**변경:**
```typescript
isPremiumSearch
  ? shortSimple ? [5000, 4000, 3200]
    : highRiskDetailed ? [10000, 8000, 6400]
    : [8000, 6400, 5000]
```

**근거:** 실제 답변이 8000자(~3200토큰)를 넘는 경우가 극히 드물고, reasoning token은 output token 상한과 별개로 사용됨. max_output_tokens를 줄여도 reasoning 품질은 유지되면서 텍스트 생성 예산만 적정 수준으로 맞춰짐.

**검증 방법:** 변경 전후 동일 질문 세트로 답변 길이/품질 비교. 답변이 잘리는(incomplete_details) 케이스가 없는지 확인.

#### 3.1.2 Repair max_output_tokens를 실제 답변 길이 기반으로 cap

**현재:**
```typescript
maxOutputTokens: args.profile.outputTokenCandidates[0] ?? 1200,
```

**변경:**
```typescript
const mainAnswerEstimatedTokens = Math.ceil(normalizeText(currentAnswer).length / 2.5);
const repairCap = Math.max(2400, Math.min(
  args.profile.outputTokenCandidates[0] ?? 6000,
  Math.ceil(mainAnswerEstimatedTokens * 1.4)
));
maxOutputTokens: repairCap,
```

**근거:** Repair는 기존 답변을 약간 수정하는 것이므로 원본의 1.4배 토큰이면 충분. 최소 2400은 안전 하한.

#### 3.1.3 Heuristic pass이면 model gate 스킵

**현재:**
```typescript
const shouldCallModelGate =
  args.allowRepair &&
  shouldRunQualityGate({...});
```

**변경:**
```typescript
const shouldCallModelGate =
  args.allowRepair &&
  shouldRunQualityGate({...}) &&
  heuristicDecision.verdict !== "pass";
```

**근거:** Heuristic이 18개 체크를 모두 통과했으면 model gate가 추가로 잡아낼 문제가 거의 없음. model gate의 gpt-5.2 호출 1회를 절약.

#### 3.1.4 Repair 2nd pass 조건 강화

**현재:**
```typescript
const allowSecondRepairPass =
  args.decision.risk === "high" &&
  currentGateDecision.issues.some((issue) =>
    ["notify_gap", "exception_gap", "safety_gap"].includes(issue)
  );
```

**변경:**
```typescript
const allowSecondRepairPass =
  args.decision.risk === "high" &&
  currentGateDecision.criticalIssues.length > 0 &&
  currentGateDecision.issues.some((issue) =>
    ["safety_gap"].includes(issue)
  );
```

**근거:** 2nd repair pass는 safety_gap이 있을 때만으로 한정. notify_gap, exception_gap은 1st repair에서 대부분 해결되고, 안 되더라도 안전에 직접적 위험은 아님.

#### Phase 1 예상 토큰 절감

| 항목 | 절감량 |
|---|---|
| Premium output token 상한 하향 | reasoning token 간접 절감 20~30% |
| Repair cap | repair 발동시 output token 50~70% 절감 |
| Model gate 스킵 (heuristic pass) | 전체 요청의 ~40%에서 gpt-5.2 호출 1회 절약 |
| 2nd repair 제한 | 극소수 케이스지만 16000 토큰 절약 |

---

### 3.2 Phase 2: 답변 연속성 개선

난이도: 중간 | 예상 효과: 답변 가독성/자연스러움 대폭 향상 | 리스크: 중간 (프롬프트 변경은 A/B 테스트 필요)

#### 3.2.1 Developer prompt를 서술형 narrative로 변환

**현재 구조 (bullet 나열):**
```
[기본 원칙]
- 지시 1
- 지시 2
- ...
- 지시 10

[질문 맞춤 초점]
- 지시 11

[우선순위]
- 지시 12

[확인 범위]
- 지시 13

[예외·보고·안전]
- 지시 14

[출력 형식]
- 지시 15
- 지시 16
- 지시 17
```

**변경 구조 (서술형 3블록):**
```
[역할과 원칙]
너는 간호사 전용 임상 AI다. 모든 답변의 최우선 목표는 간호사가 지금 이 상황에서
무엇을 이해해야 하고 무엇을 해야 하는지 빠르고 명확하게 전달하는 것이다.
교과서식 나열보다 실무에서 바로 쓸 수 있는 정보를 우선하되, 핵심 차이와 판단
포인트가 기억되도록 쓴다. 불확실한 내용은 추정하지 않으며, 최종 기준은 기관
프로토콜, 의사 지시, 약제부, 제조사 IFU다.

[이 질문의 초점]
{route decision에서 자연어로 합성된 2~3문장}

[출력 형태]
답변은 제목 없는 결론 문단으로 시작하고, 필요시 소제목으로 구분된 섹션을
이어간다. 마크다운 강조(**, ##, 백틱, 표)는 쓰지 않는다. 한국어 존댓말로 쓴다.
하나의 글로 자연스럽게 이어지도록 쓰되, 급할 때 원하는 부분만 빠르게 찾을 수
있게 소제목을 둔다.
```

**핵심 변경점:**
- Section 6개 → 3개
- Bullet 15~20개 → 서술형 문장 (각 블록 3~5문장)
- 모델이 "여러 개의 개별 지시를 수행"하는 것이 아니라 "하나의 역할 설명을 읽고 글을 쓰는" 모드로 전환

**구현 위치:**
- `medSafetyPrompting.ts`의 `assembleMedSafetyDeveloperPrompt()` 내부에서 `buildPromptSections()` + `formatPromptSections()` 대신 새 함수 `buildNarrativePrompt()` 도입
- 기존 section/descriptor/contract 인프라는 유지하되, 최종 출력 형태만 변경

#### 3.2.2 Route decision의 자연어 요약 삽입

**현재:** route decision의 각 축이 별도 contract/directive bullet으로 변환됨

**변경:** route decision을 하나의 자연어 문단으로 합성하여 `[이 질문의 초점]` 블록에 삽입

```typescript
function buildRouteNarrative(decision: MedSafetyRouteDecision, locale: "ko" | "en"): string {
  // 예시 출력:
  // "이 질문은 약물 호환성에 관한 즉시 행동 질문이며, 대상 약물이 완전히
  //  특정되지 않았으므로 용량과 속도를 단정하지 않는다. 위험도가 높아
  //  중단/보고 기준을 먼저 제시하고, 보고 시 필요한 데이터 묶음을 포함한다."
}
```

**합성 로직:** decision의 intent, risk, entityClarity, communicationProfile, exceptionProfile 등을 조건 분기로 자연어 문장에 매핑. 기존 contract 시스템의 의미를 유지하되 출력 형태만 변경.

#### 3.2.3 "빠른 구분 포인트" / "빠른 확인 순서" 고정 포맷 제거

**현재:**
- `medSafetyArtifactPlanner.ts`에서 `needsFastDistinctionPoint`, `needsQuickCheckSequence` 플래그
- projection에 "이번 답변에는 '빠른 구분 포인트'를 한 줄만 추가하고..." 지시 삽입
- quality gate에서 해당 포맷 존재 여부 체크

**변경:**
- 두 플래그와 관련 projection directive 제거
- 대신 route narrative에 필요시 자연스럽게 녹이기:
  - 비교 질문: "실무에서 가장 빨리 구분할 수 있는 기준을 자연스럽게 포함한다"
  - 행동 질문: "bedside에서 확인할 순서를 흐름에 맞게 포함한다"
- quality gate의 `fast_distinction_point_present`, `quick_check_sequence_present` 체크 제거

**근거:** 이 두 요소는 유용하지만 **고정 포맷으로 강제**하면 답변 흐름이 끊김. "자연스럽게 포함하라"로 바꾸면 모델이 문맥에 맞게 녹여줌.

#### 3.2.4 카드 3단 구조 규칙 완화

**현재:** legacy prompt에 `[카드 3단 구조 — 반드시 준수]` 하드코딩

**변경:** 엄격한 3층 구조(태그-리드-본문) 대신:
```
답변은 제목 없는 결론 문단으로 시작한다. 이후 내용은 짧은 소제목으로 구분하되,
각 소제목 아래 첫 줄은 해당 내용의 핵심을 한 문장으로 요약한다.
전체가 하나의 글처럼 자연스럽게 이어져야 한다.
```

기존 "1층 태그, 2층 리드, 3층 본문" 형식은 유지하되 **"반드시 준수"를 "자연스럽게 따르라"**로 완화.

---

### 3.3 Phase 3: 프롬프트 인식 정교화로 퀄리티 향상

난이도: 높음 | 예상 효과: 답변의 임상적 적합성과 깊이 향상 | 리스크: 높음 (핵심 로직 변경)

#### 3.3.1 Quality gate를 "사후 수리"에서 "사전 가이드"로 전환

**현재 구조:**
```
main answer 생성 → gate 평가 → fail시 repair (답변 전체 재생성)
```

**변경 구조:**
```
route decision → "이 답변에 반드시 포함할 핵심 요소 N개" 추출
→ user prompt에 힌트로 삽입 → main answer 생성 (1회로 완결)
→ heuristic gate만 실행 (repair는 safety_gap만)
```

**구체적 구현:**

user prompt를 다음과 같이 변경:

```
사용자 질문: PEEP를 올렸는데 SpO2가 안 올라요

[이 답변에 반드시 포함할 요소]
1. 산소화 문제와 환기 문제의 분리 판단
2. bedside에서 지금 확인할 순서
3. 즉시 보고가 필요한 기준
```

**"반드시 포함할 요소" 추출 로직:**

기존 heuristic gate의 18개 atomic check를 **사전**에 실행하되, 답변이 아니라 **질문 + route decision**만으로 "이 질문에서 빠지면 안 되는 요소"를 결정:

```typescript
function buildMustIncludeHints(decision: MedSafetyRouteDecision, signals: MedSafetyQuestionSignals): string[] {
  const hints: string[] = [];
  // 기존 atomic check 조건을 그대로 활용
  if (decision.reportingNeed) hints.push("보고 시 필요한 데이터 묶음");
  if (decision.pairedProblemNeed) hints.push("두 문제의 분리 판단");
  if (decision.reversibleCauseNeed) hints.push("가역적 원인 확인 순서");
  if (decision.measurementGuardNeed) hints.push("수치/세팅의 기관별 차이 주의");
  if (decision.exceptionProfile !== "none") hints.push("주 추천이 적용되지 않는 조건");
  if (decision.risk === "high") hints.push("즉시 중단/보고 기준");
  // ... 최대 4개로 제한
  return hints.slice(0, 4);
}
```

**기대 효과:**
- Repair가 거의 필요 없어짐 → 토큰 대폭 절약
- 모델이 처음부터 핵심 요소를 인지하고 답변을 작성하므로 구조가 자연스러움
- Gate는 safety_gap 체크만 남기면 되므로 단순화

#### 3.3.2 Contract/directive 시스템 단순화

**현재:** 18개 contract + 8개 directive = 최대 26개 개별 지시

**변경:** 의미적으로 중복/유사한 것들을 통합하여 6개 "의미 축"으로 재구성

| 현재 contract | 통합 축 | 설명 |
|---|---|---|
| base_role_goal + base_decision_priority | **core_identity** | 역할과 답변 원칙 (서술형 1블록) |
| intent_* + risk_*_modifier + domain_* | **question_focus** | 이 질문의 특성과 초점 (route narrative 1문단) |
| communication_modifier + exception_modifier | **boundary** | 보고/예외 조건 (해당시만 1~2문장) |
| ambiguity_modifier + output_safety_guard | **safety** | 불확실성/안전 규칙 (해당시만 1문장) |
| base_safety_certainty + base_render_discipline | → core_identity에 통합 | |
| output_no_meta_guard | → 출력 형태 블록에 통합 | |

8개 projection directive도 동일하게 통합:
- openingDirective + priorityDirective → question_focus의 일부
- coverageDirective + exceptionDirective + communicationDirective → boundary의 일부
- safetyDirective → safety의 일부
- compressionDirective + renderDirective → 출력 형태 블록

**결과:** developer prompt가 3개 블록, 총 8~12문장으로 구성됨.

#### 3.3.3 Signal lexicon 의미 보강

**현재 한계:** regex 패턴 매칭 횟수 = intent 점수

**개선 A: knowledge intent에 양수 점수 부여**

```typescript
function inferIntentScores(query: string): IntentScoreMap {
  const scores = {
    compare: countPatternHits(query, COMPARE_PATTERNS),
    numeric: countPatternHits(query, NUMERIC_PATTERNS),
    device: countPatternHits(query, DEVICE_PATTERNS),
    action: countPatternHits(query, ACTION_PATTERNS),
    knowledge: countPatternHits(query, KNOWLEDGE_PATTERNS), // NEW
  };
  return scores;
}
```

새 `KNOWLEDGE_PATTERNS`: "뭐예요", "설명", "알려", "어떤 건가요", "원리", "기전", "분류" 등

**개선 B: 복합 매칭 시 주요 intent 가중**

현재는 단순 합산이라 "PEEP를 올렸는데 SpO2가 안 올라요"에서 device+numeric+action이 모두 1~2점씩 나와 mixedIntent가 됨.

개선: **문장 구조 기반 주요 intent 판별**

```typescript
// 질문의 마지막 절이 의도를 결정하는 경우가 많음
// "PEEP를 올렸는데(device/context) SpO2가 안 올라요(action/문제)"
// → 핵심 의도는 action
function adjustIntentByQuestionStructure(scores: IntentScoreMap, query: string): IntentScoreMap {
  // 마지막 절에 action 패턴이 있으면 action에 보너스
  // "차이가 뭐야"로 끝나면 compare에 보너스
  // ...
}
```

이것은 regex 수준에서 가능하며, LLM 호출 없이 정확도를 높일 수 있음.

#### 3.3.4 Shadow comparison 활용

현재 `hybrid_shadow` 모드에서 legacy vs dynamic 답변을 비교하는 `shadowComparison` 데이터가 있으나, 이 데이터가 시스템 개선에 피드백되는 경로가 없음.

**제안:**
- shadow comparison 결과를 로그에서 수집하여, dynamic prompt가 legacy보다 나은/못한 패턴을 분석
- 이 분석 결과를 contract 선택 로직이나 budget 설정에 반영하는 수동 피드백 루프 구축
- 충분한 데이터 수집 후 hybrid_shadow → hybrid_live 전환 판단에 활용

---

## 4. 실행 우선순위 및 일정 제안

### Phase 1: 토큰 절감 (즉시 효과)

| 항목 | 변경 파일 | 변경 규모 |
|---|---|---|
| 3.1.1 Premium output token 하향 | medSafetyPrompting.ts | 숫자 6개 변경 |
| 3.1.2 Repair token cap | openaiMedSafety.ts | ~10줄 |
| 3.1.3 Heuristic pass시 gate 스킵 | openaiMedSafety.ts | 조건 1줄 추가 |
| 3.1.4 2nd repair 조건 강화 | openaiMedSafety.ts | 조건문 수정 |

**예상 소요:** 구현 1~2시간, 테스트 반나절
**리스크:** 매우 낮음. 각 항목이 독립적이고 롤백 용이.
**검증:** 기존 golden set 질문으로 답변 품질 비교 + 토큰 사용량 모니터링

### Phase 2: 답변 연속성 개선

| 항목 | 변경 파일 | 변경 규모 |
|---|---|---|
| 3.2.1 서술형 narrative prompt | medSafetyPrompting.ts | 새 함수 1개 + 기존 함수 분기 |
| 3.2.2 Route narrative 합성 | medSafetyPrompting.ts | 새 함수 1개 (~50줄) |
| 3.2.3 빠른 구분/확인 제거 | medSafetyArtifactPlanner.ts, medSafetyQualityRubric.ts | 플래그/체크 제거 |
| 3.2.4 카드 3단 구조 완화 | medSafetyPrompting.ts (legacy prompt) | 텍스트 수정 |

**예상 소요:** 구현 반나절, A/B 테스트 1~2일
**리스크:** 중간. 프롬프트 변경은 답변 품질에 직접 영향. 반드시 기존 답변과 병렬 비교 필요.
**검증:** golden set 30~50개 질문으로 legacy vs 개선 답변 비교. 연속성/자연스러움/임상 정확성 평가.

### Phase 3: 프롬프트 인식 정교화

| 항목 | 변경 파일 | 변경 규모 |
|---|---|---|
| 3.3.1 사전 가이드 전환 | medSafetyPrompting.ts, openaiMedSafety.ts | 구조 변경 |
| 3.3.2 Contract 통합 | medSafetyPrompting.ts, medSafetyTypes.ts | 대규모 리팩터링 |
| 3.3.3 Signal lexicon 보강 | medSafetySignalLexicon.ts | 패턴 추가 + 로직 변경 |
| 3.3.4 Shadow comparison 활용 | 분석 작업 (코드 변경 최소) | 데이터 수집/분석 |

**예상 소요:** 구현 1~2일, A/B 테스트 3~5일
**리스크:** 높음. 핵심 파이프라인 구조 변경. Phase 2 완료 후 진행 권장.
**검증:** Phase 2와 동일 + 토큰 사용량 비교 + 고위험 질문 집중 테스트.

---

## 5. 주요 변경 파일 맵

```
src/lib/server/
├── medSafetyPrompting.ts      ← Phase 1, 2, 3 (핵심)
├── openaiMedSafety.ts         ← Phase 1, 3
├── medSafetyArtifactPlanner.ts ← Phase 2, 3
├── medSafetyQualityRubric.ts  ← Phase 2, 3
├── medSafetySignalLexicon.ts  ← Phase 3
└── medSafetyTypes.ts          ← Phase 3
```

---

## 6. 리스크 및 주의사항

1. **프롬프트 변경은 되돌리기 어려움** — 사용자가 이미 현재 포맷에 익숙해져 있을 수 있음. Phase 2~3은 env var로 legacy/new를 전환할 수 있게 구현해야 함 (현재 `OPENAI_MED_SAFETY_RUNTIME_MODE`와 유사한 메커니즘).

2. **Safety 관련 체크는 절대 약화하지 말 것** — 특히 `unsafe_specificity`, `protocol_caveat_presence` 체크와 민감 패턴 차단, 안전 경고 로직은 모든 Phase에서 보존.

3. **Golden set 테스트 필수** — `medSafetyGoldenSet.ts`가 존재하므로 이를 활용하여 변경 전후 답변 품질을 체계적으로 비교해야 함.

4. **토큰 절감과 품질은 트레이드오프가 아님** — Phase 1의 토큰 절감은 불필요한 과잉 할당을 줄이는 것이므로 품질에 영향 없음. Phase 2~3은 오히려 품질을 올리면서 구조적으로 토큰이 줄어드는 방향.

5. **스트리밍 모드에서의 repair 문제** — 현재 스트리밍 시 repair가 비활성이므로, Phase 3의 "사전 가이드" 방식이 도입되면 스트리밍에서도 품질 향상 효과를 얻을 수 있음. 이것은 현재 시스템의 가장 큰 맹점(대부분의 사용자가 스트리밍으로 사용하는데 quality gate의 혜택을 못 받음)을 해결함.
