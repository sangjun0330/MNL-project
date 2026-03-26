"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { AIRecoveryLoadingOverlay } from "@/components/insights/AIRecoveryLoadingOverlay";
import { AIRecoverySlotTabs } from "@/components/insights/AIRecoverySlotTabs";
import { useAIRecoverySession } from "@/components/insights/useAIRecoverySession";
import { InsightsLockedNotice } from "@/components/insights/InsightsLockedNotice";
import { DetailCard, DetailChip, DETAIL_ACCENTS, InsightDetailShell } from "@/components/pages/insights/InsightDetailShell";

import { INSIGHTS_MIN_DAYS, isInsightsLocked, shiftKo, useInsightsData } from "@/components/insights/useInsightsData";
import type { AIRecoveryOrder, AIRecoverySlot } from "@/lib/aiRecovery";
import { formatKoreanDate } from "@/lib/date";
import { useI18n } from "@/lib/useI18n";
import type { AIRecoverySessionResponse } from "@/lib/aiRecovery";

function PillLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: "primary" | "outline";
  children: ReactNode;
}) {
  const base = "inline-flex h-12 items-center justify-center rounded-full px-6 text-[14px] font-semibold transition-opacity active:opacity-70";
  const cls =
    variant === "primary"
      ? `${base} border-2 border-[#B8B0E8] text-[#6B5CE7]`
      : `${base} bg-[#F0EEFA] text-[#6B5CE7]`;
  return (
    <Link href={href} className={cls} prefetch={false}>
      {children}
    </Link>
  );
}

function PillButton({
  variant = "primary",
  disabled,
  onClick,
  children,
}: {
  variant?: "primary" | "outline";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const base = "inline-flex h-12 items-center justify-center rounded-full px-6 text-[14px] font-semibold transition-opacity active:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed";
  const cls =
    variant === "primary"
      ? `${base} border-2 border-[#B8B0E8] text-[#6B5CE7]`
      : `${base} bg-[#F0EEFA] text-[#6B5CE7]`;
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

const OrderCard = memo(function OrderCard({
  order,
  checked,
  busy,
  recentlyCompleted,
  onToggle,
}: {
  order: AIRecoveryOrder;
  checked: boolean;
  busy: boolean;
  recentlyCompleted?: boolean;
  onToggle?: () => void;
}) {
  const chips = Array.isArray((order as any).chips) ? ((order as any).chips as string[]) : [];

  return (
    <DetailCard
      className={`overflow-hidden px-5 py-5 transition-all duration-300 sm:px-6 motion-reduce:transition-none ${
        checked ? "border-[#D9EBDD]" : ""
      } ${recentlyCompleted ? "scale-[1.01] shadow-[0_18px_42px_rgba(25,65,48,0.10)]" : ""}`}
      style={{
        background: checked
          ? "radial-gradient(circle at top right, rgba(177,230,204,0.28), transparent 34%), linear-gradient(180deg, rgba(247,252,248,0.98) 0%, rgba(242,250,245,0.96) 100%)"
          : "radial-gradient(circle at top right, rgba(173,196,255,0.14), transparent 30%), linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
        boxShadow: checked
          ? "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 36px rgba(40,112,74,0.08)"
          : "inset 0 1px 0 rgba(255,255,255,0.92), 0 16px 36px rgba(15,36,74,0.05)",
      }}
    >
      <div className="flex items-start gap-4">
        <button
          type="button"
          disabled={busy || checked || !onToggle}
          onClick={onToggle}
          aria-label={checked ? "완료된 오더" : "오더 완료하기"}
          className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition-all duration-300 motion-reduce:transition-none ${
            checked ? "border-[#1E6B47] bg-[#1E6B47] text-white" : "border-[#1B2747] bg-white text-[#1B2747]"
          } ${busy ? "opacity-50" : ""}`}
        >
          {recentlyCompleted ? <span className="absolute inset-0 rounded-full bg-[#CFEFDD] opacity-70 animate-ping" aria-hidden="true" /> : null}
          <span className={`relative transition-transform duration-300 motion-reduce:transition-none ${recentlyCompleted ? "scale-110" : "scale-100"}`}>
            {checked ? "✓" : ""}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DetailChip color={checked ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.navy}>{(order as any).when ?? "지금"}</DetailChip>
            {chips.slice(0, 3).map((chip) => (
              <DetailChip key={chip} color={checked ? DETAIL_ACCENTS.mint : DETAIL_ACCENTS.navy}>
                {chip}
              </DetailChip>
            ))}
            {checked ? <DetailChip color={DETAIL_ACCENTS.mint}>완료</DetailChip> : null}
          </div>
          <p className={`mt-3 break-keep text-[17px] font-semibold leading-[1.75] tracking-[-0.03em] transition-colors duration-300 motion-reduce:transition-none ${checked ? "text-[#234533]" : "text-ios-text"}`}>
            {(order as any).body}
          </p>
          <p className={`mt-2 break-keep text-[13px] leading-6 transition-colors duration-300 motion-reduce:transition-none ${checked ? "text-[#5C7367]" : "text-ios-sub"}`}>
            {(order as any).reason}
          </p>
        </div>
      </div>
    </DetailCard>
  );
});

function PaywallNotice({ aiHref }: { aiHref: string }) {
  return (
    <DetailCard className="p-6">
      <div className="text-[18px] font-bold text-ios-text">AI 오더는 Plus 또는 Pro에서 사용할 수 있어요.</div>
      <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 회복 결과를 바로 실행 가능한 체크리스트로 보여줘요.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <PillLink href="/settings/billing/upgrade">플랜 보기 ›</PillLink>
        <PillLink href={aiHref} variant="outline">AI 회복 보기</PillLink>
      </div>
    </DetailCard>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-ios-sep bg-[#F7F8FB] px-4 py-3">
      <div className="text-[11px] font-semibold tracking-[0.04em] text-ios-sub">{label}</div>
      <div className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{value}</div>
    </div>
  );
}

export function InsightsRecoveryOrdersDetail({
  initialSlot = "wake",
  initialData = null,
}: {
  initialSlot?: AIRecoverySlot;
  initialData?: AIRecoverySessionResponse["data"] | null;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const billing = useBillingAccess();
  const { end, recordedDays, todayShift, hasTodayShift } = useInsightsData();
  const [slot, setSlot] = useState<AIRecoverySlot>(initialSlot);
  const [hydrated, setHydrated] = useState(false);
  const slotLabel = slot === "wake" ? "기상 후" : "퇴근 후";
  const aiHref = slot === "postShift" ? "/insights/recovery/ai?slot=postShift" : "/insights/recovery/ai";
  const hasInitialAccess = Boolean(initialData?.session || initialData?.hasAIEntitlement || initialData?.model);
  const insightsLocked = hydrated && !hasInitialAccess && isInsightsLocked(recordedDays);
  const aiEnabled = Boolean(initialData?.hasAIEntitlement) || (hydrated && billing.hasEntitlement("recoveryPlannerAI"));
  const session = useAIRecoverySession({
    dateISO: end,
    slot,
    autoGenerate: false,
    enabled: !insightsLocked && aiEnabled,
    initialData,
  });
  const activeData = session.data?.slot === slot && session.data?.dateISO === end ? session.data : null;
  const response = activeData;
  const currentSession = response?.session ?? null;
  const ordersPayload = currentSession?.orders ?? null;
  const orders = useMemo(() => ordersPayload?.items ?? [], [ordersPayload?.items]);
  const responseCompletions = useMemo(() => response?.completions ?? [], [response?.completions]);
  const canRegenerateOrders = response?.quota.canRegenerateOrders ?? !currentSession;
  const showGeneratingOverlay = Boolean(response?.gate.allowed && session.savingOrders);
  const showGenerationControls = Boolean(response?.showGenerationControls);
  const [localCompletions, setLocalCompletions] = useState<string[]>(responseCompletions);
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<string[]>([]);
  const [transientCompletedIds, setTransientCompletedIds] = useState<string[]>([]);
  const previousCompletionsRef = useRef<string[]>(responseCompletions);
  const latestResponseCompletionsRef = useRef<string[]>(responseCompletions);
  const toggleTimersRef = useRef<number[]>([]);
  const toggleCompletion = session.toggleCompletion;
  const completionSet = useMemo(() => new Set(localCompletions), [localCompletions]);
  const transientSet = useMemo(() => new Set(transientCompletedIds), [transientCompletedIds]);
  const pendingOrders = useMemo(() => orders.filter((order) => !completionSet.has(order.id) || transientSet.has(order.id)), [orders, completionSet, transientSet]);
  const completedOrders = useMemo(() => orders.filter((order) => completionSet.has(order.id) && !transientSet.has(order.id)), [orders, completionSet, transientSet]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // 페이지에 진입할 때마다 서버 데이터를 한 번 갱신해 앱 멈춤 현상 방지
  useEffect(() => {
    router.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSlot(initialSlot);
  }, [initialSlot]);

  useEffect(() => {
    latestResponseCompletionsRef.current = responseCompletions;
  }, [responseCompletions]);

  useEffect(() => {
    const nextCompletions = responseCompletions;
    const previousSet = new Set(previousCompletionsRef.current);
    const newlyCompleted = nextCompletions.filter((id) => !previousSet.has(id));
    previousCompletionsRef.current = nextCompletions;
    setLocalCompletions(nextCompletions);
    setTransientCompletedIds((current) => current.filter((id) => nextCompletions.includes(id)));
    if (!newlyCompleted.length) return;
    setRecentlyCompletedIds((current) => Array.from(new Set([...current, ...newlyCompleted])));
    const timers = newlyCompleted.map((id) =>
      window.setTimeout(() => {
        setRecentlyCompletedIds((current) => current.filter((item) => item !== id));
      }, 850),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [responseCompletions]);

  useEffect(() => {
    const nextCompletions = latestResponseCompletionsRef.current;
    setLocalCompletions(nextCompletions);
    setTransientCompletedIds([]);
    setRecentlyCompletedIds([]);
    previousCompletionsRef.current = nextCompletions;
  }, [currentSession?.generatedAt, end, slot]);

  const handleToggleCompletion = useCallback((orderId: string) => {
    setLocalCompletions((current) => (current.includes(orderId) ? current : [...current, orderId]));
    setTransientCompletedIds((current) => (current.includes(orderId) ? current : [...current, orderId]));
    setRecentlyCompletedIds((current) => (current.includes(orderId) ? current : [...current, orderId]));
    const t1 = window.setTimeout(() => {
      setTransientCompletedIds((current) => current.filter((item) => item !== orderId));
    }, 520);
    const t2 = window.setTimeout(() => {
      setRecentlyCompletedIds((current) => current.filter((item) => item !== orderId));
    }, 850);
    toggleTimersRef.current.push(t1, t2);
    void toggleCompletion(orderId, true);
  }, [toggleCompletion]);

  useEffect(() => {
    return () => {
      for (const t of toggleTimersRef.current) window.clearTimeout(t);
      toggleTimersRef.current = [];
    };
  }, []);

  if (!hydrated && !initialData) {
    return (
      <InsightDetailShell title="오늘의 오더" subtitle={formatKoreanDate(end)} meta="현재 상태를 확인하고 있어요." backHref="/insights/recovery">
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold text-ios-text">불러오는 중이에요.</div>
          <p className="mt-2 text-[13px] text-ios-sub">저장된 오더와 현재 접근 권한을 함께 확인하고 있습니다.</p>
        </DetailCard>
      </InsightDetailShell>
    );
  }

  if (insightsLocked) {
    return (
      <InsightDetailShell title="오늘의 오더" subtitle={formatKoreanDate(end)} meta={t("건강 기록 3일 이상부터 볼 수 있어요.")} backHref="/insights/recovery">
        <InsightsLockedNotice recordedDays={recordedDays} minDays={INSIGHTS_MIN_DAYS} />
      </InsightDetailShell>
    );
  }

  if (hydrated && !hasInitialAccess && !billing.loading && !billing.hasEntitlement("recoveryPlannerAI")) {
    return (
      <InsightDetailShell title="오늘의 오더" subtitle={formatKoreanDate(end)} meta="AI 오더는 Plus 또는 Pro에서 사용할 수 있어요." backHref="/insights/recovery">
        <PaywallNotice aiHref={aiHref} />
      </InsightDetailShell>
    );
  }

  const updateSlot = (nextSlot: AIRecoverySlot) => {
    if (nextSlot === slot) return;
    setSlot(nextSlot);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (nextSlot === "wake") params.delete("slot");
    else params.set("slot", nextSlot);
    const nextQuery = params.toString();
    const nextPath = pathname || window.location.pathname;
    window.history.replaceState(window.history.state, "", nextQuery ? `${nextPath}?${nextQuery}` : nextPath);
  };

  return (
    <InsightDetailShell
      title="오늘의 오더"
      subtitle={formatKoreanDate(end)}
      meta={response?.slotDescription ?? (slot === "wake" ? "기상 후 바로 실행할 체크리스트를 보여줍니다." : "퇴근 후 바로 실행할 체크리스트를 보여줍니다.")}
      backHref="/insights/recovery"
      chips={
        <>
          {hydrated && hasTodayShift ? <DetailChip color={DETAIL_ACCENTS.navy}>{shiftKo(todayShift)}</DetailChip> : null}
        </>
      }
    >
      <AIRecoveryLoadingOverlay mode="orders" open={showGeneratingOverlay} />

      <div className="px-1">
        <AIRecoverySlotTabs value={slot} onChange={updateSlot} />
      </div>

      <DetailCard className="p-5 sm:p-6">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">ORDER STATS</div>
        <div className="mt-2 text-[20px] font-bold tracking-[-0.03em] text-ios-text">오늘 오더 성공 횟수</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatPill label="오늘 기상 후 합계" value={`${response?.orderStats?.todayWakeCompleted ?? 0}회`} />
          <StatPill label="오늘 퇴근 후 합계" value={`${response?.orderStats?.todayPostShiftCompleted ?? 0}회`} />
          <StatPill label="오늘 총합 합계" value={`${response?.orderStats?.todayTotalCompleted ?? 0}회`} />
          <StatPill label="일주일 합계" value={`${response?.orderStats?.weekTotalCompleted ?? 0}회`} />
        </div>
      </DetailCard>

      <DetailCard
        className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
        style={{
          background: "linear-gradient(180deg, rgba(250,251,255,0.98) 0%, rgba(255,255,255,0.96) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 16px 40px rgba(15,36,74,0.04)",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.18em] text-[color:var(--rnest-accent)]">TODAY ORDERS</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{slotLabel} 오더 체크리스트</div>
            <p className="mt-2 text-[13px] leading-6 text-ios-sub">
              {currentSession ? "타이밍과 이유가 붙은 실행 문장으로 바로 확인할 수 있어요." : "AI 호출은 해설 페이지의 만들기 버튼에서만 시작됩니다."}
            </p>
          </div>
          {currentSession && showGenerationControls ? (
            <PillButton variant="outline" disabled={session.savingOrders || billing.loading || !canRegenerateOrders} onClick={() => void session.regenerateOrders()}>
              {session.savingOrders ? "만드는 중…" : "오더 다시 만들기"}
            </PillButton>
          ) : !currentSession ? (
            <PillLink href={aiHref}>해설 만들러 가기 ›</PillLink>
          ) : null}
        </div>
        {currentSession && showGenerationControls && !canRegenerateOrders ? <p className="text-[12px] text-ios-sub">오늘 오더 다시 만들기는 끝났어요.</p> : null}
      </DetailCard>

      {session.error ? (
        <DetailCard className="border-[#F2C4CC] bg-[#FFF7F8] p-5">
          <div className="text-[14px] font-semibold text-[#9B2C3F]">불러오지 못했어요.</div>
          <div className="mt-1 text-[13px] text-[#7A4C55]">{session.error}</div>
        </DetailCard>
      ) : null}

      {response && !response.gate.allowed && !currentSession ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">지금은 만들 수 없어요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{response.gate.message}</p>
          {response.gate.code === "post_shift_health_required" ? (
            <div className="mt-4">
              <PillLink href="/schedule?openHealthLog=today">오늘 건강 기록하기 ›</PillLink>
            </div>
          ) : null}
        </DetailCard>
      ) : null}

      {ordersPayload ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[12px] font-semibold text-ios-sub">{ordersPayload.title ?? "오늘의 오더"}</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{ordersPayload.headline}</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">{ordersPayload.summary}</p>
        </DetailCard>
      ) : null}

      {pendingOrders.length ? (
        <div className="space-y-3">
          <div className="px-1">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-ios-sub">지금 바로 할 오더</div>
            <p className="mt-1 text-[13px] leading-6 text-ios-sub">체크하면 바로 완료 상태로 반영되고 아래 완료 목록에 정리됩니다.</p>
          </div>
          <div className="grid gap-3">
            {pendingOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                checked={completionSet.has(order.id)}
                busy={session.togglingCompletion === order.id}
                recentlyCompleted={recentlyCompletedIds.includes(order.id)}
                onToggle={() => handleToggleCompletion(order.id)}
              />
            ))}
          </div>
        </div>
      ) : session.loading ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[16px] font-bold text-ios-text">준비 중이에요.</div>
          <p className="mt-2 text-[13px] text-ios-sub">저장된 결과를 먼저 확인하고 필요하면 다시 만들어요.</p>
        </DetailCard>
      ) : orders.length > 0 ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">오늘 오더를 모두 체크했어요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">완료한 오더는 아래에 남아 있고, 통계도 바로 반영됩니다.</p>
        </DetailCard>
      ) : !session.error && response?.gate.allowed ? (
        <DetailCard className="p-5 sm:p-6">
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">아직 AI 오더가 없어요.</div>
          <p className="mt-2 text-[13px] leading-6 text-ios-sub">AI 맞춤회복 페이지에서 {slotLabel} 만들기를 눌러 해설을 먼저 생성해 주세요.</p>
        </DetailCard>
      ) : null}

      {completedOrders.length ? (
        <div className="space-y-3">
          <div className="px-1">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-ios-sub">완료한 오더</div>
            <p className="mt-1 text-[13px] leading-6 text-ios-sub">방금 체크한 항목도 여기에서 바로 확인할 수 있어요.</p>
          </div>
          <div className="grid gap-3">
            {completedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                checked
                busy={false}
                recentlyCompleted={recentlyCompletedIds.includes(order.id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </InsightDetailShell>
  );
}
