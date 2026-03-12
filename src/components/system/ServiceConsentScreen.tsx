"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { SERVICE_CONSENT_ITEMS } from "@/lib/serviceConsent";

type Props = {
  onSubmit: (input: { recordsStorage: true; aiUsage: true }) => Promise<void>;
};

function formatConsentError(message: string) {
  if (message.includes("required_consents_missing")) {
    return "필수 동의 항목을 모두 체크해 주세요.";
  }
  if (message.includes("login_required")) {
    return "로그인 상태를 다시 확인한 뒤 시도해 주세요.";
  }
  if (message.includes("failed_to_confirm_service_consent")) {
    return "동의 저장은 완료됐지만 확인 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (message.includes("failed_to_save_service_consent")) {
    return "동의 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return message || "동의 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

function ConsentCard({
  checked,
  title,
  description,
  details,
  accent,
  badge,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  details: string[];
  accent: "storage" | "ai";
  badge: string;
  onChange: (checked: boolean) => void;
}) {
  const accentClass =
    accent === "storage"
      ? "border-[#DCE6F2] bg-[#F7FAFD] text-[#24415D]"
      : "border-[#E5DCF7] bg-[#FAF7FE] text-[#4C347A]";
  const iconClass =
    accent === "storage"
      ? "border-[#D4E0EE] bg-white text-[#24415D]"
      : "border-[#E4D8F6] bg-white text-[#4C347A]";

  return (
    <section
      className={cn(
        "rounded-[24px] border bg-white transition-all duration-200",
        checked ? "border-[#13273F] shadow-[0_18px_44px_rgba(15,23,42,0.10)]" : "border-[#E6ECF3] shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
      )}
    >
      <label className="block cursor-pointer p-5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <div className="flex items-start gap-4">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border", iconClass)}>
            {accent === "storage" ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
                <path d="M8 9h8" />
                <path d="M8 13h8" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.8 4.5L18 9.3l-4.2 1.8L12 15.6l-1.8-4.5L6 9.3l4.2-1.8z" />
                <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z" />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={cn("inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold", accentClass)}>
                  {badge}
                </div>
                <h2 className="mt-3 text-[18px] font-bold tracking-[-0.02em] text-[#10243E]">{title}</h2>
              </div>
              <span
                className={cn(
                  "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                  checked ? "border-[#13273F] bg-[#13273F] text-white" : "border-[#CBD7E4] bg-white text-transparent"
                )}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.26a1 1 0 0 1-1.42 0L3.29 9.165a1 1 0 1 1 1.42-1.408l4.09 4.123 6.49-6.543a1 1 0 0 1 1.414-.006z" clipRule="evenodd" />
                </svg>
              </span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-[#52657A]">{description}</p>
          </div>
        </div>
      </label>
      <details className="mx-5 mb-5 rounded-[18px] border border-[#E9EEF4] bg-[#FAFCFE] px-4 py-3">
        <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-[#26486B]">
          자세히 보기
        </summary>
        <ul className="mt-3 space-y-2 text-[12.5px] leading-5 text-[#53667A]">
          {details.map((detail) => (
            <li key={detail} className="flex gap-2">
              <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-[#8CA0B5]" />
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function ServiceConsentScreen({ onSubmit }: Props) {
  const [recordsStorage, setRecordsStorage] = useState(false);
  const [aiUsage, setAiUsage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = recordsStorage && aiUsage && !submitting;

  const handleSubmit = async () => {
    if (!recordsStorage || !aiUsage || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ recordsStorage: true, aiUsage: true });
    } catch (nextError) {
      const rawMessage =
        nextError instanceof Error && nextError.message.trim()
          ? nextError.message.trim()
          : "동의 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      setError(formatConsentError(rawMessage));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-[linear-gradient(180deg,#F7FAFD_0%,#EEF3F8_100%)]">
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col px-5 pb-[calc(144px+env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]">
        <div className="rounded-[32px] border border-[#E2E8F0] bg-white/92 px-5 py-6 shadow-[0_22px_64px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[#D6E1EC] bg-[#F5F8FB] px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-[#274A6C]">
              마지막 단계
            </div>
            <div className="text-[12px] font-medium text-[#71859A]">온보딩 완료 후 필수 동의 2개만 체크하면 바로 시작됩니다.</div>
          </div>
          <h1 className="mt-4 text-[30px] font-extrabold tracking-[-0.035em] text-[#10243E]">
            시작 전에 동의만 마무리해 주세요
          </h1>
          <p className="mt-3 max-w-[560px] text-[14px] leading-6 text-[#51667C]">
            RNest는 기록을 클라우드에 저장하고, AI 맞춤회복을 위해 외부 AI 클라우드를 사용합니다. 아래 두 항목에 모두 동의해야 앱을 사용할 수 있습니다.
          </p>
          <div className="mt-5 rounded-[20px] border border-[#E7ECF3] bg-[#F8FBFE] px-4 py-3 text-[12.5px] leading-5 text-[#5A6E84]">
            동의하지 않으면 기록 저장, 일정 연동, AI 맞춤회복, AI 검색을 사용할 수 없습니다.
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {SERVICE_CONSENT_ITEMS.map((item) => {
            const checked = item.key === "records_storage" ? recordsStorage : aiUsage;
            const onChange = item.key === "records_storage" ? setRecordsStorage : setAiUsage;
            return (
              <ConsentCard
                key={item.key}
                checked={checked}
                title={item.title}
                description={item.description}
                details={item.details}
                accent={item.key === "records_storage" ? "storage" : "ai"}
                badge={item.key === "records_storage" ? "기록 저장" : "AI 기능"}
                onChange={onChange}
              />
            );
          })}
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[115] bg-[linear-gradient(180deg,rgba(238,243,248,0)_0%,rgba(238,243,248,0.92)_26%,rgba(238,243,248,1)_100%)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-10">
          <div className="pointer-events-auto mx-auto max-w-[720px] rounded-[28px] border border-[#E1E7EF] bg-white/96 px-4 py-4 shadow-[0_22px_50px_rgba(15,23,42,0.12)] backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-[#10243E]">
                  {canSubmit ? "동의가 모두 선택됐습니다." : "필수 동의 2개를 모두 체크해 주세요."}
                </div>
                <div className="mt-1 text-[12.5px] leading-5 text-[#5B6F84]">
                  문서를 확인하려면 아래 링크를 열고, 돌아와서 바로 시작할 수 있습니다.
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", recordsStorage ? "bg-[#13273F]" : "bg-[#D3DCE6]")} />
                <span className={cn("h-2.5 w-2.5 rounded-full", aiUsage ? "bg-[#13273F]" : "bg-[#D3DCE6]")} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] font-semibold text-[#26486B]">
              <Link href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                이용약관
              </Link>
              <Link href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                개인정보처리방침
              </Link>
              <button type="button" onClick={() => signOut()} className="underline underline-offset-4">
                로그아웃
              </button>
            </div>
            {error ? (
              <div className="mt-4 rounded-[16px] border border-[#F2C4C4] bg-[#FFF5F5] px-4 py-3 text-[12.5px] text-[#A33A3A]">
                {error}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#10243E] px-5 text-[14px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-[#B9C6D3]"
            >
              {submitting ? "동의 저장 중..." : "동의하고 시작"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
