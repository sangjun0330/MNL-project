"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { useI18n } from "@/lib/useI18n";

function ToolCard({
  href,
  title,
  summary,
  badge,
  disabled,
}: {
  href: string;
  title: string;
  summary: string;
  badge: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Card className="p-5 opacity-60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold text-ios-text">{title}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{summary}</div>
          </div>
          <span className="rounded-full border border-ios-sep bg-white px-2 py-1 text-[11px] font-semibold text-ios-sub">{badge}</span>
        </div>
      </Card>
    );
  }

  return (
    <Link href={href} className="block">
      <Card className="p-5 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold text-ios-text">{title}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{summary}</div>
          </div>
          <span className="rounded-full border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] px-2 py-1 text-[11px] font-semibold text-[color:var(--wnl-accent)]">{badge}</span>
        </div>
      </Card>
    </Link>
  );
}

export function ToolsPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div>
        <div className="text-[30px] font-extrabold tracking-[-0.02em]">{t("툴")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">
          {t("현장 업무를 빠르게 처리하는 RNest 보조 기능입니다.")}
        </div>
      </div>

      <div className="space-y-3">
        <ToolCard
          href="/tools/handoff"
          title={t("AI 인계")}
          summary={t("온디바이스 전사(manual/wasm_local) + PHI 마스킹으로 환자별 인계 요약을 생성합니다.")}
          badge={t("로컬 전용")}
          disabled={!HANDOFF_FLAGS.handoffEnabled}
        />
      </div>

      <Card className="p-5">
        <div className="text-[13px] font-semibold text-ios-text">{t("보안 원칙")}</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] text-ios-sub">
          <li>{t("원문 음성/원문 텍스트/evidence는 서버로 전송하지 않습니다.")}</li>
          <li>{t("원문은 로컬 Vault(TTL 24h)에서만 암호화 저장됩니다.")}</li>
          <li>{t("구조화 결과는 비식별 데이터만 TTL 7d로 보관됩니다.")}</li>
          <li>{t("local_only 모드에서는 web_speech/원격 sync를 자동 차단합니다.")}</li>
          <li>{t("strict 모드에서는 인증 사용자만 저장할 수 있고 secure context를 강제합니다.")}</li>
          <li>{t("저장/파기/정책차단 감사로그를 로컬에 남기고 전체 완전파기를 지원합니다.")}</li>
        </ul>
      </Card>
    </div>
  );
}

export default ToolsPage;
