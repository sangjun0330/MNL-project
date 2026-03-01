"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card, CardBody } from "@/components/ui/Card";
import { formatKoreanDate } from "@/lib/date";
import {
  buildShopRecommendations,
  getShopCategoryMeta,
  SHOP_CATEGORIES,
  type ShopCategoryKey,
  type ShopRecommendation,
} from "@/lib/shop";
import {
  defaultShopClientState,
  loadShopClientState,
  markShopPartnerClick,
  markShopViewed,
  saveShopClientState,
  toggleShopFavorite,
  toggleShopWaitlist,
} from "@/lib/shopClient";
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

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 20.5s-6.5-4.6-8.5-8.1A4.9 4.9 0 0 1 7.9 4.5c1.6 0 3.1.8 4.1 2 1-1.2 2.5-2 4.1-2a4.9 4.9 0 0 1 4.4 7.9c-2 3.5-8.5 8.1-8.5 8.1z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.8" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function scoreLabel(score: number) {
  if (score >= 14) return "높음";
  if (score >= 9) return "보통";
  return "기본";
}

function compactCount(value: number) {
  if (value >= 10) return "10+";
  return String(value);
}

function pickVisibleEntries(entries: ShopRecommendation[], count: number) {
  return entries.slice(0, count);
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
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [clientReady, setClientReady] = useState(false);
  const [clientState, setClientState] = useState(defaultShopClientState);

  useEffect(() => {
    setClientState(loadShopClientState());
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    saveShopClientState(clientState);
  }, [clientReady, clientState]);

  const allShopState = useMemo(
    () =>
      buildShopRecommendations({
        selected: store.selected,
        schedule: store.schedule,
        bio: store.bio,
        settings: store.settings,
      }),
    [store.selected, store.schedule, store.bio, store.settings]
  );

  const filteredShopState = useMemo(
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

  const recommendationById = useMemo(
    () => new Map(allShopState.recommendations.map((entry) => [entry.product.id, entry])),
    [allShopState.recommendations]
  );

  const featured = pickVisibleEntries(filteredShopState.recommendations, 6);
  const favoriteEntries = clientState.favoriteIds
    .map((id) => recommendationById.get(id) ?? null)
    .filter((entry): entry is ShopRecommendation => Boolean(entry));
  const recentEntries = clientState.recentIds
    .map((id) => recommendationById.get(id) ?? null)
    .filter((entry): entry is ShopRecommendation => Boolean(entry));

  const selectedEntry = selectedProductId ? recommendationById.get(selectedProductId) ?? null : null;
  const selectedDateLabel = formatKoreanDate(allShopState.selectedDate);
  const activeCategoryMeta = getShopCategoryMeta(category);
  const topSignalChips = allShopState.signals.slice(0, 4);
  const topCard = featured[0] ?? allShopState.recommendations[0] ?? null;

  const openDetailSheet = (productId: string) => {
    setSelectedProductId(productId);
    setClientState((current) => markShopViewed(current, productId));
  };

  const toggleFavorite = (productId: string) => {
    setClientState((current) => toggleShopFavorite(current, productId));
  };

  const toggleWaitlist = (productId: string) => {
    setClientState((current) => toggleShopWaitlist(current, productId));
  };

  const handlePartnerClick = (productId: string) => {
    setClientState((current) => markShopPartnerClick(current, productId));
  };

  const favoriteCount = clientState.favoriteIds.length;
  const recentCount = clientState.recentIds.length;

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
              <div className="mt-2 text-[21px] font-bold tracking-[-0.02em] text-ios-text">{allShopState.focusSummary}</div>
              <div className="mt-2 text-[12.5px] leading-5 text-ios-sub">
                {t("기준 날짜")} {selectedDateLabel} · {t("AI 맞춤회복과 같은 입력(근무·수면·스트레스·생리 흐름)을 추천 신호로 구조화해 사용합니다.")}
              </div>
            </div>
            <Link href="/insights/recovery" data-auth-allow className="shrink-0 rounded-full border border-ios-sep bg-white px-3 py-2 text-[12px] font-semibold text-ios-text">
              {t("AI 회복 보기")}
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("추천 신호")}</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{compactCount(allShopState.signals.length)}</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("관심 상품")}</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{compactCount(favoriteCount)}</div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/85 px-3 py-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("최근 본")}</div>
              <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{compactCount(recentCount)}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {topSignalChips.map((signal) => (
              <span key={signal.key} className="inline-flex rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[11px] font-semibold text-ios-text">
                {signal.label}
              </span>
            ))}
          </div>
        </div>

        <CardBody className="pt-4">
          <div className="rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ios-text">{t("내 큐레이션")}</div>
                <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("상세 시트를 열면 최근 본 상품에 자동 저장되고, 하트 버튼으로 관심 상품을 묶어둘 수 있습니다.")}</div>
              </div>
              {topCard ? (
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => toggleFavorite(topCard.product.id)}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[12px] font-semibold text-ios-text"
                >
                  {clientState.favoriteIds.includes(topCard.product.id) ? t("저장됨") : t("첫 추천 저장")}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-ios-sep bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("관심 상품")}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {favoriteEntries.length > 0 ? (
                    favoriteEntries.slice(0, 4).map((entry) => (
                      <button
                        key={entry.product.id}
                        type="button"
                        data-auth-allow
                        onClick={() => openDetailSheet(entry.product.id)}
                        className="inline-flex rounded-full border border-ios-sep bg-[#f7f7f8] px-3 py-2 text-[11px] font-semibold text-ios-text"
                      >
                        {entry.product.name}
                      </button>
                    ))
                  ) : (
                    <div className="text-[12px] leading-5 text-ios-sub">{t("아직 저장한 상품이 없습니다. 추천 카드의 하트 버튼으로 바로 저장할 수 있어요.")}</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-ios-sep bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("최근 본 상품")}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recentEntries.length > 0 ? (
                    recentEntries.slice(0, 4).map((entry) => (
                      <button
                        key={entry.product.id}
                        type="button"
                        data-auth-allow
                        onClick={() => openDetailSheet(entry.product.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-ios-sep bg-[#f7f7f8] px-3 py-2 text-[11px] font-semibold text-ios-text"
                      >
                        <ClockIcon />
                        {entry.product.name}
                      </button>
                    ))
                  ) : (
                    <div className="text-[12px] leading-5 text-ios-sub">{t("상세 보기로 들어간 상품이 여기에 쌓입니다. 비교하면서 고를 때 쓰는 영역입니다.")}</div>
                  )}
                </div>
              </div>
            </div>
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
              onClick={() =>
                startTransition(() => {
                  setCategory(item.key);
                })
              }
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

      <Card>
        <CardBody className="pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t(activeCategoryMeta.label)} {t("추천")}</div>
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t(activeCategoryMeta.subtitle)} · {t("현재 상태와 태그가 맞는 순서대로 정렬합니다.")}</div>
            </div>
            <div className="rounded-full border border-ios-sep bg-[#fafafa] px-3 py-1 text-[11px] font-semibold text-ios-text">{featured.length}{t("개")}</div>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-3">
        {featured.map((entry) => {
          const isFavorite = clientState.favoriteIds.includes(entry.product.id);
          const isWaitlisted = clientState.waitlistIds.includes(entry.product.id);
          const partnerClicks = clientState.partnerClickCounts[entry.product.id] ?? 0;

          return (
            <Card key={entry.product.id} className="overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-ios-sep bg-[#f6f7fb] px-2.5 py-1 text-[10.5px] font-semibold text-ios-text">
                        {t(getShopCategoryMeta(entry.product.category).label)}
                      </span>
                      <span className="text-[11px] font-semibold text-ios-muted">
                        {t("추천도")} {scoreLabel(entry.score)}
                      </span>
                    </div>
                    <div className="mt-3 text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{entry.product.name}</div>
                    <div className="mt-1 text-[13px] leading-5 text-ios-sub">{entry.product.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    data-auth-allow
                    aria-pressed={isFavorite}
                    onClick={() => toggleFavorite(entry.product.id)}
                    className={[
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition",
                      isFavorite
                        ? "border-rose-200 bg-rose-50 text-rose-500"
                        : "border-ios-sep bg-white text-ios-muted",
                    ].join(" ")}
                  >
                    <HeartIcon filled={isFavorite} />
                  </button>
                </div>

                <div className={["mt-4 rounded-[22px] px-4 py-4", entry.product.visualClass].join(" ")}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{entry.product.partnerLabel}</div>
                  <div className="mt-3 text-[22px] font-bold tracking-[-0.02em]">{entry.product.visualLabel}</div>
                  <div className="mt-1 max-w-[280px] text-[12px] leading-5 opacity-80">{entry.secondaryReason}</div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.product.benefitTags.slice(0, 3).map((tag) => (
                    <span key={tag} className="inline-flex rounded-full border border-ios-sep bg-[#fafafa] px-3 py-1 text-[11px] font-semibold text-ios-text">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-ios-muted">{entry.product.priceLabel}</div>
                    <div className="mt-1 text-[11px] text-ios-muted">
                      {t("제휴 클릭")} {partnerClicks}{t("회")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-auth-allow
                      onClick={() => openDetailSheet(entry.product.id)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[12px] font-semibold text-ios-text"
                    >
                      {t("상세 보기")}
                    </button>

                    {entry.product.externalUrl ? (
                      <a
                        href={entry.product.externalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => handlePartnerClick(entry.product.id)}
                        data-auth-allow
                        className="inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-[12px] font-semibold text-white"
                      >
                        {t("구매하러 가기")}
                      </a>
                    ) : (
                      <button
                        type="button"
                        data-auth-allow
                        onClick={() => toggleWaitlist(entry.product.id)}
                        className={[
                          "inline-flex h-10 items-center justify-center rounded-full px-4 text-[12px] font-semibold transition",
                          isWaitlisted
                            ? "bg-black text-white"
                            : "border border-ios-sep bg-white text-ios-text",
                        ].join(" ")}
                      >
                        {isWaitlisted ? t("연결 대기 저장됨") : t("연결 대기 저장")}
                      </button>
                    )}
                  </div>
                </div>
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
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("상품별 태그와 우선순위를 비교해 추천 순서를 정렬하고, 관심 상품·최근 본 흐름을 유지합니다.")}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ios-muted">03</div>
              <div className="mt-2 text-[14px] font-semibold text-ios-text">{t("제휴 링크 연결")}</div>
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("외부 판매처로 이동해 구매하고, 앱은 추천·클릭 추적·큐레이션만 담당합니다.")}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <BottomSheet
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedProductId(null)}
        title={selectedEntry?.product.name}
        subtitle={selectedEntry ? `${getShopCategoryMeta(selectedEntry.product.category).label} · ${selectedEntry.product.partnerStatus}` : undefined}
        variant="appstore"
        maxHeightClassName="max-h-[78dvh]"
        footer={
          selectedEntry ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-auth-allow
                onClick={() => toggleFavorite(selectedEntry.product.id)}
                className={[
                  "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border text-[13px] font-semibold",
                  clientState.favoriteIds.includes(selectedEntry.product.id)
                    ? "border-rose-200 bg-rose-50 text-rose-500"
                    : "border-ios-sep bg-white text-ios-text",
                ].join(" ")}
              >
                <HeartIcon filled={clientState.favoriteIds.includes(selectedEntry.product.id)} />
                {clientState.favoriteIds.includes(selectedEntry.product.id) ? t("관심 상품 저장됨") : t("관심 상품 저장")}
              </button>

              {selectedEntry.product.externalUrl ? (
                <a
                  href={selectedEntry.product.externalUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => handlePartnerClick(selectedEntry.product.id)}
                  data-auth-allow
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-black text-[13px] font-semibold text-white"
                >
                  <ArrowUpRightIcon />
                  {t("판매처 이동")}
                </a>
              ) : (
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => toggleWaitlist(selectedEntry.product.id)}
                  className={[
                    "inline-flex h-11 flex-1 items-center justify-center rounded-full text-[13px] font-semibold transition",
                    clientState.waitlistIds.includes(selectedEntry.product.id)
                      ? "bg-black text-white"
                      : "border border-ios-sep bg-white text-ios-text",
                  ].join(" ")}
                >
                  {clientState.waitlistIds.includes(selectedEntry.product.id) ? t("연결 대기 저장됨") : t("연결 대기 저장")}
                </button>
              )}
            </div>
          ) : null
        }
      >
        {selectedEntry ? (
          <div className="space-y-4 pb-2">
            <div className={["rounded-[24px] px-5 py-5", selectedEntry.product.visualClass].join(" ")}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">{selectedEntry.product.partnerLabel}</div>
              <div className="mt-3 text-[26px] font-bold tracking-[-0.03em]">{selectedEntry.product.visualLabel}</div>
              <div className="mt-2 max-w-[300px] text-[13px] leading-6 opacity-90">{selectedEntry.product.description}</div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white p-4">
              <div className="text-[12px] font-semibold text-ios-text">{t("왜 지금 맞는지")}</div>
              <div className="mt-2 text-[14px] leading-6 text-ios-text">{selectedEntry.primaryReason}</div>
              <div className="mt-2 text-[12.5px] leading-5 text-ios-sub">{selectedEntry.secondaryReason}</div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-black/5 bg-white p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("상세 열람")}</div>
                <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{compactCount(clientState.detailOpenCounts[selectedEntry.product.id] ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-black/5 bg-white p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("제휴 클릭")}</div>
                <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{compactCount(clientState.partnerClickCounts[selectedEntry.product.id] ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-black/5 bg-white p-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("추천도")}</div>
                <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{scoreLabel(selectedEntry.score)}</div>
              </div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white p-4">
              <div className="text-[12px] font-semibold text-ios-text">{t("이럴 때 잘 맞아요")}</div>
              <div className="mt-3 space-y-2">
                {selectedEntry.product.useMoments.map((moment) => (
                  <div key={moment} className="rounded-2xl border border-ios-sep bg-[#fafafa] px-3 py-2 text-[12.5px] leading-5 text-ios-text">
                    {moment}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white p-4">
              <div className="text-[12px] font-semibold text-ios-text">{t("추천 기준 태그")}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedEntry.matchedSignals.length > 0 ? (
                  selectedEntry.matchedSignals.map((signal) => (
                    <span key={signal.key} className="inline-flex rounded-full border border-ios-sep bg-[#fafafa] px-3 py-1 text-[11px] font-semibold text-ios-text">
                      {signal.label}
                    </span>
                  ))
                ) : (
                  <span className="inline-flex rounded-full border border-ios-sep bg-[#fafafa] px-3 py-1 text-[11px] font-semibold text-ios-text">
                    {t("기본 회복 루틴")}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedEntry.product.benefitTags.map((tag) => (
                  <span key={tag} className="inline-flex rounded-full border border-ios-sep bg-white px-3 py-1 text-[11px] font-semibold text-ios-text">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white p-4">
              <div className="text-[12px] font-semibold text-ios-text">{t("제휴 안내")}</div>
              <div className="mt-2 text-[13px] leading-6 text-ios-text">{selectedEntry.product.partnerStatus}</div>
              <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">
                {selectedEntry.product.externalUrl
                  ? t("링크가 연결된 상품은 판매처로 바로 이동하고, 앱은 추천과 클릭 흐름만 기록합니다.")
                  : t("현재는 상품 구조와 추천 로직을 먼저 고정한 상태라, 실제 판매처 링크는 제휴 등록 후 연결됩니다. 연결 대기 저장을 눌러 관심 상품처럼 묶어둘 수 있습니다.")}
              </div>
              <div className="mt-3 rounded-2xl border border-ios-sep bg-[#fafafa] px-3 py-3 text-[12px] leading-5 text-ios-sub">
                {selectedEntry.product.caution}
              </div>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}

export default ShopPage;
