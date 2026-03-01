"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { formatKoreanDate } from "@/lib/date";
import { buildShopRecommendations, SHOP_CATEGORIES, type ShopCategoryKey } from "@/lib/shop";
import { useAppStoreSelector } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

function StorefrontIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 10l1.4-4.6A2 2 0 0 1 7.3 4h9.4a2 2 0 0 1 1.9 1.4L20 10" />
      <path d="M5 10h14" />
      <path d="M6 10v7a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7" />
      <path d="M9 19v-4h6v4" />
    </svg>
  );
}

function scoreLabel(score: number) {
  if (score >= 13) return "높음";
  if (score >= 9) return "보통";
  return "기본";
}

function summaryFromTopSignal(label: string | null, reason: string | null) {
  if (!label || !reason) {
    return "오늘 상태가 아직 가볍거나 입력이 적어서, 매일 쓰기 쉬운 기본 회복 아이템부터 보여줘요.";
  }
  return `${label} 흐름이 보여서, ${reason}`;
}

export function ShopPage() {
  const { t } = useI18n();
  const store = useAppStoreSelector(
    (s) => ({
      selected: s.selected,
      schedule: s.schedule,
      bio: s.bio,
      settings: s.settings,
    }),
    (a, b) =>
      a.selected === b.selected &&
      a.schedule === b.schedule &&
      a.bio === b.bio &&
      a.settings === b.settings
  );

  const [category, setCategory] = useState<ShopCategoryKey>("all");
  const deferredCategory = useDeferredValue(category);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const shopState = useMemo(
    () =>
      buildShopRecommendations({
        selected: store.selected,
        schedule: store.schedule,
        bio: store.bio,
        settings: store.settings,
        category: deferredCategory,
      }),
    [deferredCategory, store.selected, store.schedule, store.bio, store.settings]
  );

  const topSignal = shopState.signals[0] ?? null;
  const featured = shopState.recommendations.slice(0, 5);
  const selectedDateLabel = formatKoreanDate(shopState.selectedDate);

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[var(--rnest-accent)]">
            <StorefrontIcon />
          </span>
          <div>
            <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("쇼핑")}</div>
            <div className="mt-0.5 text-[13px] text-ios-sub">{t("회복 흐름에 맞춰 고르는 심플한 제휴 큐레이션")}</div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-ios-sep bg-gradient-to-br from-[#f8fafc] via-[#eef4ff] to-[#f5f7ff] px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ios-muted">{t("오늘의 맞춤 추천")}</div>
              <div className="mt-2 text-[21px] font-bold tracking-[-0.02em] text-ios-text">
                {summaryFromTopSignal(topSignal?.label ?? null, topSignal?.reason ?? null)}
              </div>
              <div className="mt-2 text-[12.5px] leading-5 text-ios-sub">
                {t("기준 날짜")} {selectedDateLabel} · {t("AI 맞춤회복과 같은 입력(근무/수면/스트레스/생리 흐름)을 추천 신호로 구조화해 사용합니다.")}
              </div>
            </div>
            <Link href="/insights/recovery" className="shrink-0 rounded-full border border-ios-sep bg-white px-3 py-2 text-[12px] font-semibold text-ios-text">
              {t("AI 회복 보기")}
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {shopState.signals.slice(0, 4).map((signal) => (
              <span key={signal.key} className="inline-flex rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[11px] font-semibold text-ios-text">
                {signal.label}
              </span>
            ))}
          </div>
        </div>
        <CardBody className="pt-4">
          <div className="rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3">
            <div className="text-[12px] font-semibold text-ios-text">{t("운영 방식")}</div>
            <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">
              {t("현재는 추천 구조와 진열 UX를 먼저 완성하는 단계입니다. 실제 파트너 링크/가격/이미지는 제휴 등록 후 연결됩니다.")}
            </div>
            <div className="mt-2 text-[11.5px] text-ios-muted">{t("구매·배송·환불은 파트너 판매처에서 처리하고, 앱은 추천과 연결만 담당합니다.")}</div>
          </div>
        </CardBody>
      </Card>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SHOP_CATEGORIES.map((item) => {
          const active = item.key === category;
          return (
            <button
              key={item.key}
              type="button"
              data-auth-allow
              onClick={() => setCategory(item.key)}
              className={[
                "shrink-0 rounded-full px-4 py-2 text-left transition",
                active
                  ? "border border-black/5 bg-black text-white shadow-apple-sm"
                  : "border border-ios-sep bg-white text-ios-text",
              ].join(" ")}
            >
              <div className="text-[12px] font-semibold">{t(item.label)}</div>
              <div className={["mt-0.5 text-[10.5px]", active ? "text-white/70" : "text-ios-muted"].join(" ")}>{t(item.subtitle)}</div>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {featured.map((entry) => {
          const expanded = expandedId === entry.product.id;
          return (
            <Card key={entry.product.id} className="overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-ios-sep bg-[#f6f7fb] px-2.5 py-1 text-[10.5px] font-semibold text-ios-text">
                        {t(SHOP_CATEGORIES.find((item) => item.key === entry.product.category)?.label ?? "추천")}
                      </span>
                      <span className="text-[11px] font-semibold text-ios-muted">
                        {t("추천도")} {scoreLabel(entry.score)}
                      </span>
                    </div>
                    <div className="mt-3 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{entry.product.name}</div>
                    <div className="mt-1 text-[13px] leading-5 text-ios-sub">{entry.product.subtitle}</div>
                  </div>
                  <span className="rounded-full border border-ios-sep bg-white px-3 py-1 text-[11px] font-semibold text-ios-text">{entry.product.priceLabel}</span>
                </div>

                <div className={["mt-4 rounded-[22px] px-4 py-4", entry.product.visualClass].join(" ")}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{entry.product.partnerLabel}</div>
                  <div className="mt-3 text-[22px] font-bold tracking-[-0.02em]">{entry.product.visualLabel}</div>
                  <div className="mt-1 max-w-[260px] text-[12px] leading-5 opacity-80">
                    {entry.matchedSignals[0]?.label
                      ? `${entry.matchedSignals[0].label} 흐름에 먼저 맞춰 보여주는 상품입니다.`
                      : t("기본 회복 루틴에서 무난하게 고르기 쉬운 상품입니다.")}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    data-auth-allow
                    onClick={() => setExpandedId((current) => (current === entry.product.id ? null : entry.product.id))}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[12px] font-semibold text-ios-text"
                  >
                    {expanded ? t("추천 이유 접기") : t("추천 이유 보기")}
                  </button>
                  {entry.product.externalUrl ? (
                    <a
                      href={entry.product.externalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-[12px] font-semibold text-white"
                    >
                      {t("구매하러 가기")}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-10 items-center justify-center rounded-full bg-[#f4f4f6] px-4 text-[12px] font-semibold text-ios-muted disabled:cursor-not-allowed"
                    >
                      {t("제휴 연결 준비중")}
                    </button>
                  )}
                </div>

                {expanded ? (
                  <div className="mt-4 rounded-2xl border border-ios-sep bg-[#fafafa] p-4">
                    <div className="text-[12px] font-semibold text-ios-text">{t("추천 근거")}</div>
                    <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{entry.primaryReason}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.matchedSignals.slice(0, 3).map((signal) => (
                        <span key={signal.key} className="inline-flex rounded-full border border-ios-sep bg-white px-3 py-1 text-[11px] font-semibold text-ios-text">
                          {signal.label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-[11.5px] leading-5 text-ios-muted">
                      {t("다음 단계에서 실제 파트너몰 링크, 가격 동기화, 클릭 추적을 여기에 연결합니다. 지금은 추천 구조와 진열 경험을 먼저 고정합니다.")}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardBody className="pt-5">
          <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("쇼핑 시스템 흐름")}</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-ios-sep bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ios-muted">01</div>
              <div className="mt-2 text-[14px] font-semibold text-ios-text">{t("회복 신호 추출")}</div>
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("오늘 근무, 수면, 스트레스, 생리 흐름을 추천 태그로 구조화합니다.")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ios-muted">02</div>
              <div className="mt-2 text-[14px] font-semibold text-ios-text">{t("상품 태그 매칭")}</div>
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("상품별 태그와 우선순위를 비교해 추천 순서를 정렬합니다.")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ios-muted">03</div>
              <div className="mt-2 text-[14px] font-semibold text-ios-text">{t("제휴 링크 연결")}</div>
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("외부 판매처로 이동해 구매하고, 앱은 추천·클릭 추적만 담당합니다.")}</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default ShopPage;
