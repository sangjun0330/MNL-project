"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import {
  createShopProductId,
  formatShopPrice,
  getShopCategoryMeta,
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  SHOP_SIGNAL_OPTIONS,
  SHOP_VISUAL_PRESETS,
  type ShopCategoryKey,
  type ShopProduct,
  type ShopSignalKey,
} from "@/lib/shop";
import { useI18n } from "@/lib/useI18n";

type ShopAdminOrderSummary = {
  orderId: string;
  userLabel: string;
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

type EditableCategory = Exclude<ShopCategoryKey, "all">;

type ProductDraft = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: EditableCategory;
  priceKrw: string;
  priceLabel: string;
  checkoutEnabled: boolean;
  externalUrl: string;
  partnerLabel: string;
  partnerStatus: string;
  visualPresetKey: string;
  visualLabel: string;
  benefitTags: string;
  useMoments: string;
  caution: string;
  priority: string;
  matchSignals: ShopSignalKey[];
};

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";
const INPUT_CLASS = "w-full rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[14px] text-[#11294b] outline-none transition placeholder:text-[#92a0b4] focus:border-[#11294b]";

function orderStatusLabel(status: ShopAdminOrderSummary["status"]) {
  switch (status) {
    case "READY":
      return "결제 대기";
    case "PAID":
      return "결제 완료";
    case "FAILED":
      return "결제 실패";
    case "CANCELED":
      return "주문 취소";
    case "REFUND_REQUESTED":
      return "환불 요청";
    case "REFUND_REJECTED":
      return "환불 반려";
    case "REFUNDED":
      return "환불 완료";
    default:
      return status;
  }
}

function orderStatusClass(status: ShopAdminOrderSummary["status"]) {
  if (status === "PAID" || status === "REFUNDED") return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  if (status === "FAILED" || status === "REFUND_REJECTED") return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  return "border-[#dfe5ee] bg-[#f7f8fb] text-[#3d4d63]";
}

function productToneClass(product: ShopProduct) {
  if (product.checkoutEnabled && product.priceKrw) return "border border-[#11294b] bg-[#11294b] text-white";
  if (product.externalUrl) return "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  return "border border-[#e1e7f0] bg-[#f7f9fc] text-[#11294b]";
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function splitCommaList(value: string, max = 8) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function splitLineList(value: string, max = 6) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function createEmptyDraft(): ProductDraft {
  return {
    id: "",
    name: "",
    subtitle: "",
    description: "",
    category: "sleep",
    priceKrw: "",
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    externalUrl: "",
    partnerLabel: "제휴 파트너 준비중",
    partnerStatus: "등록 준비중",
    visualPresetKey: SHOP_VISUAL_PRESETS[0]?.key ?? "midnight",
    visualLabel: "",
    benefitTags: "",
    useMoments: "",
    caution: "의학적 치료 대체가 아니라 생활 루틴 보조용으로만 안내합니다.",
    priority: "4",
    matchSignals: ["baseline_recovery"],
  };
}

function draftFromProduct(product: ShopProduct): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    category: product.category,
    priceKrw: product.priceKrw ? String(product.priceKrw) : "",
    priceLabel: product.priceLabel,
    checkoutEnabled: product.checkoutEnabled,
    externalUrl: product.externalUrl ?? "",
    partnerLabel: product.partnerLabel,
    partnerStatus: product.partnerStatus,
    visualPresetKey: SHOP_VISUAL_PRESETS.find((item) => item.className === product.visualClass)?.key ?? SHOP_VISUAL_PRESETS[0]?.key ?? "midnight",
    visualLabel: product.visualLabel,
    benefitTags: product.benefitTags.join(", "),
    useMoments: product.useMoments.join("\n"),
    caution: product.caution,
    priority: String(product.priority),
    matchSignals: product.matchSignals,
  };
}

export function ShopAdminPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "blocked">("checking");
  const [catalog, setCatalog] = useState<ShopProduct[]>(SHOP_PRODUCTS);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [orders, setOrders] = useState<ShopAdminOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(createEmptyDraft());
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"error" | "notice">("notice");
  const [refundLoadingId, setRefundLoadingId] = useState<string | null>(null);

  const categoryOptions = useMemo(() => SHOP_CATEGORIES.filter((item) => item.key !== "all"), []);
  const refundQueue = useMemo(() => orders.filter((order) => order.status === "REFUND_REQUESTED"), [orders]);

  const showNotice = (tone: "error" | "notice", text: string) => {
    setNoticeTone(tone);
    setNotice(text);
  };

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (status !== "authenticated" || !user?.userId) {
        if (!active) return;
        setAccessState("blocked");
        return;
      }

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
        if (!res.ok || !json?.ok || !json?.data?.isAdmin) {
          setAccessState("blocked");
          return;
        }
        setAccessState("allowed");

        setCatalogLoading(true);
        setOrdersLoading(true);

        const [catalogResult, ordersResult] = await Promise.allSettled([
          fetch("/api/admin/shop/catalog", {
            method: "GET",
            headers: {
              "content-type": "application/json",
              ...headers,
            },
            cache: "no-store",
          }).then(async (response) => ({
            ok: response.ok,
            status: response.status,
            json: await response.json().catch(() => null),
          })),
          fetch("/api/admin/shop/orders?limit=12", {
            method: "GET",
            headers: {
              "content-type": "application/json",
              ...headers,
            },
            cache: "no-store",
          }).then(async (response) => ({
            ok: response.ok,
            status: response.status,
            json: await response.json().catch(() => null),
          })),
        ]);

        if (!active) return;

        if (
          catalogResult.status === "fulfilled" &&
          catalogResult.value.ok &&
          catalogResult.value.json?.ok &&
          Array.isArray(catalogResult.value.json?.data?.products)
        ) {
          setCatalog(catalogResult.value.json.data.products as ShopProduct[]);
        } else {
          setCatalog(SHOP_PRODUCTS);
          setNoticeTone("error");
          setNotice("상품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }

        if (
          ordersResult.status === "fulfilled" &&
          ordersResult.value.ok &&
          ordersResult.value.json?.ok &&
          Array.isArray(ordersResult.value.json?.data?.orders)
        ) {
          setOrders(ordersResult.value.json.data.orders as ShopAdminOrderSummary[]);
        } else {
          setOrders([]);
          setNoticeTone("error");
          setNotice("주문 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      } catch {
        if (!active) return;
        setAccessState("blocked");
      } finally {
        if (!active) return;
        setCatalogLoading(false);
        setOrdersLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  const selectProduct = (product: ShopProduct) => {
    setActiveProductId(product.id);
    setDraft(draftFromProduct(product));
    setNotice(null);
  };

  const resetDraft = () => {
    setActiveProductId(null);
    setDraft(createEmptyDraft());
    setNotice(null);
  };

  const toggleSignal = (key: ShopSignalKey) => {
    setDraft((current) => {
      const exists = current.matchSignals.includes(key);
      const nextSignals = exists
        ? current.matchSignals.filter((item) => item !== key)
        : [...current.matchSignals, key].slice(0, 8);
      return {
        ...current,
        matchSignals: nextSignals.length > 0 ? nextSignals : ["baseline_recovery"],
      };
    });
  };

  const saveProduct = async () => {
    if (accessState !== "allowed") return;
    setSaveLoading(true);
    setNotice(null);

    try {
      const headers = await authHeaders();
      const payload = {
        product: {
          id: draft.id.trim() || createShopProductId(draft.name),
          name: draft.name,
          subtitle: draft.subtitle,
          description: draft.description,
          category: draft.category,
          priceKrw: draft.priceKrw ? Number(draft.priceKrw) : null,
          priceLabel: draft.priceLabel,
          checkoutEnabled: draft.checkoutEnabled,
          externalUrl: draft.externalUrl.trim() || undefined,
          partnerLabel: draft.partnerLabel,
          partnerStatus: draft.partnerStatus,
          visualPresetKey: draft.visualPresetKey,
          visualLabel: draft.visualLabel,
          benefitTags: splitCommaList(draft.benefitTags, 6),
          useMoments: splitLineList(draft.useMoments, 5),
          caution: draft.caution,
          priority: Number(draft.priority) || 4,
          matchSignals: draft.matchSignals,
        },
      };

      const res = await fetch("/api/admin/shop/catalog", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.data?.products)) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }

      const products = json.data.products as ShopProduct[];
      setCatalog(products);
      const saved = products.find((item) => item.id === payload.product.id) ?? products[0] ?? null;
      if (saved) {
        setActiveProductId(saved.id);
        setDraft(draftFromProduct(saved));
      }
      showNotice("notice", "상품이 저장되었습니다.");
    } catch {
      showNotice("error", "상품 저장에 실패했습니다. 입력값을 확인해 주세요.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRefundAction = async (orderId: string, action: "approve" | "reject") => {
    if (accessState !== "allowed") return;
    setRefundLoadingId(orderId);
    setNotice(null);

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
          note: action === "reject" ? "운영 기준상 현재 환불을 진행할 수 없습니다." : "환불 승인 완료",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      const nextOrder = json.data.order as ShopAdminOrderSummary;
      setOrders((current) => [nextOrder, ...current.filter((item) => item.orderId !== nextOrder.orderId)].slice(0, 12));
      showNotice("notice", action === "approve" ? "환불을 승인했습니다." : "환불 요청을 반려했습니다.");
    } catch {
      showNotice("error", "환불 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRefundLoadingId(null);
    }
  };

  if (accessState === "checking") {
    return (
      <div className="mx-auto w-full max-w-[820px] space-y-4 px-4 pb-24 pt-6">
        <div className="rounded-[28px] border border-ios-sep bg-white px-5 py-6 text-[13px] text-ios-sub">{t("관리자 권한을 확인하는 중입니다.")}</div>
      </div>
    );
  }

  if (accessState === "blocked") {
    return (
      <div className="mx-auto w-full max-w-[820px] space-y-4 px-4 pb-24 pt-6">
        <Link href="/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
          {t("쇼핑으로 돌아가기")}
        </Link>
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="text-[22px] font-bold tracking-[-0.02em] text-ios-text">{t("운영 관리자만 접근할 수 있습니다.")}</div>
          <div className="mt-2 text-[13px] leading-6 text-ios-sub">{t("현재 로그인한 계정에 관리자 권한이 없거나 로그인 상태가 아닙니다.")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
            {t("쇼핑으로 돌아가기")}
          </Link>
          <div className="mt-3 text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("쇼핑 운영 관리")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">{t("상품 등록, 최근 주문 확인, 환불 요청 처리를 한 화면에서 정리합니다.")}</div>
        </div>
      </div>

      {notice ? (
        <div
          className={[
            "rounded-2xl px-4 py-3 text-[12.5px] leading-5",
            noticeTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
          ].join(" ")}
        >
          {notice}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("등록된 상품")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("상품을 선택하면 우측 편집 영역에 현재 값이 채워집니다.")}</div>
          </div>
          <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {catalogLoading ? t("불러오는 중") : `${catalog.length}${t("개")}`}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {catalog.map((product) => {
            const active = activeProductId === product.id;
            return (
              <button
                key={product.id}
                type="button"
                data-auth-allow
                onClick={() => selectProduct(product)}
                className={[
                  "rounded-[24px] border p-4 text-left transition",
                  active ? "border-[#11294b] bg-[#eef4fb]" : "border-ios-sep bg-white",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-bold tracking-[-0.02em] text-ios-text">{product.name}</div>
                    <div className="mt-1 text-[12px] text-ios-sub">{getShopCategoryMeta(product.category).label}</div>
                  </div>
                  <span className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-2.5 py-1 text-[10px] font-semibold text-[#11294b]">
                    {product.checkoutEnabled && product.priceKrw ? t("직접 결제") : product.externalUrl ? t("외부 링크") : t("준비중")}
                  </span>
                </div>
                <div className={["mt-3 rounded-[20px] px-3 py-3", productToneClass(product)].join(" ")}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{product.visualLabel}</div>
                  <div className="mt-2 text-[12px] leading-5 opacity-85">{product.subtitle}</div>
                </div>
                <div className="mt-3 text-[12px] font-semibold text-[#11294b]">{formatShopPrice(product)}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{activeProductId ? t("상품 수정") : t("새 상품 등록")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("필수 입력만 채우고 저장하면 바로 쇼핑 목록과 상세 페이지에 반영됩니다.")}</div>
          </div>
          <button type="button" data-auth-allow onClick={resetDraft} className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
            {t("새로 작성")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("상품명")}</div>
            <input className={INPUT_CLASS} value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} />
          </label>
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("상품 ID")}</div>
            <input className={INPUT_CLASS} value={draft.id} onChange={(e) => setDraft((current) => ({ ...current, id: e.target.value }))} placeholder="비우면 이름 기준 자동 생성" />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("한 줄 요약")}</div>
            <input className={INPUT_CLASS} value={draft.subtitle} onChange={(e) => setDraft((current) => ({ ...current, subtitle: e.target.value }))} />
          </label>
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("카테고리")}</div>
            <select className={INPUT_CLASS} value={draft.category} onChange={(e) => setDraft((current) => ({ ...current, category: e.target.value as EditableCategory }))}>
              {categoryOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("상세 설명")}</div>
          <textarea className={`${INPUT_CLASS} min-h-[110px] resize-none`} value={draft.description} onChange={(e) => setDraft((current) => ({ ...current, description: e.target.value }))} />
        </label>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("가격(원)")}</div>
            <input className={INPUT_CLASS} inputMode="numeric" value={draft.priceKrw} onChange={(e) => setDraft((current) => ({ ...current, priceKrw: e.target.value }))} placeholder="직접 결제 상품만 입력" />
          </label>
          <label className="block md:col-span-2">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("가격 라벨")}</div>
            <input className={INPUT_CLASS} value={draft.priceLabel} onChange={(e) => setDraft((current) => ({ ...current, priceLabel: e.target.value }))} />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("외부 판매 링크")}</div>
            <input className={INPUT_CLASS} value={draft.externalUrl} onChange={(e) => setDraft((current) => ({ ...current, externalUrl: e.target.value }))} placeholder="https://..." />
          </label>
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("앱 내 결제")}</div>
            <button
              type="button"
              data-auth-allow
              onClick={() => setDraft((current) => ({ ...current, checkoutEnabled: !current.checkoutEnabled }))}
              className={[
                "h-[50px] w-full rounded-2xl border text-[13px] font-semibold transition",
                draft.checkoutEnabled ? "border-[#11294b] bg-[#11294b] text-white" : "border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]",
              ].join(" ")}
            >
              {draft.checkoutEnabled ? t("직접 결제 사용") : t("직접 결제 안 함")}
            </button>
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("파트너 라벨")}</div>
            <input className={INPUT_CLASS} value={draft.partnerLabel} onChange={(e) => setDraft((current) => ({ ...current, partnerLabel: e.target.value }))} />
          </label>
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("노출 상태 문구")}</div>
            <input className={INPUT_CLASS} value={draft.partnerStatus} onChange={(e) => setDraft((current) => ({ ...current, partnerStatus: e.target.value }))} />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("비주얼 라벨")}</div>
            <input className={INPUT_CLASS} value={draft.visualLabel} onChange={(e) => setDraft((current) => ({ ...current, visualLabel: e.target.value }))} />
          </label>
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("우선순위")}</div>
            <input className={INPUT_CLASS} inputMode="numeric" value={draft.priority} onChange={(e) => setDraft((current) => ({ ...current, priority: e.target.value }))} />
          </label>
        </div>

        <div className="mt-3">
          <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("비주얼 톤")}</div>
          <div className="flex flex-wrap gap-2">
            {SHOP_VISUAL_PRESETS.map((preset) => {
              const active = draft.visualPresetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  data-auth-allow
                  onClick={() => setDraft((current) => ({ ...current, visualPresetKey: preset.key }))}
                  className={[
                    "rounded-2xl border px-3 py-2 text-[11px] font-semibold transition",
                    active ? "border-[#11294b] bg-[#11294b] text-white" : "border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]",
                  ].join(" ")}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("혜택 태그 (쉼표 구분)")}</div>
            <input className={INPUT_CLASS} value={draft.benefitTags} onChange={(e) => setDraft((current) => ({ ...current, benefitTags: e.target.value }))} placeholder="수면 루틴, 눈 피로" />
          </label>
          <label className="block">
            <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("사용 시점 (줄바꿈 구분)")}</div>
            <textarea className={`${INPUT_CLASS} min-h-[110px] resize-none`} value={draft.useMoments} onChange={(e) => setDraft((current) => ({ ...current, useMoments: e.target.value }))} />
          </label>
        </div>

        <label className="mt-3 block">
          <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("주의 문구")}</div>
          <textarea className={`${INPUT_CLASS} min-h-[96px] resize-none`} value={draft.caution} onChange={(e) => setDraft((current) => ({ ...current, caution: e.target.value }))} />
        </label>

        <div className="mt-3">
          <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("추천 신호")}</div>
          <div className="flex flex-wrap gap-2">
            {SHOP_SIGNAL_OPTIONS.map((signal) => {
              const active = draft.matchSignals.includes(signal.key);
              return (
                <button
                  key={signal.key}
                  type="button"
                  data-auth-allow
                  onClick={() => toggleSignal(signal.key)}
                  className={[
                    "rounded-2xl border px-3 py-2 text-[11px] font-semibold transition",
                    active ? "border-[#11294b] bg-[#11294b] text-white" : "border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]",
                  ].join(" ")}
                >
                  {signal.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" data-auth-allow onClick={() => void saveProduct()} disabled={saveLoading} className={`${PRIMARY_BUTTON} h-11 text-[13px]`}>
            {saveLoading ? t("저장 중...") : t("상품 저장")}
          </button>
          <button type="button" data-auth-allow onClick={resetDraft} disabled={saveLoading} className={`${SECONDARY_BUTTON} h-11 text-[13px]`}>
            {t("입력 초기화")}
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("환불 요청 처리")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("환불 요청만 먼저 보이고, 아래에 최근 주문 흐름도 같이 확인할 수 있습니다.")}</div>
          </div>
          <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {ordersLoading ? t("불러오는 중") : `${refundQueue.length}${t("건")}`}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {refundQueue.map((order) => (
            <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-ios-text">{order.productSnapshot.name}</div>
                  <div className="mt-1 text-[11px] text-ios-sub">
                    {order.userLabel} · {Math.round(order.amount).toLocaleString("ko-KR")}원 · {formatDateLabel(order.createdAt)}
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                  {orderStatusLabel(order.status)}
                </span>
              </div>
              <div className="mt-2 text-[12px] text-ios-sub">{order.refund.reason ?? t("환불 사유 없음")}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-auth-allow
                  disabled={refundLoadingId === order.orderId}
                  onClick={() => void handleRefundAction(order.orderId, "approve")}
                  className={`${PRIMARY_BUTTON} h-10 text-[12px]`}
                >
                  {refundLoadingId === order.orderId ? t("처리 중...") : t("환불 승인")}
                </button>
                <button
                  type="button"
                  data-auth-allow
                  disabled={refundLoadingId === order.orderId}
                  onClick={() => void handleRefundAction(order.orderId, "reject")}
                  className={`${SECONDARY_BUTTON} h-10 text-[12px]`}
                >
                  {t("반려")}
                </button>
              </div>
            </div>
          ))}

          {!ordersLoading && refundQueue.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("현재 처리할 환불 요청이 없습니다.")}</div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("최근 주문")}</div>
        <div className="mt-4 space-y-2">
          {orders.map((order) => (
            <div key={order.orderId} className="rounded-2xl border border-ios-sep bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-ios-text">{order.productSnapshot.name}</div>
                  <div className="mt-1 text-[11px] text-ios-sub">
                    {order.userLabel} · {order.productSnapshot.quantity}개 · {Math.round(order.amount).toLocaleString("ko-KR")}원 · {formatDateLabel(order.createdAt)}
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                  {orderStatusLabel(order.status)}
                </span>
              </div>
              {order.refund.status === "rejected" ? <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.refund.note ?? t("반려 사유 없음")}</div> : null}
              {order.status === "FAILED" && order.failMessage ? <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div> : null}
            </div>
          ))}
          {!ordersLoading && orders.length === 0 ? <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("최근 주문이 없습니다.")}</div> : null}
        </div>
      </div>
    </div>
  );
}
