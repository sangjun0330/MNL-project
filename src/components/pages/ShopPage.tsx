"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuthState } from "@/lib/auth";
import { authHeaders, ensureTossScript } from "@/lib/billing/client";
import { ShopCheckoutSheet } from "@/components/shop/ShopCheckoutSheet";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card, CardBody } from "@/components/ui/Card";
import { formatKoreanDate } from "@/lib/date";
import {
  buildShopRecommendations,
  createShopProductId,
  formatShopPrice,
  getShopCategoryMeta,
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  SHOP_SIGNAL_OPTIONS,
  SHOP_VISUAL_PRESETS,
  type ShopCategoryKey,
  type ShopProduct,
  type ShopRecommendation,
  type ShopSignalKey,
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

type AdminProductDraft = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: Exclude<ShopCategoryKey, "all">;
  priceKrw: number;
  checkoutEnabled: boolean;
  visualPresetKey: string;
  visualLabel: string;
  priceLabel: string;
  partnerLabel: string;
  partnerStatus: string;
  externalUrl: string;
  benefitTagsText: string;
  useMomentsText: string;
  caution: string;
  priority: number;
  matchSignals: ShopSignalKey[];
};

type ShopOrderSummary = {
  orderId: string;
  status: "READY" | "PAID" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED";
  amount: number;
  createdAt: string;
  approvedAt: string | null;
  failMessage: string | null;
  productSnapshot: {
    name: string;
    quantity: number;
  };
  refund: {
    status: "none" | "requested" | "rejected" | "done";
    reason: string | null;
    note: string | null;
  };
};

type ShopAdminOrderSummary = ShopOrderSummary & {
  userLabel?: string;
};

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

function joinList(values: string[]) {
  return values.join(", ");
}

function splitCommaList(raw: string) {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function splitLineList(raw: string) {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function defaultAdminDraft(): AdminProductDraft {
  return {
    id: "",
    name: "",
    subtitle: "",
    description: "",
    category: "sleep",
    priceKrw: 0,
    checkoutEnabled: false,
    visualPresetKey: SHOP_VISUAL_PRESETS[0]?.key ?? "midnight",
    visualLabel: "",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "제휴 파트너 연동 준비중",
    partnerStatus: "제휴 검수 전 단계",
    externalUrl: "",
    benefitTagsText: "",
    useMomentsText: "",
    caution: "의학적 치료 대체가 아니라 생활 루틴 보조용으로만 안내합니다.",
    priority: 4,
    matchSignals: ["baseline_recovery"],
  };
}

function draftFromProduct(product: ShopProduct): AdminProductDraft {
  const preset = SHOP_VISUAL_PRESETS.find((item) => item.className === product.visualClass) ?? SHOP_VISUAL_PRESETS[0];
  return {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    category: product.category,
    priceKrw: product.priceKrw ?? 0,
    checkoutEnabled: Boolean(product.checkoutEnabled && product.priceKrw && product.priceKrw > 0),
    visualPresetKey: preset?.key ?? SHOP_VISUAL_PRESETS[0]?.key ?? "midnight",
    visualLabel: product.visualLabel,
    priceLabel: product.priceLabel,
    partnerLabel: product.partnerLabel,
    partnerStatus: product.partnerStatus,
    externalUrl: product.externalUrl ?? "",
    benefitTagsText: joinList(product.benefitTags),
    useMomentsText: product.useMoments.join("\n"),
    caution: product.caution,
    priority: product.priority,
    matchSignals: product.matchSignals,
  };
}

function draftToPayload(draft: AdminProductDraft) {
  return {
    id: draft.id || createShopProductId(draft.name),
    name: draft.name,
    subtitle: draft.subtitle,
    description: draft.description,
    category: draft.category,
    priceKrw: Math.max(0, Math.round(Number(draft.priceKrw) || 0)),
    checkoutEnabled: Boolean(draft.checkoutEnabled && Number(draft.priceKrw) > 0),
    visualPresetKey: draft.visualPresetKey,
    visualLabel: draft.visualLabel || draft.name,
    priceLabel: draft.priceLabel,
    partnerLabel: draft.partnerLabel,
    partnerStatus: draft.partnerStatus,
    externalUrl: draft.externalUrl.trim(),
    benefitTags: splitCommaList(draft.benefitTagsText),
    useMoments: splitLineList(draft.useMomentsText),
    caution: draft.caution,
    priority: draft.priority,
    matchSignals: draft.matchSignals,
  };
}

function requiredDraftMissing(draft: AdminProductDraft) {
  if (!draft.name.trim() || !draft.subtitle.trim() || !draft.description.trim()) return true;
  if (draft.checkoutEnabled && (!(Number.isFinite(draft.priceKrw)) || draft.priceKrw <= 0)) return true;
  return false;
}

export function ShopPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
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

  const [catalog, setCatalog] = useState<ShopProduct[]>(SHOP_PRODUCTS);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [adminDraft, setAdminDraft] = useState<AdminProductDraft>(defaultAdminDraft);
  const [checkoutProductId, setCheckoutProductId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ShopOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [adminOrders, setAdminOrders] = useState<ShopAdminOrderSummary[]>([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);

  useEffect(() => {
    setClientState(loadShopClientState());
    setClientReady(true);
  }, []);

  useEffect(() => {
    if (!clientReady) return;
    saveShopClientState(clientState);
  }, [clientReady, clientState]);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await fetch("/api/shop/catalog", {
          method: "GET",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.products)) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setCatalog(json.data.products as ShopProduct[]);
      } catch {
        if (!active) return;
        setCatalog(SHOP_PRODUCTS);
        setCatalogError("catalog_load_failed");
      } finally {
        if (!active) return;
        setCatalogLoading(false);
      }
    };

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setIsAdmin(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/billing/access", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        setIsAdmin(Boolean(res.ok && json?.ok && json?.data?.isAdmin));
      } catch {
        if (!active) return;
        setIsAdmin(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setOrders([]);
      setOrdersLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setOrdersLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/orders?limit=8", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setOrders(json.data.orders as ShopOrderSummary[]);
      } catch {
        if (!active) return;
        setOrders([]);
      } finally {
        if (!active) return;
        setOrdersLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId, orderNotice]);

  useEffect(() => {
    let active = true;
    if (!isAdmin) {
      setAdminOrders([]);
      setAdminOrdersLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setAdminOrdersLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/shop/orders?limit=12", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setAdminOrders(json.data.orders as ShopAdminOrderSummary[]);
      } catch {
        if (!active) return;
        setAdminOrders([]);
      } finally {
        if (!active) return;
        setAdminOrdersLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [isAdmin, adminNotice, orderNotice]);

  const allShopState = useMemo(
    () =>
      buildShopRecommendations({
        selected: store.selected,
        schedule: store.schedule,
        bio: store.bio,
        settings: store.settings,
        products: catalog,
      }),
    [catalog, store.selected, store.schedule, store.bio, store.settings]
  );

  const filteredShopState = useMemo(
    () =>
      buildShopRecommendations({
        selected: store.selected,
        schedule: store.schedule,
        bio: store.bio,
        settings: store.settings,
        category: deferredCategory,
        products: catalog,
      }),
    [catalog, deferredCategory, store.selected, store.schedule, store.bio, store.settings]
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
  const checkoutEntry = checkoutProductId ? recommendationById.get(checkoutProductId) ?? null : null;
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

  const beginCheckout = (productId: string) => {
    if (status !== "authenticated") {
      setOrderError("주문하려면 먼저 로그인해야 합니다.");
      setOrderNotice(null);
      return;
    }
    setSelectedProductId(null);
    setOrderError(null);
    setOrderNotice(null);
    setCheckoutProductId(productId);
  };

  const submitCheckout = async () => {
    if (!checkoutEntry || checkoutLoading) return;
    if (status !== "authenticated") {
      setOrderError("주문하려면 먼저 로그인해야 합니다.");
      return;
    }

    setCheckoutLoading(true);
    setOrderError(null);
    setOrderNotice(null);

    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          productId: checkoutEntry.product.id,
          quantity: 1,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }

      await ensureTossScript();
      if (typeof window === "undefined" || !window.TossPayments) {
        throw new Error("missing_toss_sdk");
      }

      const data = json.data as {
        orderId: string;
        orderName: string;
        amount: number;
        currency: string;
        clientKey: string;
        customerKey: string;
        customerEmail: string | null;
        customerName: string | null;
        successUrl: string;
        failUrl: string;
      };

      const toss = window.TossPayments(data.clientKey);
      await toss.payment({ customerKey: data.customerKey }).requestPayment({
        method: "CARD",
        amount: {
          currency: data.currency,
          value: data.amount,
        },
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: data.successUrl,
        failUrl: data.failUrl,
        customerEmail: data.customerEmail ?? undefined,
        customerName: data.customerName ?? undefined,
      });
    } catch (error: any) {
      const text = String(error?.message ?? "failed_to_start_shop_checkout");
      if (text.includes("shop_checkout_disabled")) {
        setOrderError("이 상품은 아직 앱 내 결제가 열리지 않았습니다.");
      } else if (text.includes("too_many_pending_shop_orders")) {
        setOrderError("대기 중인 결제 시도가 많습니다. 잠시 후 다시 시도해 주세요.");
      } else if (text.includes("missing_toss")) {
        setOrderError("토스 결제 설정이 아직 준비되지 않았습니다.");
      } else {
        setOrderError("결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  const requestRefund = async (orderId: string) => {
    if (status !== "authenticated") {
      setOrderError("환불 요청은 로그인 후 가능합니다.");
      return;
    }
    setOrderError(null);
    setOrderNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/orders/refund", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          orderId,
          reason: "쇼핑 탭에서 접수한 환불 요청",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      const nextOrder = json.data.order as ShopOrderSummary;
      setOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)]);
      setAdminOrders((current) => {
        const currentEntry = current.find((item) => item.orderId === nextOrder.orderId);
        const nextAdminOrder: ShopAdminOrderSummary = {
          ...nextOrder,
          userLabel: currentEntry?.userLabel ?? "본인",
        };
        return [nextAdminOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)];
      });
      setOrderNotice("환불 요청이 접수되었습니다. 관리자 검토 후 처리됩니다.");
    } catch (error: any) {
      const text = String(error?.message ?? "failed_to_request_shop_refund");
      if (text.includes("not_refundable")) {
        setOrderError("이 주문은 현재 환불 요청을 받을 수 없는 상태입니다.");
      } else {
        setOrderError("환불 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  };

  const resolveAdminRefund = async (orderId: string, action: "approve" | "reject") => {
    if (!isAdmin) return;
    setAdminError(null);
    setAdminNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/shop/orders/${encodeURIComponent(orderId)}/refund`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          action,
          note: action === "approve" ? "관리자 승인 후 환불 처리" : "관리자 반려",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      const nextOrder = json.data.order as ShopAdminOrderSummary;
      setAdminOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)]);
      setOrders((current) => current.map((item) => (item.orderId === nextOrder.orderId ? nextOrder : item)));
      setAdminNotice(action === "approve" ? "환불이 승인되어 취소 처리되었습니다." : "환불 요청을 반려했습니다.");
    } catch (error: any) {
      const text = String(error?.message ?? "failed_to_process_shop_refund");
      if (text.includes("toss_")) {
        setAdminError("토스 환불 처리에 실패했습니다. 결제 설정과 결제 상태를 확인해 주세요.");
      } else {
        setAdminError("환불 처리에 실패했습니다.");
      }
    }
  };

  const toggleDraftSignal = (key: ShopSignalKey) => {
    setAdminDraft((current) => {
      const has = current.matchSignals.includes(key);
      const nextSignals = has
        ? current.matchSignals.filter((item) => item !== key)
        : [...current.matchSignals, key];
      return {
        ...current,
        matchSignals: nextSignals.length > 0 ? nextSignals : ["baseline_recovery"],
      };
    });
  };

  const startNewAdminDraft = () => {
    setAdminError(null);
    setAdminNotice(null);
    setAdminDraft(defaultAdminDraft());
  };

  const loadProductIntoAdminDraft = (product: ShopProduct) => {
    setAdminError(null);
    setAdminNotice(null);
    setAdminDraft(draftFromProduct(product));
    setAdminSheetOpen(true);
  };

  const submitAdminProduct = async () => {
    if (!isAdmin || adminSaving) return;
    if (requiredDraftMissing(adminDraft)) {
      setAdminError("필수 항목(상품명, 한 줄 설명, 상세 설명)을 먼저 입력해 주세요.");
      return;
    }

    setAdminSaving(true);
    setAdminError(null);
    setAdminNotice(null);

    try {
      const headers = await authHeaders();
      const res = await fetch("/api/admin/shop/catalog", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          product: draftToPayload(adminDraft),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.data?.products)) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }

      const nextCatalog = json.data.products as ShopProduct[];
      setCatalog(nextCatalog);
      setAdminNotice("상품이 저장되었습니다. 쇼핑 추천 목록에 바로 반영됩니다.");
      setAdminDraft((current) => ({
        ...current,
        id: String(json?.data?.product?.id ?? current.id),
      }));
    } catch (error) {
      const text = String((error as { message?: string })?.message ?? "failed_to_save_shop_product");
      if (text.includes("forbidden") || text.includes("admin")) {
        setAdminError("관리자 권한이 없는 계정이거나 운영 설정이 누락되었습니다.");
      } else if (text.includes("invalid_shop_product")) {
        setAdminError("입력값 형식이 올바르지 않습니다. 필수 항목과 링크 주소를 확인해 주세요.");
      } else {
        setAdminError("상품 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setAdminSaving(false);
    }
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

      {orderError || orderNotice ? (
        <Card>
          <CardBody className="pt-4">
            <div
              className={[
                "rounded-2xl px-4 py-3 text-[12.5px] leading-5",
                orderError
                  ? "border border-[#fecdca] bg-[#fff6f5] text-[#b42318]"
                  : "border border-[#b7e4c7] bg-[#f2fbf5] text-[#166534]",
              ].join(" ")}
            >
              {orderError ?? orderNotice}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardBody className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("운영 상품 관리")}</div>
                <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("관리자 계정에서만 보이는 등록 영역입니다. 저장 즉시 쇼핑 추천 카탈로그에 반영됩니다.")}</div>
              </div>
              <button
                type="button"
                data-auth-allow
                onClick={() => {
                  setAdminError(null);
                  setAdminNotice(null);
                  setAdminSheetOpen(true);
                }}
                className="inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-[12px] font-semibold text-white"
              >
                {t("상품 등록")}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-ios-sep bg-[#fafafa] px-3 py-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("카탈로그")}</div>
                <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{compactCount(catalog.length)}</div>
              </div>
              <div className="rounded-2xl border border-ios-sep bg-[#fafafa] px-3 py-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("로드 상태")}</div>
                <div className="mt-1 text-[14px] font-bold tracking-[-0.02em] text-ios-text">{catalogLoading ? t("불러오는 중") : t("준비됨")}</div>
              </div>
              <div className="rounded-2xl border border-ios-sep bg-[#fafafa] px-3 py-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ios-muted">{t("운영 권한")}</div>
                <div className="mt-1 text-[14px] font-bold tracking-[-0.02em] text-ios-text">{t("활성")}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {catalog.slice(0, 6).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  data-auth-allow
                  onClick={() => loadProductIntoAdminDraft(product)}
                  className="inline-flex rounded-full border border-ios-sep bg-white px-3 py-2 text-[11px] font-semibold text-ios-text"
                >
                  {product.name}
                </button>
              ))}
            </div>

            {catalogError ? <div className="mt-3 text-[12px] text-[#b42318]">{t("카탈로그를 불러오지 못해 기본 상품 목록으로 동작 중입니다.")}</div> : null}

            <div className="mt-4 rounded-2xl border border-ios-sep bg-[#fafafa] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold text-ios-text">{t("주문·환불 관리")}</div>
                  <div className="mt-1 text-[12px] leading-5 text-ios-sub">{t("최근 주문과 환불 요청을 여기서 바로 확인하고 처리합니다.")}</div>
                </div>
                <div className="rounded-full border border-ios-sep bg-white px-3 py-1 text-[11px] font-semibold text-ios-text">
                  {adminOrdersLoading ? t("불러오는 중") : `${adminOrders.length}${t("건")}`}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {adminOrders.slice(0, 5).map((order) => (
                  <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-semibold text-ios-text">{order.productSnapshot.name}</div>
                        <div className="mt-1 text-[11px] text-ios-sub">
                          {order.orderId} · {Math.round(order.amount).toLocaleString("ko-KR")}원
                        </div>
                        {order.userLabel ? <div className="mt-1 text-[11px] text-ios-sub">사용자 {order.userLabel}</div> : null}
                      </div>
                      <span className="rounded-full border border-ios-sep bg-[#fafafa] px-2.5 py-1 text-[10.5px] font-semibold text-ios-text">
                        {order.status}
                      </span>
                    </div>
                    {order.status === "REFUND_REQUESTED" ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          data-auth-allow
                          onClick={() => void resolveAdminRefund(order.orderId, "approve")}
                          className="inline-flex h-9 items-center justify-center rounded-full bg-black px-4 text-[11px] font-semibold text-white"
                        >
                          {t("환불 승인")}
                        </button>
                        <button
                          type="button"
                          data-auth-allow
                          onClick={() => void resolveAdminRefund(order.orderId, "reject")}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[11px] font-semibold text-ios-text"
                        >
                          {t("반려")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}

                {!adminOrdersLoading && adminOrders.length === 0 ? (
                  <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3 text-[12px] text-ios-sub">{t("아직 주문 기록이 없습니다.")}</div>
                ) : null}
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {status === "authenticated" ? (
        <Card>
          <CardBody className="pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{t("내 주문")}</div>
                <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("쇼핑 탭에서 결제한 주문과 환불 진행 상태를 확인합니다.")}</div>
              </div>
              <div className="rounded-full border border-ios-sep bg-[#fafafa] px-3 py-1 text-[11px] font-semibold text-ios-text">
                {ordersLoading ? t("불러오는 중") : `${orders.length}${t("건")}`}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {orders.map((order) => (
                <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-semibold text-ios-text">{order.productSnapshot.name}</div>
                      <div className="mt-1 text-[11px] text-ios-sub">
                        {t("수량")} {order.productSnapshot.quantity} · {Math.round(order.amount).toLocaleString("ko-KR")}원
                      </div>
                    </div>
                    <span className="rounded-full border border-ios-sep bg-[#fafafa] px-2.5 py-1 text-[10.5px] font-semibold text-ios-text">
                      {order.status}
                    </span>
                  </div>

                  {order.refund.status === "requested" ? (
                    <div className="mt-2 text-[11.5px] text-ios-sub">{t("환불 요청 접수됨")} · {order.refund.reason ?? t("사유 없음")}</div>
                  ) : null}
                  {order.refund.status === "rejected" ? (
                    <div className="mt-2 text-[11.5px] text-[#b42318]">{t("환불 반려")} · {order.refund.note ?? t("사유 없음")}</div>
                  ) : null}
                  {order.refund.status === "done" ? (
                    <div className="mt-2 text-[11.5px] text-[#166534]">{t("환불 완료")}</div>
                  ) : null}
                  {order.status === "FAILED" && order.failMessage ? (
                    <div className="mt-2 text-[11.5px] text-[#b42318]">{order.failMessage}</div>
                  ) : null}

                  {order.status === "PAID" && order.refund.status === "none" ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        data-auth-allow
                        onClick={() => void requestRefund(order.orderId)}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-[#fafafa] px-4 text-[11px] font-semibold text-ios-text"
                      >
                        {t("환불 요청")}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}

              {!ordersLoading && orders.length === 0 ? (
                <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3 text-[12px] text-ios-sub">{t("아직 쇼핑 주문이 없습니다.")}</div>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

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
                    <div className="text-[11px] font-semibold text-ios-muted">{formatShopPrice(entry.product)}</div>
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

                    {entry.product.checkoutEnabled && entry.product.priceKrw ? (
                      <button
                        type="button"
                        data-auth-allow
                        onClick={() => beginCheckout(entry.product.id)}
                        className="inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-[12px] font-semibold text-white"
                      >
                        {t("바로 결제")}
                      </button>
                    ) : entry.product.externalUrl ? (
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

      <ShopCheckoutSheet
        open={Boolean(checkoutEntry)}
        onClose={() => setCheckoutProductId(null)}
        onConfirm={() => void submitCheckout()}
        loading={checkoutLoading}
        productTitle={checkoutEntry?.product.name ?? ""}
        productSubtitle={checkoutEntry?.product.subtitle}
        priceKrw={checkoutEntry?.product.priceKrw ?? 0}
        quantity={1}
      />

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

              {selectedEntry.product.checkoutEnabled && selectedEntry.product.priceKrw ? (
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => beginCheckout(selectedEntry.product.id)}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-black text-[13px] font-semibold text-white"
                >
                  {t("토스로 결제")}
                </button>
              ) : selectedEntry.product.externalUrl ? (
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
                {selectedEntry.product.checkoutEnabled && selectedEntry.product.priceKrw
                  ? t("앱 안에서 토스 결제로 주문을 진행하고, 주문/환불 상태는 쇼핑 탭과 관리자 화면에 모두 기록됩니다.")
                  : selectedEntry.product.externalUrl
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

      <BottomSheet
        open={adminSheetOpen}
        onClose={() => setAdminSheetOpen(false)}
        title={t("운영 상품 등록")}
        subtitle={t("관리자 계정에서만 저장되며, 저장 즉시 쇼핑 카탈로그에 반영됩니다.")}
        variant="appstore"
        maxHeightClassName="max-h-[86dvh]"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-auth-allow
              onClick={startNewAdminDraft}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-ios-sep bg-white text-[13px] font-semibold text-ios-text"
            >
              {t("새 상품")}
            </button>
            <button
              type="button"
              data-auth-allow
              disabled={adminSaving}
              onClick={() => void submitAdminProduct()}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-black text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {adminSaving ? t("저장 중") : t("저장")}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <div className="rounded-[24px] border border-black/5 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold text-ios-text">{t("불러와 수정")}</div>
                <div className="mt-1 text-[12.5px] leading-5 text-ios-sub">{t("기존 상품을 탭하면 같은 ID로 덮어써서 수정합니다. 새 상품은 아래 폼을 비운 상태로 저장하면 됩니다.")}</div>
              </div>
              <button
                type="button"
                data-auth-allow
                onClick={startNewAdminDraft}
                className="inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-[#fafafa] px-3 text-[11px] font-semibold text-ios-text"
              >
                {t("폼 초기화")}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {catalog.slice(0, 10).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  data-auth-allow
                  onClick={() => setAdminDraft(draftFromProduct(product))}
                  className="inline-flex rounded-full border border-ios-sep bg-[#fafafa] px-3 py-2 text-[11px] font-semibold text-ios-text"
                >
                  {product.name}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/5 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("상품 ID")}</div>
                <input
                  value={adminDraft.id}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, id: e.target.value }))}
                  placeholder="비우면 상품명 기준 자동 생성"
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("상품명")}</div>
                <input
                  value={adminDraft.name}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, name: e.target.value }))}
                  placeholder="예: 야간 회복 안대"
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="text-[12px] font-semibold text-ios-text">{t("한 줄 설명")}</div>
                <input
                  value={adminDraft.subtitle}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, subtitle: e.target.value }))}
                  placeholder="근무 흐름에 맞는 짧은 설명"
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="text-[12px] font-semibold text-ios-text">{t("상세 설명")}</div>
                <textarea
                  value={adminDraft.description}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, description: e.target.value }))}
                  rows={3}
                  placeholder="왜 이 상품이 필요한지 간단하고 명확하게"
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/5 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("카테고리")}</div>
                <select
                  value={adminDraft.category}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, category: e.target.value as Exclude<ShopCategoryKey, "all"> }))}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                >
                  {SHOP_CATEGORIES.filter((item) => item.key !== "all").map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("우선순위")}</div>
                <select
                  value={String(adminDraft.priority)}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, priority: Number(e.target.value) || 4 }))}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("직접 결제 금액 (원)")}</div>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={String(adminDraft.priceKrw)}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, priceKrw: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("앱 내 결제")}</div>
                <button
                  type="button"
                  data-auth-allow
                  onClick={() => setAdminDraft((current) => ({ ...current, checkoutEnabled: !current.checkoutEnabled }))}
                  className={[
                    "mt-2 inline-flex h-[50px] w-full items-center justify-between rounded-2xl border px-4 text-[13px] font-semibold transition",
                    adminDraft.checkoutEnabled
                      ? "border-black bg-black text-white"
                      : "border-ios-sep bg-[#fafafa] text-ios-text",
                  ].join(" ")}
                >
                  <span>{adminDraft.checkoutEnabled ? t("토스 결제 활성") : t("외부 링크/대기만 사용")}</span>
                  <span>{adminDraft.checkoutEnabled ? "ON" : "OFF"}</span>
                </button>
              </label>
            </div>

            <div className="mt-4">
              <div className="text-[12px] font-semibold text-ios-text">{t("비주얼 톤")}</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {SHOP_VISUAL_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    data-auth-allow
                    onClick={() => setAdminDraft((current) => ({ ...current, visualPresetKey: preset.key }))}
                    className={[
                      "rounded-2xl border p-3 text-left transition",
                      adminDraft.visualPresetKey === preset.key
                        ? "border-black bg-black text-white"
                        : "border-ios-sep bg-white text-ios-text",
                    ].join(" ")}
                  >
                    <div className="text-[12px] font-semibold">{preset.label}</div>
                    <div className={["mt-1 h-8 rounded-xl", preset.className].join(" ")} />
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-4 block">
              <div className="text-[12px] font-semibold text-ios-text">{t("비주얼 라벨")}</div>
              <input
                value={adminDraft.visualLabel}
                onChange={(e) => setAdminDraft((current) => ({ ...current, visualLabel: e.target.value }))}
                placeholder="예: Night Reset"
                className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
              />
            </label>
          </div>

          <div className="rounded-[24px] border border-black/5 bg-white p-4">
            <div className="text-[12px] font-semibold text-ios-text">{t("추천 신호 매칭")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SHOP_SIGNAL_OPTIONS.map((signal) => {
                const active = adminDraft.matchSignals.includes(signal.key);
                return (
                  <button
                    key={signal.key}
                    type="button"
                    data-auth-allow
                    onClick={() => toggleDraftSignal(signal.key)}
                    className={[
                      "rounded-full px-3 py-2 text-[11px] font-semibold transition",
                      active
                        ? "border border-black/5 bg-black text-white"
                        : "border border-ios-sep bg-[#fafafa] text-ios-text",
                    ].join(" ")}
                  >
                    {signal.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/5 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("혜택 태그 (콤마 구분)")}</div>
                <input
                  value={adminDraft.benefitTagsText}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, benefitTagsText: e.target.value }))}
                  placeholder="수면 루틴, 눈 피로, 야간 후 정리"
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("외부 링크 (선택)")}</div>
                <input
                  value={adminDraft.externalUrl}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, externalUrl: e.target.value }))}
                  placeholder="https://..."
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="text-[12px] font-semibold text-ios-text">{t("사용 시점 (줄바꿈 구분)")}</div>
                <textarea
                  value={adminDraft.useMomentsText}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, useMomentsText: e.target.value }))}
                  rows={3}
                  placeholder={"야간 근무 후 바로 쉬기 전\n잠들기 20~30분 전"}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="text-[12px] font-semibold text-ios-text">{t("주의 문구")}</div>
                <textarea
                  value={adminDraft.caution}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, caution: e.target.value }))}
                  rows={2}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/5 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("가격 문구")}</div>
                <input
                  value={adminDraft.priceLabel}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, priceLabel: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block">
                <div className="text-[12px] font-semibold text-ios-text">{t("파트너 라벨")}</div>
                <input
                  value={adminDraft.partnerLabel}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, partnerLabel: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>

              <label className="block md:col-span-2">
                <div className="text-[12px] font-semibold text-ios-text">{t("제휴 상태 문구")}</div>
                <input
                  value={adminDraft.partnerStatus}
                  onChange={(e) => setAdminDraft((current) => ({ ...current, partnerStatus: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-ios-sep bg-[#fafafa] px-4 py-3 text-[13px] text-ios-text outline-none"
                />
              </label>
            </div>
          </div>

          {adminError ? (
            <div className="rounded-2xl border border-[#fecdca] bg-[#fff6f5] px-4 py-3 text-[12.5px] leading-5 text-[#b42318]">
              {adminError}
            </div>
          ) : null}

          {adminNotice ? (
            <div className="rounded-2xl border border-[#b7e4c7] bg-[#f2fbf5] px-4 py-3 text-[12.5px] leading-5 text-[#166534]">
              {adminNotice}
            </div>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}

export default ShopPage;
