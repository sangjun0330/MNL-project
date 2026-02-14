# Handoff Evaluation Runner

## 목적
- AI 인계 엔진을 감으로 튜닝하지 않고, 고정된 평가셋으로 수치 기반 개선을 진행합니다.
- 환자 분리/할일 추출/우선순위 반영/uncertainty 경고를 케이스 단위로 점검합니다.

## 실행
- 기본 실행:
  - `npm run handoff:eval`
- 다른 평가셋 지정:
  - `npm run handoff:eval -- datasets/handoff-eval/starter.ko.json`
- JSON 결과 출력:
  - `npm run handoff:eval -- --json`

## 기본 평가셋
- 파일: `datasets/handoff-eval/starter.ko.json`
- 구성:
  - 단일 환자 baseline
  - 다중 환자 inline 인계
  - 대명사 연속 문맥
  - 혼동쌍(HR/RR, DC/D-C)
  - 미해석 약어
  - 병동 이벤트 + 환자 이벤트 혼합
  - 긴 인계 안정성

## 지표
- case score(0~1): 가중 합 점수
  - segment split accuracy(환자 분리 정확도)
  - todo recall(기대 업무 항목 검출율)
  - globalTop recall(상위 우선 항목 검출율)
  - uncertainty include recall(필수 경고 검출율)
  - patient count pass
- runtime:
  - 평균/중앙값(p50)/p95 처리시간(ms)
- pass@80:
  - case score 0.8 이상 케이스 비율

## 평가셋 스키마(요약)
- `cases[].id`: 문자열
- `cases[].dutyType`: `day|evening|night`
- 입력:
  - `segments[]` 또는 `transcript`
- `segments[]` 항목:
  - `text`: 문장
  - `expectedPatient`: `"P1" | "P2" | ... | null`
- `expected`:
  - `patientCount` 또는 `patientCountMin`
  - `todoPatterns[]`: `{ patient?, pattern, flags? }`
  - `globalTopPatterns[]`: `{ pattern, rankMax?, flags? }`
  - `uncertaintyKindsMustInclude[]`
  - `uncertaintyKindsMustNotInclude[]`

## 운영 권장
1. 스타터셋으로 러너 정상동작 확인
2. 실제 병동 로그(비식별) 300+건으로 확장셋 작성
3. 배포 전 CI에서 `handoff:eval` 점수 하한선(예: pass@80 >= 0.85) 적용
