export const SERVICE_CONSENT_VERSION = "2026-03-12-1";
export const PRIVACY_POLICY_VERSION = "2026-03-12";
export const TERMS_OF_SERVICE_VERSION = "2026-03-12";
export const SERVICE_CONSENT_GATE_RELEASED_AT = "2026-03-12T00:00:00+09:00";

export type ServiceConsentItemKey = "records_storage" | "ai_usage";

export type ServiceConsentItem = {
  key: ServiceConsentItemKey;
  title: string;
  description: string;
  details: string[];
};

export type UserServiceConsentSnapshot = {
  recordsStorageConsentedAt: string | null;
  aiUsageConsentedAt: string | null;
  consentCompletedAt: string | null;
  consentVersion: string | null;
  privacyVersion: string | null;
  termsVersion: string | null;
};

export const SERVICE_CONSENT_ITEMS: ServiceConsentItem[] = [
  {
    key: "records_storage",
    title: "기록 저장 및 동기화 동의",
    description:
      "RNest에 입력한 일정, 메모, 감정, 건강기록, 생리/개인화 설정을 클라우드에 저장하고 계정 간 동기화하는 데 동의합니다. 동의하지 않으면 RNest 기록 기능을 사용할 수 없습니다.",
    details: [
      "저장 항목: 일정, 메모, 감정, 건강기록, 생리/개인화 설정",
      "저장 위치/수탁사: Supabase 기반 클라우드 저장소",
      "국외 이전 사실: 서비스 운영 과정에서 국외 클라우드 저장/처리가 발생할 수 있습니다.",
      "보유기간: 계정 유지 기간 또는 관련 법령/운영상 필요한 기간",
      "거부 시 불이익: RNest 기록 저장 및 동기화 기능을 사용할 수 없습니다.",
    ],
  },
  {
    key: "ai_usage",
    title: "AI 기능 사용 동의",
    description:
      "AI 맞춤회복, 오늘의 오더, AI 검색 제공을 위해 필요한 기록 요약 또는 입력 내용을 외부 AI 서비스로 전송하는 데 동의합니다. 동의하지 않으면 AI 기능을 사용할 수 없습니다.",
    details: [
      "전송 항목: AI 답변 생성에 필요한 기록 요약, 질문 입력, 업로드한 이미지",
      "외부 AI 서비스: OpenAI 및 Cloudflare AI Gateway 사용 환경이 포함될 수 있습니다.",
      "국외 이전 사실: AI 처리 과정에서 국외 클라우드 전송/처리가 발생할 수 있습니다.",
      "유의사항: AI 결과는 진단이나 처방을 대체하지 않으며, 환자 식별정보를 입력하면 안 됩니다.",
      "거부 시 불이익: AI 맞춤회복, 오늘의 오더, AI 검색 기능을 사용할 수 없습니다.",
    ],
  },
];

export function buildServiceConsentEventPayload() {
  return {
    consentVersion: SERVICE_CONSENT_VERSION,
    privacyVersion: PRIVACY_POLICY_VERSION,
    termsVersion: TERMS_OF_SERVICE_VERSION,
    items: SERVICE_CONSENT_ITEMS,
  };
}
