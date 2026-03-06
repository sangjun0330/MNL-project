"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import {
  createShopProductId,
  formatShopPrice,
  getShopCategoryMeta,
  getShopImageSrc,
  getShopVisualPreset,
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  SHOP_SIGNAL_OPTIONS,
  SHOP_VISUAL_PRESETS,
  type ShopCategoryKey,
  type ShopProduct,
  type ShopProductSpec,
  type ShopSignalKey,
} from "@/lib/shop";
import { findShopCarrierOptionByCode, findShopCarrierOptionByLabel, SHOP_CARRIER_OPTIONS } from "@/lib/shopShipping";
import { useI18n } from "@/lib/useI18n";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ShopAdminOrderSummary = {
  orderId: string;
  userLabel: string;
  status: "READY" | "PAID" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED" | "SHIPPED" | "DELIVERED";
  amount: number;
  createdAt: string;
  approvedAt: string | null;
  paymentMethod: string | null;
  failMessage: string | null;
  productSnapshot: { name: string; quantity: number };
  shipping: {
    recipientName: string;
    phone: string;
    postalCode: string;
    addressLine1: string;
    addressLine2: string;
    deliveryNote: string;
  };
  refund: { status: "none" | "requested" | "rejected" | "done"; reason: string | null; note: string | null };
  trackingNumber: string | null;
  courier: string | null;
  tracking: {
    carrierCode: string | null;
    trackingUrl: string | null;
    statusLabel: string | null;
    lastEventAt: string | null;
    lastPolledAt: string | null;
  } | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

type ShopAdminClaimStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "RETURN_SHIPPED"
  | "RETURN_RECEIVED"
  | "REFUND_COMPLETED"
  | "EXCHANGE_SHIPPED"
  | "WITHDRAWN";

type ShopAdminClaimSummary = {
  claimId: string;
  orderId: string;
  userLabel: string;
  claimType: "REFUND" | "EXCHANGE";
  status: ShopAdminClaimStatus;
  reason: string;
  detail: string | null;
  adminNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  returnTrackingNumber: string | null;
  returnCourier: string | null;
  returnShippedAt: string | null;
  returnReceivedAt: string | null;
  exchangeTrackingNumber: string | null;
  exchangeCourier: string | null;
  exchangeShippedAt: string | null;
  refundCompletedAt: string | null;
  order: ShopAdminOrderSummary | null;
};

type EditableCategory = Exclude<ShopCategoryKey, "all">;

type ProductDraft = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: EditableCategory;
  priceKrw: string;
  originalPriceKrw: string;
  priceLabel: string;
  checkoutEnabled: boolean;
  externalUrl: string;
  partnerLabel: string;
  partnerStatus: string;
  visualPresetKey: string;
  visualLabel: string;
  benefitTags: string[];
  useMoments: string[];
  caution: string;
  imageUrls: string[];
  detailImageUrls: string[];
  specs: ShopProductSpec[];
  priority: string;
  stockCount: string;
  outOfStock: boolean;
  matchSignals: ShopSignalKey[];
  detailHeadline: string;
  detailSummary: string;
  detailStoryTitle: string;
  detailStoryBody: string;
  detailFeatureTitle: string;
  detailFeatureItems: string[];
  detailRoutineTitle: string;
  detailRoutineItems: string[];
  detailNoticeTitle: string;
  detailNoticeBody: string;
  active: boolean;
};

type FieldErrors = Partial<Record<keyof ProductDraft | "priceKrwRequired", string>>;

type AdminTab = "basic" | "price" | "visual" | "media" | "detail" | "signals";
type CatalogFilter = "all" | "active" | "inactive";
type AdminSection = "products" | "orders" | "refunds";
const CUSTOM_CARRIER_VALUE = "__custom__";

// ─────────────────────────────────────────────
// Style constants
// ─────────────────────────────────────────────

const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#11294b] bg-[#11294b] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";
const DANGER_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#f1d0cc] bg-[#fff6f5] px-4 font-semibold text-[#a33a2b] transition disabled:opacity-60";
const INPUT_CLASS = "w-full rounded-2xl border border-[#d7dfeb] bg-white px-4 py-3 text-[14px] text-[#11294b] outline-none transition placeholder:text-[#92a0b4] focus:border-[#11294b]";
const INPUT_ERROR = "border-[#e07b6a] focus:border-[#e07b6a]";
const LABEL_CLASS = "mb-2 text-[12px] font-semibold text-[#11294b]";
const ERROR_CLASS = "mt-1 text-[11px] text-[#a33a2b]";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function orderStatusLabel(status: ShopAdminOrderSummary["status"]) {
  switch (status) {
    case "READY": return "결제 대기";
    case "PAID": return "결제 완료";
    case "FAILED": return "결제 실패";
    case "CANCELED": return "주문 취소";
    case "REFUND_REQUESTED": return "환불 요청";
    case "REFUND_REJECTED": return "환불 반려";
    case "REFUNDED": return "환불 완료";
    case "SHIPPED": return "배송 중";
    case "DELIVERED": return "배송 완료";
    default: return status;
  }
}

function orderStatusClass(status: ShopAdminOrderSummary["status"]) {
  if (status === "PAID") return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  if (status === "SHIPPED") return "border-[#c8dff6] bg-[#e6f0fc] text-[#2b5faa]";
  if (status === "DELIVERED" || status === "REFUNDED") return "border-[#c2d9bd] bg-[#edf7eb] text-[#2e6b26]";
  if (status === "FAILED" || status === "REFUND_REJECTED") return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  return "border-[#dfe5ee] bg-[#f7f8fb] text-[#3d4d63]";
}

function claimTypeLabel(type: ShopAdminClaimSummary["claimType"]) {
  return type === "REFUND" ? "환불" : "교환";
}

function claimStatusLabel(status: ShopAdminClaimSummary["status"]) {
  switch (status) {
    case "REQUESTED": return "접수됨";
    case "APPROVED": return "승인됨";
    case "REJECTED": return "반려됨";
    case "RETURN_SHIPPED": return "반품 발송";
    case "RETURN_RECEIVED": return "반품 입고";
    case "REFUND_COMPLETED": return "환불 완료";
    case "EXCHANGE_SHIPPED": return "교환품 발송";
    case "WITHDRAWN": return "철회됨";
    default: return status;
  }
}

function claimStatusClass(status: ShopAdminClaimSummary["status"]) {
  if (status === "REJECTED") return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  if (status === "REFUND_COMPLETED" || status === "EXCHANGE_SHIPPED") {
    return "border-[#c2d9bd] bg-[#edf7eb] text-[#2e6b26]";
  }
  return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
}

function isActiveClaimStatus(status: ShopAdminClaimSummary["status"]) {
  return status === "REQUESTED" || status === "APPROVED" || status === "RETURN_SHIPPED" || status === "RETURN_RECEIVED";
}

function productChannelLabel(product: ShopProduct & { active?: boolean }) {
  const isActive = (product as any).active !== false;
  if (!isActive) return "비활성";
  if (product.checkoutEnabled && product.priceKrw) return "직접 결제";
  if (product.externalUrl) return "외부 링크";
  return "준비중";
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function buildShippingDrafts(orders: ShopAdminOrderSummary[]) {
  return orders.reduce<Record<string, { courier: string; carrierCode: string; trackingNumber: string }>>((acc, order) => {
    acc[order.orderId] = {
      courier: order.courier ?? "",
      carrierCode: order.tracking?.carrierCode ?? "",
      trackingNumber: order.trackingNumber ?? "",
    };
    return acc;
  }, {});
}

const ADMIN_SHIPPING_DRAFT_STORAGE_KEY = "shop-admin-shipping-drafts";

function sanitizeShippingDraftValue(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function sanitizeShippingDraftMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const next: Record<string, { courier: string; carrierCode: string; trackingNumber: string }> = {};
  for (const [orderId, raw] of Object.entries(value as Record<string, unknown>)) {
    const safeOrderId = sanitizeShippingDraftValue(orderId, 80);
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    if (!safeOrderId) continue;
    next[safeOrderId] = {
      courier: sanitizeShippingDraftValue(source.courier, 60),
      carrierCode: sanitizeShippingDraftValue(source.carrierCode, 40),
      trackingNumber: sanitizeShippingDraftValue(source.trackingNumber, 120),
    };
  }
  return next;
}

function readStoredShippingDrafts(storageKey: string | null) {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    return sanitizeShippingDraftMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeStoredShippingDrafts(
  storageKey: string | null,
  drafts: Record<string, { courier: string; carrierCode: string; trackingNumber: string }>
) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(sanitizeShippingDraftMap(drafts)));
  } catch {
    // ignore storage quota / privacy mode failures
  }
}

function mergeShippingDraftMaps(
  orders: ShopAdminOrderSummary[],
  currentDrafts: Record<string, { courier: string; carrierCode: string; trackingNumber: string }>,
  storedDrafts: Record<string, { courier: string; carrierCode: string; trackingNumber: string }>
) {
  const serverDrafts = buildShippingDrafts(orders);
  const merged: Record<string, { courier: string; carrierCode: string; trackingNumber: string }> = {};

  for (const order of orders) {
    const server = serverDrafts[order.orderId] ?? { courier: "", carrierCode: "", trackingNumber: "" };
    const current = currentDrafts[order.orderId] ?? { courier: "", carrierCode: "", trackingNumber: "" };
    const stored = storedDrafts[order.orderId] ?? { courier: "", carrierCode: "", trackingNumber: "" };
    // PAID 상태일 때는 관리자가 송장/택배사를 입력 중일 수 있으므로 현재 입력값(current > stored)을 서버보다 우선.
    // 그 외 상태(SHIPPED 등)는 서버 데이터를 우선해서 항상 최신 DB 값으로 보여준다.
    if (order.status === "PAID") {
      merged[order.orderId] = {
        courier: current.courier || stored.courier || server.courier || "",
        carrierCode: current.carrierCode || stored.carrierCode || server.carrierCode || "",
        trackingNumber: current.trackingNumber || stored.trackingNumber || server.trackingNumber || "",
      };
    } else {
      merged[order.orderId] = {
        courier: server.courier || current.courier || stored.courier || "",
        carrierCode: server.carrierCode || current.carrierCode || stored.carrierCode || "",
        trackingNumber: server.trackingNumber || current.trackingNumber || stored.trackingNumber || "",
      };
    }
  }

  return merged;
}

function resolveDraftCarrierSelectValue(draft: { courier: string; carrierCode: string; trackingNumber: string } | undefined) {
  const safeCode = String(draft?.carrierCode ?? "").trim();
  const safeCourier = String(draft?.courier ?? "").trim();
  if (!safeCode && !safeCourier) return "";
  const carrier = findShopCarrierOptionByCode(safeCode) ?? findShopCarrierOptionByLabel(safeCourier);
  return carrier?.code ?? CUSTOM_CARRIER_VALUE;
}

function AdminSummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/88 px-4 py-4 shadow-[0_10px_30px_rgba(17,41,75,0.05)]">
      <div className="text-[11px] font-semibold text-[#92a0b4]">{label}</div>
      <div className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[#11294b]">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-[#7c8ea5]">{hint}</div> : null}
    </div>
  );
}

function validateDraft(draft: ProductDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.name.trim()) errors.name = "상품명은 필수입니다";
  if (!draft.subtitle.trim()) errors.subtitle = "한 줄 요약은 필수입니다";
  if (!draft.description.trim()) errors.description = "상세 설명은 필수입니다";
  if (draft.checkoutEnabled && !draft.priceKrw) errors.priceKrwRequired = "결제 활성화 시 가격이 필요합니다";
  return errors;
}

function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

function errorsInTab(errors: FieldErrors, tab: AdminTab): boolean {
  const tabFields: Record<AdminTab, (keyof FieldErrors)[]> = {
    basic: ["name", "subtitle", "description"],
    price: ["priceKrwRequired"],
    visual: [],
    media: [],
    detail: [],
    signals: [],
  };
  return tabFields[tab].some((f) => f in errors);
}

function createEmptyDraft(): ProductDraft {
  return {
    id: "",
    name: "",
    subtitle: "",
    description: "",
    category: "sleep",
    priceKrw: "",
    originalPriceKrw: "",
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    externalUrl: "",
    partnerLabel: "제휴 파트너 준비중",
    partnerStatus: "등록 준비중",
    visualPresetKey: SHOP_VISUAL_PRESETS[0]?.key ?? "midnight",
    visualLabel: "",
    benefitTags: [],
    useMoments: [],
    caution: "의학적 치료 대체가 아니라 생활 루틴 보조용으로만 안내합니다.",
    imageUrls: [],
    detailImageUrls: [],
    specs: [],
    priority: "4",
    stockCount: "",
    outOfStock: false,
    matchSignals: ["baseline_recovery"],
    detailHeadline: "",
    detailSummary: "",
    detailStoryTitle: "이 제품은",
    detailStoryBody: "",
    detailFeatureTitle: "핵심 포인트",
    detailFeatureItems: [],
    detailRoutineTitle: "이럴 때 보기 좋아요",
    detailRoutineItems: [],
    detailNoticeTitle: "구매 전 안내",
    detailNoticeBody: "",
    active: true,
  };
}

function draftFromProduct(product: ShopProduct & { active?: boolean }): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle,
    description: product.description,
    category: product.category,
    priceKrw: product.priceKrw ? String(product.priceKrw) : "",
    originalPriceKrw: product.originalPriceKrw ? String(product.originalPriceKrw) : "",
    priceLabel: product.priceLabel,
    checkoutEnabled: product.checkoutEnabled,
    externalUrl: product.externalUrl ?? "",
    partnerLabel: product.partnerLabel,
    partnerStatus: product.partnerStatus,
    visualPresetKey: SHOP_VISUAL_PRESETS.find((item) => item.className === product.visualClass)?.key ?? SHOP_VISUAL_PRESETS[0]?.key ?? "midnight",
    visualLabel: product.visualLabel,
    benefitTags: [...product.benefitTags],
    useMoments: [...product.useMoments],
    caution: product.caution,
    imageUrls: [...product.imageUrls],
    detailImageUrls: [...product.detailPage.detailImageUrls],
    specs: product.specs.map((s) => ({ label: s.label, value: s.value })),
    priority: String(product.priority),
    stockCount: product.stockCount !== null && product.stockCount !== undefined ? String(product.stockCount) : "",
    outOfStock: product.outOfStock ?? false,
    matchSignals: [...product.matchSignals],
    detailHeadline: product.detailPage.headline,
    detailSummary: product.detailPage.summary,
    detailStoryTitle: product.detailPage.storyTitle,
    detailStoryBody: product.detailPage.storyBody,
    detailFeatureTitle: product.detailPage.featureTitle,
    detailFeatureItems: [...product.detailPage.featureItems],
    detailRoutineTitle: product.detailPage.routineTitle,
    detailRoutineItems: [...product.detailPage.routineItems],
    detailNoticeTitle: product.detailPage.noticeTitle,
    detailNoticeBody: product.detailPage.noticeBody,
    active: (product as any).active !== false,
  };
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className={ERROR_CLASS}>{message}</p>;
}

function TagInput({ value, onChange, max = 6, placeholder }: { value: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const tag = input.trim();
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setInput("");
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className="rounded-2xl border border-[#d7dfeb] bg-white px-3 py-2 transition focus-within:border-[#11294b]">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#11294b] px-2.5 py-1 text-[11px] font-semibold text-white">
            {tag}
            <button type="button" data-auth-allow onClick={() => removeTag(tag)} className="ml-0.5 opacity-70 hover:opacity-100">✕</button>
          </span>
        ))}
        {value.length < max && (
          <input
            ref={inputRef}
            className="min-w-[120px] flex-1 bg-transparent py-1 text-[13px] text-[#11294b] outline-none placeholder:text-[#92a0b4]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder={value.length === 0 ? (placeholder ?? "입력 후 Enter") : ""}
          />
        )}
      </div>
      {value.length < max && input.trim() ? (
        <button type="button" data-auth-allow onClick={addTag} className="mt-2 text-[11px] font-semibold text-[#11294b] opacity-70 hover:opacity-100">
          + 추가
        </button>
      ) : null}
      <p className="mt-1 text-[10px] text-[#92a0b4]">{value.length}/{max}개</p>
    </div>
  );
}

function UrlListInput({ value, onChange, max = 6 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const [brokenKeys, setBrokenKeys] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addRow = () => {
    if (value.length < max) onChange([...value, ""]);
    setUploadError(null);
  };
  const updateRow = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
    setUploadError(null);
    setBrokenKeys((current) => {
      const key = `${i}:${value[i] ?? ""}`;
      if (!current[key]) return current;
      const nextMap = { ...current };
      delete nextMap[key];
      return nextMap;
    });
  };
  const removeRow = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
    setBrokenKeys({});
    setUploadError(null);
  };

  const isValidUrl = (url: string) => {
    if (!url) return true;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return true;
    try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const remaining = Math.max(0, max - value.length);
    if (remaining <= 0) {
      setUploadError(`최대 ${max}개까지만 등록할 수 있습니다.`);
      event.target.value = "";
      return;
    }

    const selectedFiles = files.slice(0, remaining);
    try {
      const dataUrls = await Promise.all(
        selectedFiles.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              if (!file.type.startsWith("image/")) {
                reject(new Error("invalid_type"));
                return;
              }
              if (file.size > 4 * 1024 * 1024) {
                reject(new Error("file_too_large"));
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === "string" ? reader.result : "";
                if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(result)) {
                  reject(new Error("invalid_data"));
                  return;
                }
                resolve(result);
              };
              reader.onerror = () => reject(new Error("read_failed"));
              reader.readAsDataURL(file);
            })
        )
      );

      onChange([...value, ...dataUrls]);
      setUploadError(files.length > remaining ? `최대 ${max}개까지만 등록되어 일부 파일은 제외했습니다.` : null);
    } catch (error: any) {
      const code = String(error?.message ?? "");
      if (code === "file_too_large") {
        setUploadError("이미지 파일은 1장당 4MB 이하로 업로드해 주세요.");
      } else if (code === "invalid_type") {
        setUploadError("이미지 파일만 업로드할 수 있습니다.");
      } else {
        setUploadError("이미지를 읽지 못했습니다. 다시 시도해 주세요.");
      }
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {value.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          {(() => {
            const previewKey = `${i}:${url}`;
            const canPreview = Boolean(url && isValidUrl(url) && !brokenKeys[previewKey]);
          return (
              <>
          <div className="flex-1">
            <input
              className={[INPUT_CLASS, !isValidUrl(url) && url ? INPUT_ERROR : ""].join(" ")}
              value={url}
              onChange={(e) => updateRow(i, e.target.value)}
              placeholder="https://... 또는 사진 업로드"
            />
            {!isValidUrl(url) && url ? <p className={ERROR_CLASS}>올바른 URL 또는 이미지 데이터만 사용할 수 있습니다.</p> : null}
          </div>
          {canPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getShopImageSrc(url)}
              alt=""
              className="h-10 w-10 rounded-xl border border-[#d7dfeb] object-cover"
              referrerPolicy="no-referrer"
              onError={() => {
                setBrokenKeys((current) => ({ ...current, [previewKey]: true }));
              }}
            />
          ) : <div className="h-10 w-10 flex-shrink-0 rounded-xl border border-[#d7dfeb] bg-[#f4f7fb]" />}
          <button type="button" data-auth-allow onClick={() => removeRow(i)} className="flex-shrink-0 rounded-xl p-2 text-[#92a0b4] hover:text-[#a33a2b]">✕</button>
              </>
            );
          })()}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {value.length < max ? (
          <button type="button" data-auth-allow onClick={addRow} className={`${SECONDARY_BUTTON} h-9 text-[12px]`}>+ URL 추가</button>
        ) : null}
        {value.length < max ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleFileUpload(event)}
            />
            <button
              type="button"
              data-auth-allow
              onClick={() => fileInputRef.current?.click()}
              className={`${SECONDARY_BUTTON} h-9 text-[12px]`}
            >
              + 사진 업로드
            </button>
          </>
        ) : null}
      </div>
      {uploadError ? <p className={ERROR_CLASS}>{uploadError}</p> : null}
      <p className="text-[10px] text-[#92a0b4]">실제 사진 업로드 시 base64로 저장됩니다. 1장당 4MB 이하 권장</p>
      <p className="text-[10px] text-[#92a0b4]">{value.length}/{max}개</p>
    </div>
  );
}

function SpecsInput({ value, onChange, max = 8 }: { value: ShopProductSpec[]; onChange: (v: ShopProductSpec[]) => void; max?: number }) {
  const addRow = () => { if (value.length < max) onChange([...value, { label: "", value: "" }]); };
  const updateRow = (i: number, field: "label" | "value", v: string) => {
    const next = value.map((item, idx) => idx === i ? { ...item, [field]: v } : item);
    onChange(next);
  };
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((spec, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${INPUT_CLASS} flex-[2]`}
            value={spec.label}
            onChange={(e) => updateRow(i, "label", e.target.value)}
            placeholder="라벨 (예: 브랜드)"
          />
          <span className="flex-shrink-0 text-[#92a0b4]">:</span>
          <input
            className={`${INPUT_CLASS} flex-[3]`}
            value={spec.value}
            onChange={(e) => updateRow(i, "value", e.target.value)}
            placeholder="값 (예: RNest)"
          />
          <button type="button" data-auth-allow onClick={() => removeRow(i)} className="flex-shrink-0 rounded-xl p-2 text-[#92a0b4] hover:text-[#a33a2b]">✕</button>
        </div>
      ))}
      {value.length < max ? (
        <button type="button" data-auth-allow onClick={addRow} className={`${SECONDARY_BUTTON} h-9 text-[12px]`}>+ 항목 추가</button>
      ) : null}
      <p className="text-[10px] text-[#92a0b4]">{value.length}/{max}개</p>
    </div>
  );
}

function LineListInput({ value, onChange, max = 6, placeholder }: { value: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string }) {
  const addRow = () => { if (value.length < max) onChange([...value, ""]); };
  const updateRow = (i: number, v: string) => { const next = [...value]; next[i] = v; onChange(next); };
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${INPUT_CLASS} flex-1`}
            value={item}
            onChange={(e) => updateRow(i, e.target.value)}
            placeholder={placeholder}
          />
          <button type="button" data-auth-allow onClick={() => removeRow(i)} className="flex-shrink-0 rounded-xl p-2 text-[#92a0b4] hover:text-[#a33a2b]">✕</button>
        </div>
      ))}
      {value.length < max ? (
        <button type="button" data-auth-allow onClick={addRow} className={`${SECONDARY_BUTTON} h-9 text-[12px]`}>+ 항목 추가</button>
      ) : null}
      <p className="text-[10px] text-[#92a0b4]">{value.length}/{max}개</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Product card preview
// ─────────────────────────────────────────────

function ProductPreviewCard({ draft }: { draft: ProductDraft }) {
  const preset = getShopVisualPreset(draft.visualPresetKey);
  return (
    <div className="mt-4 rounded-[24px] border border-[#d7dfeb] p-1">
      <div className="mb-2 text-[11px] font-semibold text-[#92a0b4]">미리보기</div>
      <div className={`rounded-[20px] p-4 ${preset.className}`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">{draft.visualLabel || "LABEL"}</div>
        <div className="mt-2 text-[14px] font-bold">{draft.name || "상품명"}</div>
        <div className="mt-1 text-[12px] opacity-85">{draft.subtitle || "한 줄 요약"}</div>
      </div>
      {draft.benefitTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-1 pb-1">
          {draft.benefitTags.map((tag) => (
            <span key={tag} className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-2 py-0.5 text-[10px] font-semibold text-[#11294b]">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab panels
// ─────────────────────────────────────────────

function TabBasic({ draft, setDraft, errors }: { draft: ProductDraft; setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>; errors: FieldErrors }) {
  const categoryOptions = SHOP_CATEGORIES.filter((item) => item.key !== "all");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className={LABEL_CLASS}>상품명 *</div>
          <input
            className={[INPUT_CLASS, errors.name ? INPUT_ERROR : ""].join(" ")}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="예: 온열 아이 마스크"
          />
          <FieldError message={errors.name} />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>상품 ID</div>
          <input
            className={INPUT_CLASS}
            value={draft.id}
            onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
            placeholder="비우면 이름 기준 자동 생성"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className={LABEL_CLASS}>한 줄 요약 *</div>
          <input
            className={[INPUT_CLASS, errors.subtitle ? INPUT_ERROR : ""].join(" ")}
            value={draft.subtitle}
            onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
            placeholder="예: 야간 후 눈 피로와 잠들기 전 루틴을 정리하는 기본 아이템"
          />
          <FieldError message={errors.subtitle} />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>카테고리 *</div>
          <select
            className={INPUT_CLASS}
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as EditableCategory }))}
          >
            {categoryOptions.map((item) => (
              <option key={item.key} value={item.key}>{item.label} — {item.subtitle}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <div className={LABEL_CLASS}>상세 설명 *</div>
        <textarea
          className={[INPUT_CLASS, "min-h-[110px] resize-none", errors.description ? INPUT_ERROR : ""].join(" ")}
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="상품 카드 설명으로 사용됩니다"
        />
        <FieldError message={errors.description} />
      </label>

      <label className="block">
        <div className={LABEL_CLASS}>주의 문구</div>
        <textarea
          className={`${INPUT_CLASS} min-h-[80px] resize-none`}
          value={draft.caution}
          onChange={(e) => setDraft((d) => ({ ...d, caution: e.target.value }))}
        />
      </label>
    </div>
  );
}

function TabPrice({ draft, setDraft, errors }: { draft: ProductDraft; setDraft: React.Dispatch<React.SetStateAction<ProductDraft>>; errors: FieldErrors }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className={LABEL_CLASS}>가격 (원)</div>
          <input
            className={[INPUT_CLASS, errors.priceKrwRequired ? INPUT_ERROR : ""].join(" ")}
            inputMode="numeric"
            value={draft.priceKrw}
            onChange={(e) => setDraft((d) => ({ ...d, priceKrw: e.target.value }))}
            placeholder="직접 결제 상품만 입력"
          />
          <FieldError message={errors.priceKrwRequired} />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>정가 (원, 할인 전)</div>
          <input
            className={INPUT_CLASS}
            inputMode="numeric"
            value={draft.originalPriceKrw}
            onChange={(e) => setDraft((d) => ({ ...d, originalPriceKrw: e.target.value }))}
            placeholder="할인 시에만 입력 (예: 39000)"
          />
          <p className="mt-1 text-[10px] text-[#92a0b4]">입력 시 할인율 자동 계산 표시</p>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className={LABEL_CLASS}>가격 라벨</div>
          <input
            className={INPUT_CLASS}
            value={draft.priceLabel}
            onChange={(e) => setDraft((d) => ({ ...d, priceLabel: e.target.value }))}
            placeholder="예: 제휴 가격 연동 예정"
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>재고 수량</div>
          <input
            className={INPUT_CLASS}
            inputMode="numeric"
            value={draft.stockCount}
            onChange={(e) => setDraft((d) => ({ ...d, stockCount: e.target.value }))}
            placeholder="비우면 무제한"
          />
          <p className="mt-1 text-[10px] text-[#92a0b4]">직접 결제 상품은 0이면 품절 처리됩니다. 외부 판매 상품은 비워두는 쪽이 안전합니다.</p>
        </label>
      </div>

      <label className="block">
        <div className={LABEL_CLASS}>품절 처리</div>
        <button
          type="button"
          data-auth-allow
          onClick={() => setDraft((d) => ({ ...d, outOfStock: !d.outOfStock }))}
          className={[
            "h-12 w-full rounded-2xl border text-[13px] font-semibold transition",
            draft.outOfStock ? "border-[#e07b6a] bg-[#fff6f5] text-[#a33a2b]" : "border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]",
          ].join(" ")}
        >
          {draft.outOfStock ? "품절 상태" : "정상 판매 중"}
        </button>
      </label>

      <label className="block">
        <div className={LABEL_CLASS}>앱 내 결제</div>
        <button
          type="button"
          data-auth-allow
          onClick={() => setDraft((d) => ({ ...d, checkoutEnabled: !d.checkoutEnabled }))}
          className={[
            "h-12 w-full rounded-2xl border text-[13px] font-semibold transition",
            draft.checkoutEnabled ? "border-[#11294b] bg-[#11294b] text-white" : "border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]",
          ].join(" ")}
        >
          {draft.checkoutEnabled ? "직접 결제 사용 중" : "직접 결제 사용 안 함"}
        </button>
        {draft.checkoutEnabled ? (
          <p className="mt-1 text-[11px] text-[#3d7fc4]">가격(원) 입력 필수 · Toss 결제 활성화됨</p>
        ) : null}
      </label>

      <label className="block">
        <div className={LABEL_CLASS}>외부 판매 링크</div>
        <input
          className={INPUT_CLASS}
          value={draft.externalUrl}
          onChange={(e) => setDraft((d) => ({ ...d, externalUrl: e.target.value }))}
          placeholder="https://..."
        />
      </label>

      <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4">
        <div className="mb-3 text-[12px] font-bold text-[#11294b]">파트너 정보</div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className={LABEL_CLASS}>파트너 라벨</div>
            <input
              className={INPUT_CLASS}
              value={draft.partnerLabel}
              onChange={(e) => setDraft((d) => ({ ...d, partnerLabel: e.target.value }))}
              placeholder="예: 제휴 파트너 준비중"
            />
          </label>
          <label className="block">
            <div className={LABEL_CLASS}>노출 상태 문구</div>
            <input
              className={INPUT_CLASS}
              value={draft.partnerStatus}
              onChange={(e) => setDraft((d) => ({ ...d, partnerStatus: e.target.value }))}
              placeholder="예: 등록 준비중"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function TabVisual({ draft, setDraft }: { draft: ProductDraft; setDraft: React.Dispatch<React.SetStateAction<ProductDraft>> }) {
  return (
    <div className="space-y-4">
      <div>
        <div className={LABEL_CLASS}>비주얼 톤</div>
        <div className="flex flex-wrap gap-2">
          {SHOP_VISUAL_PRESETS.map((preset) => {
            const active = draft.visualPresetKey === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                data-auth-allow
                onClick={() => setDraft((d) => ({ ...d, visualPresetKey: preset.key }))}
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

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className={LABEL_CLASS}>비주얼 라벨</div>
          <input
            className={INPUT_CLASS}
            value={draft.visualLabel}
            onChange={(e) => setDraft((d) => ({ ...d, visualLabel: e.target.value }))}
            placeholder="예: Sleep Reset"
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>우선순위 (1~9)</div>
          <input
            className={INPUT_CLASS}
            inputMode="numeric"
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
            placeholder="4"
          />
          <p className="mt-1 text-[10px] text-[#92a0b4]">숫자가 클수록 추천 목록 상단에 노출</p>
        </label>
      </div>

      <div>
        <div className={LABEL_CLASS}>혜택 태그</div>
        <TagInput
          value={draft.benefitTags}
          onChange={(v) => setDraft((d) => ({ ...d, benefitTags: v }))}
          max={6}
          placeholder="태그 입력 후 Enter"
        />
      </div>

      <div>
        <div className={LABEL_CLASS}>추천 사용 시점</div>
        <LineListInput
          value={draft.useMoments}
          onChange={(v) => setDraft((d) => ({ ...d, useMoments: v }))}
          max={5}
          placeholder="예: 야간 근무 후 바로 쉬기 전"
        />
      </div>

      <ProductPreviewCard draft={draft} />
    </div>
  );
}

function TabMedia({ draft, setDraft }: { draft: ProductDraft; setDraft: React.Dispatch<React.SetStateAction<ProductDraft>> }) {
  return (
    <div className="space-y-4">
      <div>
        <div className={LABEL_CLASS}>메인 갤러리 이미지 URL (최대 6개)</div>
        <UrlListInput
          value={draft.imageUrls}
          onChange={(v) => setDraft((d) => ({ ...d, imageUrls: v }))}
          max={6}
        />
        <p className="mt-1 text-[10px] text-[#92a0b4]">상단 슬라이드와 목록 카드에 먼저 노출되는 대표 이미지입니다.</p>
      </div>

      <div>
        <div className={LABEL_CLASS}>상세 본문 이미지 URL (최대 6개)</div>
        <UrlListInput
          value={draft.detailImageUrls}
          onChange={(v) => setDraft((d) => ({ ...d, detailImageUrls: v }))}
          max={6}
        />
        <p className="mt-1 text-[10px] text-[#92a0b4]">상세 소개 섹션에만 노출됩니다. 비우면 메인 이미지를 일부 재사용합니다.</p>
      </div>

      <div>
        <div className={LABEL_CLASS}>제품 정보 (스펙, 최대 8개)</div>
        <SpecsInput
          value={draft.specs}
          onChange={(v) => setDraft((d) => ({ ...d, specs: v }))}
          max={8}
        />
      </div>
    </div>
  );
}

function TabDetail({ draft, setDraft }: { draft: ProductDraft; setDraft: React.Dispatch<React.SetStateAction<ProductDraft>> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className={LABEL_CLASS}>상세 헤드라인</div>
          <input
            className={INPUT_CLASS}
            value={draft.detailHeadline}
            onChange={(e) => setDraft((d) => ({ ...d, detailHeadline: e.target.value }))}
            placeholder="예: 야간 후 눈 피로 루틴"
          />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>상세 요약</div>
          <input
            className={INPUT_CLASS}
            value={draft.detailSummary}
            onChange={(e) => setDraft((d) => ({ ...d, detailSummary: e.target.value }))}
            placeholder="한 문장 요약"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 space-y-3">
        <div className="text-[12px] font-bold text-[#11294b]">소개 섹션</div>
        <label className="block">
          <div className={LABEL_CLASS}>섹션 제목</div>
          <input className={INPUT_CLASS} value={draft.detailStoryTitle} onChange={(e) => setDraft((d) => ({ ...d, detailStoryTitle: e.target.value }))} />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>섹션 내용</div>
          <textarea className={`${INPUT_CLASS} min-h-[110px] resize-none`} value={draft.detailStoryBody} onChange={(e) => setDraft((d) => ({ ...d, detailStoryBody: e.target.value }))} />
        </label>
      </div>

      <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 space-y-3">
        <div className="text-[12px] font-bold text-[#11294b]">핵심 포인트 섹션</div>
        <label className="block">
          <div className={LABEL_CLASS}>섹션 제목</div>
          <input className={INPUT_CLASS} value={draft.detailFeatureTitle} onChange={(e) => setDraft((d) => ({ ...d, detailFeatureTitle: e.target.value }))} />
        </label>
        <div>
          <div className={LABEL_CLASS}>포인트 목록</div>
          <LineListInput
            value={draft.detailFeatureItems}
            onChange={(v) => setDraft((d) => ({ ...d, detailFeatureItems: v }))}
            max={6}
            placeholder="예: 자연 흑요암 소재, 피부에 부드럽게"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 space-y-3">
        <div className="text-[12px] font-bold text-[#11294b]">추천 상황 섹션</div>
        <label className="block">
          <div className={LABEL_CLASS}>섹션 제목</div>
          <input className={INPUT_CLASS} value={draft.detailRoutineTitle} onChange={(e) => setDraft((d) => ({ ...d, detailRoutineTitle: e.target.value }))} />
        </label>
        <div>
          <div className={LABEL_CLASS}>상황 목록</div>
          <LineListInput
            value={draft.detailRoutineItems}
            onChange={(v) => setDraft((d) => ({ ...d, detailRoutineItems: v }))}
            max={6}
            placeholder="예: 야간 근무 후 바로 쉬기 전"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 space-y-3">
        <div className="text-[12px] font-bold text-[#11294b]">구매 안내 섹션</div>
        <label className="block">
          <div className={LABEL_CLASS}>섹션 제목</div>
          <input className={INPUT_CLASS} value={draft.detailNoticeTitle} onChange={(e) => setDraft((d) => ({ ...d, detailNoticeTitle: e.target.value }))} />
        </label>
        <label className="block">
          <div className={LABEL_CLASS}>안내 본문</div>
          <textarea className={`${INPUT_CLASS} min-h-[90px] resize-none`} value={draft.detailNoticeBody} onChange={(e) => setDraft((d) => ({ ...d, detailNoticeBody: e.target.value }))} />
        </label>
      </div>
    </div>
  );
}

function TabSignals({ draft, setDraft }: { draft: ProductDraft; setDraft: React.Dispatch<React.SetStateAction<ProductDraft>> }) {
  const toggleSignal = (key: ShopSignalKey) => {
    setDraft((d) => {
      const exists = d.matchSignals.includes(key);
      const next = exists
        ? d.matchSignals.filter((item) => item !== key)
        : [...d.matchSignals, key].slice(0, 8);
      return { ...d, matchSignals: next.length > 0 ? next : ["baseline_recovery"] };
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-[#44556d] leading-5">
        오늘 근무·수면·스트레스 등 상태와 매칭되는 신호를 선택하세요.<br />
        선택된 신호가 사용자 상태와 일치할 때 이 상품의 추천 점수가 올라갑니다.
      </p>
      <div className="space-y-2">
        {SHOP_SIGNAL_OPTIONS.map((signal) => {
          const active = draft.matchSignals.includes(signal.key);
          return (
            <button
              key={signal.key}
              type="button"
              data-auth-allow
              onClick={() => toggleSignal(signal.key)}
              className={[
                "w-full rounded-2xl border px-4 py-3 text-left transition",
                active ? "border-[#11294b] bg-[#eef4fb]" : "border-[#d7dfeb] bg-white",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className={`text-[13px] font-semibold ${active ? "text-[#11294b]" : "text-[#44556d]"}`}>{signal.label}</span>
                  <p className="mt-0.5 text-[11px] text-[#92a0b4]">{signal.reason}</p>
                </div>
                <div className={[
                  "h-5 w-5 flex-shrink-0 rounded-full border transition",
                  active ? "border-[#11294b] bg-[#11294b]" : "border-[#d7dfeb] bg-white",
                ].join(" ")} />
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[#92a0b4]">{draft.matchSignals.length}개 선택됨 (최대 8개)</p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ShopAdminPage() {
  const { t } = useI18n();
  const { status, user } = useAuthState();
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "blocked">("checking");
  const mountedRef = useRef(true);

  // Catalog (includes inactive for admin)
  const [catalog, setCatalog] = useState<(ShopProduct & { active?: boolean })[]>(SHOP_PRODUCTS);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");

  // Orders & refunds
  const [orders, setOrders] = useState<ShopAdminOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [claims, setClaims] = useState<ShopAdminClaimSummary[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [shippingDrafts, setShippingDrafts] = useState<Record<string, { courier: string; carrierCode: string; trackingNumber: string }>>({});
  const [shippingLoadingId, setShippingLoadingId] = useState<string | null>(null);
  const [claimShippingDrafts, setClaimShippingDrafts] = useState<Record<string, { courier: string; trackingNumber: string }>>({});
  const [claimAdminNoteDrafts, setClaimAdminNoteDrafts] = useState<Record<string, string>>({});

  // Edit state
  const [draft, setDraft] = useState<ProductDraft>(createEmptyDraft());
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("basic");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"error" | "notice">("notice");
  const [claimLoadingId, setClaimLoadingId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>("products");
  const shippingDraftStorageKey = user?.userId ? `${ADMIN_SHIPPING_DRAFT_STORAGE_KEY}:${user.userId}` : null;

  const claimQueue = useMemo(() => claims.filter((claim) => isActiveClaimStatus(claim.status)), [claims]);
  const salesStats = useMemo(() => {
    const paidLikeStatuses: ShopAdminOrderSummary["status"][] = ["PAID", "SHIPPED", "DELIVERED", "REFUND_REQUESTED", "REFUND_REJECTED"];
    const totalSales = orders
      .filter((order) => paidLikeStatuses.includes(order.status))
      .reduce((sum, order) => sum + Math.max(0, Math.round(Number(order.amount) || 0)), 0);
    return {
      totalOrders: orders.length,
      totalSales,
      refundPending: claimQueue.length,
      shippingPending: orders.filter((order) => order.status === "PAID").length,
    };
  }, [claimQueue.length, orders]);
  const orderFlowStats = useMemo(
    () => ({
      readyToShip: orders.filter((order) => order.status === "PAID").length,
      shipping: orders.filter((order) => order.status === "SHIPPED").length,
      delivered: orders.filter((order) => order.status === "DELIVERED").length,
      issues: orders.filter((order) => order.status === "FAILED" || order.status === "REFUND_REJECTED").length,
    }),
    [orders]
  );
  const filteredCatalog = useMemo(() => {
    if (catalogFilter === "active") return catalog.filter((p) => p.active !== false);
    if (catalogFilter === "inactive") return catalog.filter((p) => p.active === false);
    return catalog;
  }, [catalog, catalogFilter]);

  const showNotice = (tone: "error" | "notice", text: string) => {
    setNoticeTone(tone);
    setNotice(text);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAdminOrders = useCallback(
    async (input?: { showLoading?: boolean; silent?: boolean; headers?: Record<string, string> }) => {
      if (!input?.headers && (status !== "authenticated" || !user?.userId)) return;
      if (input?.showLoading && mountedRef.current) setOrdersLoading(true);

      try {
        const headers = input?.headers ?? (await authHeaders());
        const res = await fetch("/api/admin/shop/orders?limit=40", {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!mountedRef.current) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.orders)) throw new Error();

        const nextOrders = json.data.orders as ShopAdminOrderSummary[];
        setOrders(nextOrders);
        setShippingDrafts((current) =>
          mergeShippingDraftMaps(nextOrders, current, readStoredShippingDrafts(shippingDraftStorageKey))
        );
      } catch {
        if (!mountedRef.current || input?.silent) return;
        setNoticeTone("error");
        setNotice("주문 목록을 다시 불러오지 못했습니다.");
      } finally {
        if (input?.showLoading && mountedRef.current) setOrdersLoading(false);
      }
    },
    [shippingDraftStorageKey, status, user?.userId]
  );

  const loadAdminClaims = useCallback(
    async (input?: { showLoading?: boolean; silent?: boolean; headers?: Record<string, string> }) => {
      if (!input?.headers && (status !== "authenticated" || !user?.userId)) return;
      if (input?.showLoading && mountedRef.current) setClaimsLoading(true);

      try {
        const headers = input?.headers ?? (await authHeaders());
        const res = await fetch("/api/admin/shop/claims?limit=80", {
          method: "GET",
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!mountedRef.current) return;
        if (!res.ok || !json?.ok || !Array.isArray(json?.data?.claims)) throw new Error();

        const nextClaims = json.data.claims as ShopAdminClaimSummary[];
        setClaims(nextClaims);
        setClaimShippingDrafts((current) => {
          const merged: Record<string, { courier: string; trackingNumber: string }> = { ...current };
          for (const claim of nextClaims) {
            merged[claim.claimId] = {
              courier: current[claim.claimId]?.courier || claim.exchangeCourier || "",
              trackingNumber: current[claim.claimId]?.trackingNumber || claim.exchangeTrackingNumber || "",
            };
          }
          return merged;
        });
        setClaimAdminNoteDrafts((current) => {
          const merged: Record<string, string> = { ...current };
          for (const claim of nextClaims) {
            if (!(claim.claimId in merged)) {
              merged[claim.claimId] = claim.adminNote ?? "";
            }
          }
          return merged;
        });
      } catch {
        if (!mountedRef.current || input?.silent) return;
        setNoticeTone("error");
        setNotice("교환/환불 클레임 목록을 다시 불러오지 못했습니다.");
      } finally {
        if (input?.showLoading && mountedRef.current) setClaimsLoading(false);
      }
    },
    [status, user?.userId]
  );

  // Auth + initial data load
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
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !json?.data?.isAdmin) { setAccessState("blocked"); return; }
        setAccessState("allowed");

        setCatalogLoading(true);
        const [catalogResult, ordersResult, claimsResult] = await Promise.allSettled([
          fetch("/api/admin/shop/catalog", {
            method: "GET",
            headers: { "content-type": "application/json", ...headers },
            cache: "no-store",
          }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) })),
          loadAdminOrders({ showLoading: true, silent: true, headers }),
          loadAdminClaims({ showLoading: true, silent: true, headers }),
        ]);

        if (!active) return;

        if (catalogResult.status === "fulfilled" && catalogResult.value.ok && Array.isArray(catalogResult.value.json?.data?.products)) {
          setCatalog(catalogResult.value.json.data.products);
        } else {
          setCatalog(SHOP_PRODUCTS);
          showNotice("error", "상품 목록을 불러오지 못했습니다.");
        }
        if (ordersResult.status === "rejected") {
          showNotice("error", "주문 목록을 불러오지 못했습니다.");
        }
        if (claimsResult.status === "rejected") {
          showNotice("error", "교환/환불 클레임 목록을 불러오지 못했습니다.");
        }
      } catch {
        if (!active) return;
        setAccessState("blocked");
      } finally {
        if (!active) return;
        setCatalogLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [loadAdminClaims, loadAdminOrders, status, user?.userId]);

  useEffect(() => {
    if (accessState !== "allowed") return;

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadAdminOrders({ showLoading: false, silent: true });
      void loadAdminClaims({ showLoading: false, silent: true });
    };

    const intervalId = window.setInterval(refreshIfVisible, 15000); // 30s → 15s: 관리자 배송처리 응답성 개선
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [accessState, loadAdminClaims, loadAdminOrders]);

  useEffect(() => {
    writeStoredShippingDrafts(shippingDraftStorageKey, shippingDrafts);
  }, [shippingDraftStorageKey, shippingDrafts]);

  const selectProduct = (product: ShopProduct & { active?: boolean }) => {
    setActiveProductId(product.id);
    setDraft(draftFromProduct(product));
    setActiveTab("basic");
    setFieldErrors({});
    setNotice(null);
  };

  const resetDraft = () => {
    setActiveProductId(null);
    setDraft(createEmptyDraft());
    setActiveTab("basic");
    setFieldErrors({});
    setNotice(null);
  };

  const saveProduct = async () => {
    if (accessState !== "allowed") return;
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      // Navigate to first tab with errors
      const tabsWithErrors: AdminTab[] = ["basic", "price", "visual", "media", "detail", "signals"];
      const firstErrorTab = tabsWithErrors.find((tab) => errorsInTab(errors, tab));
      if (firstErrorTab) setActiveTab(firstErrorTab);
      showNotice("error", "필수 항목을 확인해주세요.");
      return;
    }

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
          originalPriceKrw: draft.originalPriceKrw ? Number(draft.originalPriceKrw) : null,
          priceLabel: draft.priceLabel,
          checkoutEnabled: draft.checkoutEnabled,
          externalUrl: draft.externalUrl.trim() || undefined,
          partnerLabel: draft.partnerLabel,
          partnerStatus: draft.partnerStatus,
          visualPresetKey: draft.visualPresetKey,
          visualLabel: draft.visualLabel,
          benefitTags: draft.benefitTags,
          useMoments: draft.useMoments,
          caution: draft.caution,
          imageUrls: draft.imageUrls.filter(Boolean),
          specs: draft.specs.filter((s) => s.label && s.value),
          priority: Number(draft.priority) || 4,
          stockCount: draft.stockCount ? Number(draft.stockCount) : null,
          outOfStock: draft.outOfStock,
          active: draft.active,
          matchSignals: draft.matchSignals,
          detailPage: {
            headline: draft.detailHeadline,
            summary: draft.detailSummary,
            storyTitle: draft.detailStoryTitle,
            storyBody: draft.detailStoryBody,
            detailImageUrls: draft.detailImageUrls.filter(Boolean),
            featureTitle: draft.detailFeatureTitle,
            featureItems: draft.detailFeatureItems.filter(Boolean),
            routineTitle: draft.detailRoutineTitle,
            routineItems: draft.detailRoutineItems.filter(Boolean),
            noticeTitle: draft.detailNoticeTitle,
            noticeBody: draft.detailNoticeBody,
          },
        },
      };

      const res = await fetch("/api/admin/shop/catalog", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));

      const products = json.data.products as (ShopProduct & { active?: boolean })[];
      setCatalog(products);
      const saved = products.find((item) => item.id === payload.product.id) ?? products[0] ?? null;
      if (saved) {
        setActiveProductId(saved.id);
        setDraft(draftFromProduct(saved));
      }
      showNotice("notice", "상품이 저장되었습니다.");
    } catch (error: any) {
      const text = String(error?.message ?? "");
      if (text === "shop_catalog_storage_unavailable") {
        showNotice("error", "Supabase shop 테이블 마이그레이션이 필요합니다.");
      } else if (text === "invalid_shop_product") {
        showNotice("error", "필수 입력값이 비어 있거나 형식이 맞지 않습니다.");
      } else {
        showNotice("error", "상품 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const toggleProductActive = async (productId: string, currentActive: boolean) => {
    if (accessState !== "allowed") return;
    setToggleLoading(productId);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/shop/catalog/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ active: !currentActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error();
      if (Array.isArray(json?.data?.products)) setCatalog(json.data.products);
      showNotice("notice", !currentActive ? "상품이 활성화되었습니다." : "상품이 비활성화되었습니다.");
      // If we were editing the toggled product, refresh draft
      if (activeProductId === productId) {
        const updated = (json.data.products as (ShopProduct & { active?: boolean })[]).find((p) => p.id === productId);
        if (updated) setDraft((d) => ({ ...d, active: updated.active !== false }));
      }
    } catch {
      showNotice("error", "상태 변경에 실패했습니다.");
    } finally {
      setToggleLoading(null);
    }
  };

  const handleClaimShippingDraftChange = (
    claimId: string,
    field: "courier" | "trackingNumber",
    value: string
  ) => {
    setClaimShippingDrafts((current) => ({
      ...current,
      [claimId]: {
        courier: current[claimId]?.courier ?? "",
        trackingNumber: current[claimId]?.trackingNumber ?? "",
        [field]: value,
      },
    }));
  };

  const handleClaimAdminNoteDraftChange = (claimId: string, value: string) => {
    setClaimAdminNoteDrafts((current) => ({
      ...current,
      [claimId]: value,
    }));
  };

  const handleClaimAction = async (
    claim: ShopAdminClaimSummary,
    action: "approve" | "reject" | "mark_return_received" | "complete_refund" | "ship_exchange"
  ) => {
    if (accessState !== "allowed") return;
    setClaimLoadingId(claim.claimId);
    setNotice(null);

    const draft = claimShippingDrafts[claim.claimId] ?? { courier: "", trackingNumber: "" };
    const adminNote = String(claimAdminNoteDrafts[claim.claimId] ?? claim.adminNote ?? "").trim();
    if (adminNote.length < 2) {
      showNotice("error", "관리자 처리 사유를 2자 이상 입력해 주세요.");
      setClaimLoadingId(null);
      return;
    }
    if (action === "ship_exchange" && (!draft.courier.trim() || !draft.trackingNumber.trim())) {
      showNotice("error", "교환품 발송 처리에는 택배사와 운송장 번호가 필요합니다.");
      setClaimLoadingId(null);
      return;
    }

    try {
      const headers = await authHeaders();
      const payload: Record<string, string> = {
        action,
        note: adminNote,
      };
      if (action === "ship_exchange") {
        payload.courier = draft.courier.trim();
        payload.trackingNumber = draft.trackingNumber.trim();
      }

      const res = await fetch(`/api/admin/shop/claims/${encodeURIComponent(claim.claimId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error ?? `http_${res.status}`));

      const nextClaim = json.data.claim as ShopAdminClaimSummary;
      const nextOrder = (json.data.order ?? null) as ShopAdminOrderSummary | null;
      setClaims((current) => current.map((item) => (item.claimId === nextClaim.claimId ? { ...nextClaim, order: nextOrder ?? item.order ?? null } : item)));
      setClaimAdminNoteDrafts((current) => ({
        ...current,
        [nextClaim.claimId]: nextClaim.adminNote ?? adminNote,
      }));
      if (nextOrder) {
        setOrders((current) => current.map((item) => (item.orderId === nextOrder.orderId ? nextOrder : item)));
      }

      void loadAdminClaims({ showLoading: false, silent: true });
      void loadAdminOrders({ showLoading: false, silent: true });

      if (action === "approve") showNotice("notice", "요청을 승인했습니다.");
      if (action === "reject") showNotice("notice", "요청을 반려했습니다.");
      if (action === "mark_return_received") showNotice("notice", "반품 입고를 확인했습니다.");
      if (action === "complete_refund") showNotice("notice", "환불 처리를 완료했습니다.");
      if (action === "ship_exchange") showNotice("notice", "교환품 발송 정보를 등록했습니다.");
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message === "shop_claim_storage_unavailable") {
        showNotice("error", "교환/환불 클레임 저장소 또는 스키마가 아직 완전히 준비되지 않았습니다.");
      } else if (message.includes("admin_note_required")) {
        showNotice("error", "관리자 처리 사유를 2자 이상 입력해 주세요.");
      } else if (message.includes("refund_not_ready")) {
        showNotice("error", "반품 입고가 확인된 환불 클레임만 최종 환불 처리할 수 있습니다.");
      } else if (message.includes("exchange_not_ready")) {
        showNotice("error", "반품 입고가 확인된 교환 클레임만 교환품 발송할 수 있습니다.");
      } else if (message.includes("return_not_shipped")) {
        showNotice("error", "사용자 반품 발송 등록 후에만 입고 확인이 가능합니다.");
      } else {
        showNotice("error", "클레임 처리에 실패했습니다.");
      }
    } finally {
      setClaimLoadingId(null);
    }
  };

  const handleShippingDraftChange = (
    orderId: string,
    field: "courier" | "carrierCode" | "trackingNumber",
    value: string
  ) => {
    // useEffect 의존 없이 즉시 localStorage에 기록 → 브라우저 이동/새로고침 전에도 안전하게 보존
    const next = {
      ...shippingDrafts,
      [orderId]: {
        courier: shippingDrafts[orderId]?.courier ?? "",
        carrierCode: shippingDrafts[orderId]?.carrierCode ?? "",
        trackingNumber: shippingDrafts[orderId]?.trackingNumber ?? "",
        [field]: value,
      },
    };
    setShippingDrafts(next);
    writeStoredShippingDrafts(shippingDraftStorageKey, next);
  };

  const handleCarrierSelectionChange = (orderId: string, value: string) => {
    let next: Record<string, { courier: string; carrierCode: string; trackingNumber: string }>;
    if (!value) {
      next = {
        ...shippingDrafts,
        [orderId]: {
          courier: "",
          carrierCode: "",
          trackingNumber: shippingDrafts[orderId]?.trackingNumber ?? "",
        },
      };
    } else if (value === CUSTOM_CARRIER_VALUE) {
      next = {
        ...shippingDrafts,
        [orderId]: {
          courier: shippingDrafts[orderId]?.courier ?? "",
          carrierCode: findShopCarrierOptionByCode(shippingDrafts[orderId]?.carrierCode ?? "")?.code ? "" : (shippingDrafts[orderId]?.carrierCode ?? ""),
          trackingNumber: shippingDrafts[orderId]?.trackingNumber ?? "",
        },
      };
    } else {
      const carrier = findShopCarrierOptionByCode(value);
      if (!carrier) return;
      next = {
        ...shippingDrafts,
        [orderId]: {
          courier: carrier.label,
          carrierCode: carrier.code,
          trackingNumber: shippingDrafts[orderId]?.trackingNumber ?? "",
        },
      };
    }
    setShippingDrafts(next);
    writeStoredShippingDrafts(shippingDraftStorageKey, next);
  };

  const handleShippingAction = async (orderId: string, action: "mark_shipped" | "mark_delivered" | "sync_tracking") => {
    if (accessState !== "allowed") return;
    setShippingLoadingId(orderId);
    setNotice(null);

    const draft = shippingDrafts[orderId] ?? { courier: "", carrierCode: "", trackingNumber: "" };
    if (action === "mark_shipped" && (!draft.courier.trim() || !draft.carrierCode.trim() || !draft.trackingNumber.trim())) {
      showNotice("error", "배송 처리에는 택배사 선택과 운송장 번호가 필요합니다. 기타 택배사만 연동 코드를 직접 입력해 주세요.");
      setShippingLoadingId(null);
      return;
    }

    try {
      const headers = await authHeaders();
      const body =
        action === "mark_shipped"
          ? {
              action,
              courier: draft.courier.trim(),
              carrierCode: draft.carrierCode.trim(),
              trackingNumber: draft.trackingNumber.trim(),
            }
          : { action };

      const res = await fetch(`/api/admin/shop/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }

      const nextOrder = json.data.order as ShopAdminOrderSummary;
      setOrders((current) => current.map((order) => (order.orderId === nextOrder.orderId ? nextOrder : order)));
      setShippingDrafts((current) => ({
        ...current,
        [nextOrder.orderId]: {
          courier: nextOrder.courier ?? "",
          carrierCode: nextOrder.tracking?.carrierCode ?? "",
          trackingNumber: nextOrder.trackingNumber ?? "",
        },
      }));
      // DB 반영 후 목록 갱신: 즉시 호출 시 아직 이전 상태가 반환될 수 있으므로 2.5초 지연
      setTimeout(() => { if (mountedRef.current) void loadAdminOrders({ showLoading: false, silent: true }); }, 2500);
      showNotice(
        "notice",
        action === "mark_shipped"
          ? nextOrder.tracking?.trackingUrl
            ? "배송 처리를 시작했고 실시간 배송 추적을 연결했습니다."
            : "배송 처리를 시작했습니다. 배송 상태는 잠시 후 다시 동기화됩니다."
          : action === "sync_tracking"
            ? "스마트택배 배송 상태를 다시 확인했습니다."
            : "배송 완료로 변경했습니다."
      );
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message === "tracking_number_and_courier_required") {
        showNotice("error", "택배사와 운송장 번호를 모두 입력해주세요.");
      } else if (message === "tracking_carrier_code_required") {
        showNotice("error", "선택되지 않은 택배사는 스마트택배 연동 코드를 직접 입력해주세요.");
      } else if (message === "shop_order_not_paid") {
        showNotice("error", "결제 완료 주문만 배송 처리할 수 있습니다.");
      } else if (message === "shop_order_not_shipped") {
        showNotice("error", "배송 중 상태 주문만 배송 완료로 바꿀 수 있습니다.");
      } else if (message === "shop_order_storage_unavailable") {
        showNotice("error", "주문 저장소 또는 스키마가 아직 완전히 준비되지 않았습니다. 쇼핑 DB 마이그레이션 상태를 확인해 주세요.");
      } else if (message === "failed_to_update_shop_order") {
        showNotice("error", "배송 상태 변경 반영 중 문제가 발생했습니다. 잠시 후 목록을 새로고침하고 다시 시도해 주세요.");
      } else {
        showNotice("error", "배송 상태 변경에 실패했습니다.");
      }
    } finally {
      setShippingLoadingId(null);
    }
  };

  // ─── Access states ───
  if (accessState === "checking") {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 pb-24 pt-6">
        <div className="rounded-[28px] border border-ios-sep bg-white px-5 py-6 text-[13px] text-ios-sub">{t("관리자 권한을 확인하는 중입니다.")}</div>
      </div>
    );
  }
  if (accessState === "blocked") {
    return (
      <div className="mx-auto w-full max-w-[900px] space-y-4 px-4 pb-24 pt-6">
        <Link href="/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>{t("쇼핑으로 돌아가기")}</Link>
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="text-[22px] font-bold tracking-[-0.02em] text-ios-text">{t("운영 관리자만 접근할 수 있습니다.")}</div>
          <div className="mt-2 text-[13px] leading-6 text-ios-sub">{t("현재 로그인한 계정에 관리자 권한이 없거나 로그인 상태가 아닙니다.")}</div>
        </div>
      </div>
    );
  }

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "basic", label: "기본 정보" },
    { key: "price", label: "가격·판매" },
    { key: "visual", label: "비주얼·태그" },
    { key: "media", label: "이미지·스펙" },
    { key: "detail", label: "상세 페이지" },
    { key: "signals", label: "추천 신호" },
  ];

  const activeProduct = catalog.find((p) => p.id === activeProductId) ?? null;
  const isActiveProduct = activeProduct ? (activeProduct as any).active !== false : true;
  const activeSectionMeta = {
    products: {
      title: "상품 워크스페이스",
      description: "카탈로그와 편집 폼을 한 흐름으로 정리합니다.",
    },
    orders: {
      title: "주문·배송 워크스페이스",
      description: "발송 준비, 추적, 완료 상태를 최근 주문 기준으로 관리합니다.",
    },
    refunds: {
      title: "교환·환불 워크스페이스",
      description: "클레임 접수부터 입고·최종처리까지 한 화면에서 운영합니다.",
    },
  }[activeSection];

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4 px-4 pb-24 pt-6">
      <section className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,252,0.96))] p-6 shadow-[0_22px_70px_rgba(17,41,75,0.08)]">
        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Link href="/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>{t("← 쇼핑으로")}</Link>
            <div className="mt-4 text-[30px] font-extrabold tracking-[-0.03em] text-ios-text">{t("쇼핑 운영 관리")}</div>
            <div className="mt-2 text-[13px] leading-6 text-ios-sub">{t("상품, 주문, 배송, 교환·환불 클레임을 같은 운영 기준으로 단순하게 정리합니다.")}</div>

            <div className="mt-5 rounded-[24px] border border-[#e3eaf2] bg-white/88 p-4">
              <div className="text-[12px] font-semibold text-[#17324d]">{activeSectionMeta.title}</div>
              <div className="mt-1 text-[12px] leading-6 text-ios-sub">{activeSectionMeta.description}</div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {([
                  { key: "products", label: "상품" },
                  { key: "orders", label: "주문·배송" },
                  { key: "refunds", label: "교환·환불" },
                ] as { key: AdminSection; label: string }[]).map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    data-auth-allow
                    onClick={() => setActiveSection(section.key)}
                    className={[
                      "rounded-2xl px-4 py-3 text-[12px] font-semibold transition",
                      activeSection === section.key
                        ? "bg-[#11294b] text-white"
                        : "border border-[#d7dfeb] bg-white text-[#11294b]",
                    ].join(" ")}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AdminSummaryTile label="총 주문" value={`${salesStats.totalOrders}건`} />
            <AdminSummaryTile
              label="총 매출"
              value={`${salesStats.totalSales.toLocaleString("ko-KR")}원`}
            />
            <AdminSummaryTile label="클레임 대기" value={`${salesStats.refundPending}건`} hint="교환·환불 요청" />
            <AdminSummaryTile label="배송 대기" value={`${salesStats.shippingPending}건`} hint="결제 완료 후 미발송" />
          </div>
        </div>

        {notice ? (
          <div className={[
            "mt-5 rounded-2xl px-4 py-3 text-[12.5px] leading-5",
            noticeTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
          ].join(" ")}>
            {notice}
          </div>
        ) : null}
      </section>

      {/* Main grid: product list | edit form */}
      {activeSection === "products" ? (
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">

        {/* ── Product list ── */}
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[15px] font-bold tracking-[-0.02em] text-ios-text">{t("등록된 상품")}</div>
              <div className="mt-1 text-[11.5px] text-ios-sub">활성/비활성 상태를 빠르게 바꾸고 편집 대상을 선택합니다.</div>
            </div>
            <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-2.5 py-0.5 text-[11px] font-semibold text-[#11294b]">
              {catalogLoading ? "…" : `${filteredCatalog.length}개`}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["all", "active", "inactive"] as CatalogFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                data-auth-allow
                onClick={() => setCatalogFilter(f)}
                className={[
                  "rounded-2xl py-2.5 text-[11.5px] font-semibold transition",
                  catalogFilter === f ? "bg-[#11294b] text-white" : "border border-[#d7dfeb] bg-[#f8fafc] text-[#11294b]",
                ].join(" ")}
              >
                {f === "all" ? "전체" : f === "active" ? "활성" : "비활성"}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {filteredCatalog.map((product) => {
              const isActive = (product as any).active !== false;
              const isSelected = activeProductId === product.id;
              return (
                <div
                  key={product.id}
                  className={[
                    "rounded-[20px] border p-3 transition",
                    isSelected ? "border-[#11294b] bg-[#eef4fb]" : isActive ? "border-ios-sep bg-white" : "border-[#e5e9f0] bg-[#f8fafc] opacity-60",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    data-auth-allow
                    className="w-full text-left"
                    onClick={() => selectProduct(product)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-bold text-ios-text truncate">{product.name}</div>
                      <span className={[
                        "flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        isActive ? "border-[#d7dfeb] bg-[#f4f7fb] text-[#11294b]" : "border-[#e5e9f0] bg-[#f1f3f7] text-[#92a0b4]",
                      ].join(" ")}>
                        {productChannelLabel(product)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-ios-sub">{getShopCategoryMeta(product.category).label}</div>
                  </button>
                  {/* Quick toggle */}
                  <button
                    type="button"
                    data-auth-allow
                    disabled={toggleLoading === product.id}
                    onClick={() => void toggleProductActive(product.id, isActive)}
                    className="mt-2 w-full rounded-xl border border-[#d7dfeb] py-1 text-[10.5px] font-semibold text-[#44556d] transition hover:border-[#11294b] hover:text-[#11294b] disabled:opacity-50"
                  >
                    {toggleLoading === product.id ? "처리 중…" : isActive ? "비활성화" : "활성화"}
                  </button>
                </div>
              );
            })}

            {!catalogLoading && filteredCatalog.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-ios-sub">해당하는 상품이 없습니다</div>
            ) : null}
          </div>

          <button
            type="button"
            data-auth-allow
            onClick={resetDraft}
            className={`${SECONDARY_BUTTON} mt-3 h-10 w-full text-[12px]`}
          >
            + 새 상품 등록
          </button>
        </div>

        {/* ── Edit form ── */}
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">
                {activeProductId ? draft.name || "상품 수정" : "새 상품 등록"}
              </div>
              {activeProductId ? (
                <div className={["mt-1 text-[11px] font-semibold", isActiveProduct ? "text-[#3d7fc4]" : "text-[#92a0b4]"].join(" ")}>
                  {isActiveProduct ? "● 활성" : "○ 비활성"}
                </div>
              ) : null}
            </div>
            {activeProductId ? (
              <Link href={`/shop/${encodeURIComponent(activeProductId)}`} data-auth-allow className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                상세 페이지 보기
              </Link>
            ) : null}
          </div>

          <div className="mb-4 rounded-[24px] border border-[#e3eaf2] bg-[#f8fafc] px-4 py-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-[10.5px] font-semibold text-[#7c8ea5]">상품 ID</div>
                <div className="mt-1 text-[12px] font-semibold text-[#17324d]">{draft.id.trim() || "저장 시 자동 생성"}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold text-[#7c8ea5]">카테고리</div>
                <div className="mt-1 text-[12px] font-semibold text-[#17324d]">{getShopCategoryMeta(draft.category).label}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold text-[#7c8ea5]">판매 상태</div>
                <div className="mt-1 text-[12px] font-semibold text-[#17324d]">
                  {draft.active === false ? "비활성" : draft.checkoutEnabled ? "직접 결제" : draft.externalUrl.trim() ? "외부 링크" : "준비중"}
                </div>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="mb-5 grid grid-cols-2 gap-2 border-b border-[#eef2f7] pb-4 md:grid-cols-3">
            {TABS.map(({ key, label }) => {
              const hasErr = errorsInTab(fieldErrors, key);
              return (
                <button
                  key={key}
                  type="button"
                  data-auth-allow
                  onClick={() => setActiveTab(key)}
                  className={[
                    "rounded-2xl px-3 py-2.5 text-[12px] font-semibold transition relative",
                    activeTab === key ? "bg-[#11294b] text-white" : "bg-[#f4f7fb] text-[#11294b]",
                    hasErr ? "ring-1 ring-[#e07b6a]" : "",
                  ].join(" ")}
                >
                  {label}
                  {hasErr ? <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#e07b6a]" /> : null}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === "basic" && <TabBasic draft={draft} setDraft={setDraft} errors={fieldErrors} />}
          {activeTab === "price" && <TabPrice draft={draft} setDraft={setDraft} errors={fieldErrors} />}
          {activeTab === "visual" && <TabVisual draft={draft} setDraft={setDraft} />}
          {activeTab === "media" && <TabMedia draft={draft} setDraft={setDraft} />}
          {activeTab === "detail" && <TabDetail draft={draft} setDraft={setDraft} />}
          {activeTab === "signals" && <TabSignals draft={draft} setDraft={setDraft} />}

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-[#eef2f7] pt-4">
            <button
              type="button"
              data-auth-allow
              onClick={() => void saveProduct()}
              disabled={saveLoading}
              className={`${PRIMARY_BUTTON} h-11 text-[13px]`}
            >
              {saveLoading ? "저장 중…" : "상품 저장"}
            </button>
            {activeProductId ? (
              <button
                type="button"
                data-auth-allow
                disabled={toggleLoading === activeProductId}
                onClick={() => void toggleProductActive(activeProductId, isActiveProduct)}
                className={`${isActiveProduct ? DANGER_BUTTON : SECONDARY_BUTTON} h-11 text-[13px]`}
              >
                {toggleLoading === activeProductId ? "처리 중…" : isActiveProduct ? "비활성화" : "활성화"}
              </button>
            ) : null}
            <button type="button" data-auth-allow onClick={resetDraft} disabled={saveLoading} className={`${SECONDARY_BUTTON} h-11 text-[13px]`}>
              초기화
            </button>
          </div>
        </div>
      </div>
      ) : null}

      {/* ── Claim queue ── */}
      {activeSection === "refunds" ? (
      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("교환·환불 요청 처리")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("클레임 단위로 접수·승인·입고·최종처리를 같은 흐름에서 관리합니다.")}</div>
          </div>
          <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {claimsLoading ? "…" : `${claimQueue.length}건`}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <AdminSummaryTile label="처리 대기" value={`${claimQueue.length}건`} />
          <AdminSummaryTile label="반려/보류" value={`${claims.filter((claim) => claim.status === "REJECTED").length}건`} />
          <AdminSummaryTile
            label="완료"
            value={`${claims.filter((claim) => claim.status === "REFUND_COMPLETED" || claim.status === "EXCHANGE_SHIPPED").length}건`}
          />
        </div>
        <div className="mt-4 space-y-3">
          {claimQueue.map((claim) => (
            <div key={claim.claimId} className="rounded-2xl border border-ios-sep bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-ios-text">
                    {claim.order?.productSnapshot.name ?? "주문 정보 로딩 중"}
                  </div>
                  <div className="mt-1 text-[11px] text-ios-sub">
                    {claimTypeLabel(claim.claimType)} · {claim.order?.userLabel ?? claim.userLabel ?? "unknown"} · 주문번호 {claim.orderId}
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${claimStatusClass(claim.status)}`}>
                  {claimStatusLabel(claim.status)}
                </span>
              </div>

              <div className="mt-2 text-[12px] text-ios-sub">{claim.reason || t("요청 사유 없음")}</div>
              {claim.detail ? <div className="mt-1 text-[11.5px] text-ios-sub">{claim.detail}</div> : null}
              {claim.adminNote ? <div className="mt-1 text-[11.5px] text-ios-sub">관리자 처리 사유: {claim.adminNote}</div> : null}
              <div className="mt-1 text-[11px] text-[#92a0b4]">접수일: {formatDateLabel(claim.requestedAt)}</div>
              {claim.returnTrackingNumber ? (
                <div className="mt-1 text-[11px] text-[#92a0b4]">
                  반품 운송장: {claim.returnCourier ?? "-"} {claim.returnTrackingNumber}
                </div>
              ) : null}
              {claim.exchangeTrackingNumber ? (
                <div className="mt-1 text-[11px] text-[#92a0b4]">
                  교환 운송장: {claim.exchangeCourier ?? "-"} {claim.exchangeTrackingNumber}
                </div>
              ) : null}

              {claim.order?.shipping.addressLine1 ? (
                <details className="mt-2 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-3 py-3 text-[11.5px] leading-5 text-[#44556d]">
                  <summary className="cursor-pointer list-none font-semibold text-[#17324d]">배송 정보 보기</summary>
                  <div className="mt-2">
                    {claim.order.shipping.recipientName} · {claim.order.shipping.phone}<br />
                    ({claim.order.shipping.postalCode}) {claim.order.shipping.addressLine1}
                    {claim.order.shipping.addressLine2 ? ` ${claim.order.shipping.addressLine2}` : ""}
                    {claim.order.shipping.deliveryNote ? <><br />메모: {claim.order.shipping.deliveryNote}</> : null}
                  </div>
                </details>
              ) : null}
              <div className="mt-3 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-3 py-3">
                <div className="text-[11px] font-semibold text-[#60768d]">관리자 처리 사유 (사용자에게 노출)</div>
                <textarea
                  value={claimAdminNoteDrafts[claim.claimId] ?? claim.adminNote ?? ""}
                  onChange={(event) => handleClaimAdminNoteDraftChange(claim.claimId, event.target.value)}
                  placeholder={
                    claim.status === "REQUESTED"
                      ? "승인 또는 반려 사유를 입력해 주세요."
                      : claim.status === "RETURN_SHIPPED"
                        ? "반품 입고 확인 사유를 입력해 주세요."
                        : claim.claimType === "REFUND"
                          ? "환불 처리 사유를 입력해 주세요."
                          : "교환품 발송 처리 사유를 입력해 주세요."
                  }
                  disabled={claimLoadingId === claim.claimId}
                  className="mt-2 min-h-[76px] w-full resize-none rounded-2xl border border-[#d7dfeb] bg-white px-3 py-2 text-[12px] leading-5 text-[#17324d] outline-none transition placeholder:text-[#92a0b4] focus:border-[#11294b]"
                />
                <div className="mt-1 text-[10.5px] text-[#92a0b4]">2자 이상 입력해야 처리 버튼이 동작합니다.</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {claim.status === "REQUESTED" ? (
                  <>
                    <button
                      type="button"
                      data-auth-allow
                      disabled={claimLoadingId === claim.claimId}
                      onClick={() => void handleClaimAction(claim, "approve")}
                      className={`${PRIMARY_BUTTON} h-10 text-[12px]`}
                    >
                      {claimLoadingId === claim.claimId ? "처리 중…" : "승인"}
                    </button>
                    <button
                      type="button"
                      data-auth-allow
                      disabled={claimLoadingId === claim.claimId}
                      onClick={() => void handleClaimAction(claim, "reject")}
                      className={`${SECONDARY_BUTTON} h-10 text-[12px]`}
                    >
                      반려
                    </button>
                  </>
                ) : null}

                {claim.status === "APPROVED" ? (
                  <div className="rounded-xl border border-[#d7dfeb] bg-[#f8fafc] px-3 py-2 text-[11.5px] text-ios-sub">
                    사용자 반품 발송 정보를 기다리는 중입니다.
                  </div>
                ) : null}

                {claim.status === "RETURN_SHIPPED" ? (
                  <button
                    type="button"
                    data-auth-allow
                    disabled={claimLoadingId === claim.claimId}
                    onClick={() => void handleClaimAction(claim, "mark_return_received")}
                    className={`${SECONDARY_BUTTON} h-10 text-[12px]`}
                  >
                    {claimLoadingId === claim.claimId ? "처리 중…" : "반품 입고 확인"}
                  </button>
                ) : null}

                {claim.status === "RETURN_RECEIVED" && claim.claimType === "REFUND" ? (
                  <button
                    type="button"
                    data-auth-allow
                    disabled={claimLoadingId === claim.claimId}
                    onClick={() => void handleClaimAction(claim, "complete_refund")}
                    className={`${PRIMARY_BUTTON} h-10 text-[12px]`}
                  >
                    {claimLoadingId === claim.claimId ? "처리 중…" : "환불 실행"}
                  </button>
                ) : null}

                {claim.status === "RETURN_RECEIVED" && claim.claimType === "EXCHANGE" ? (
                  <div className="w-full rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input
                        className={INPUT_CLASS}
                        placeholder="교환 택배사"
                        value={claimShippingDrafts[claim.claimId]?.courier ?? ""}
                        onChange={(event) => handleClaimShippingDraftChange(claim.claimId, "courier", event.target.value)}
                      />
                      <input
                        className={INPUT_CLASS}
                        placeholder="교환 운송장 번호"
                        value={claimShippingDrafts[claim.claimId]?.trackingNumber ?? ""}
                        onChange={(event) => handleClaimShippingDraftChange(claim.claimId, "trackingNumber", event.target.value)}
                      />
                      <button
                        type="button"
                        data-auth-allow
                        disabled={claimLoadingId === claim.claimId}
                        onClick={() => void handleClaimAction(claim, "ship_exchange")}
                        className={`${PRIMARY_BUTTON} h-12 text-[12px]`}
                      >
                        {claimLoadingId === claim.claimId ? "처리 중…" : "교환품 발송"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {!claimsLoading && claimQueue.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("현재 처리할 교환/환불 요청이 없습니다.")}</div>
          ) : null}
        </div>
      </div>
      ) : null}

      {/* ── Recent orders ── */}
      {activeSection === "orders" ? (
      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("최근 주문")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">발송 준비와 배송 추적을 최근 주문 기준으로 관리합니다.</div>
          </div>
          <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {ordersLoading ? "…" : `${orders.length}건`}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <AdminSummaryTile label="발송 대기" value={`${orderFlowStats.readyToShip}건`} />
          <AdminSummaryTile label="배송 중" value={`${orderFlowStats.shipping}건`} />
          <AdminSummaryTile label="배송 완료" value={`${orderFlowStats.delivered}건`} />
          <AdminSummaryTile label="이슈" value={`${orderFlowStats.issues}건`} />
        </div>
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
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${orderStatusClass(order.status)}`}>
                    {orderStatusLabel(order.status)}
                  </span>
                  <button
                    type="button"
                    data-auth-allow
                    onClick={() => {
                      const el = document.getElementById(`admin-order-detail-${order.orderId}`) as HTMLDetailsElement | null;
                      if (el) el.open = !el.open;
                    }}
                    className={`${SECONDARY_BUTTON} h-8 px-3 text-[11px]`}
                  >
                    상세 보기
                  </button>
                </div>
              </div>
              <details id={`admin-order-detail-${order.orderId}`} className="mt-2 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-3 py-3">
                <summary className="cursor-pointer list-none text-[11px] font-semibold text-[#17324d]">결제·배송 처리 펼치기</summary>
                {order.refund.status === "rejected" ? <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.refund.note ?? t("반려 사유 없음")}</div> : null}
                {order.status === "FAILED" && order.failMessage ? <div className="mt-2 text-[11.5px] text-[#a33a2b]">{order.failMessage}</div> : null}
                {order.paymentMethod ? (
                  <div className="mt-2 text-[11px] text-ios-sub">결제수단: {order.paymentMethod}</div>
                ) : null}
                {order.shipping.addressLine1 ? (
                  <details className="mt-2 rounded-2xl border border-[#eef2f7] bg-white px-3 py-3 text-[11px] leading-5 text-ios-sub">
                    <summary className="cursor-pointer list-none font-semibold text-[#17324d]">배송지 보기</summary>
                    <div className="mt-2">
                      {order.shipping.recipientName} · {order.shipping.phone}<br />
                      ({order.shipping.postalCode}) {order.shipping.addressLine1}
                      {order.shipping.addressLine2 ? ` ${order.shipping.addressLine2}` : ""}
                    </div>
                  </details>
                ) : null}
                {order.trackingNumber || order.courier ? (
                  <div className="mt-2 rounded-2xl border border-[#eef2f7] bg-white px-3 py-3 text-[11px] leading-5 text-[#44556d]">
                    {order.courier || "택배사 미입력"} · {order.trackingNumber || "운송장 미입력"}
                    {order.tracking?.statusLabel ? <><br />배송 조회 상태: {order.tracking.statusLabel}</> : null}
                    {order.tracking?.lastEventAt ? <><br />마지막 이벤트: {formatDateLabel(order.tracking.lastEventAt)}</> : null}
                    {order.shippedAt ? <><br />발송일: {formatDateLabel(order.shippedAt)}</> : null}
                    {order.deliveredAt ? <><br />배송완료: {formatDateLabel(order.deliveredAt)}</> : null}
                  </div>
                ) : null}
                {order.status === "PAID" ? (
                  <div className="mt-3 rounded-2xl border border-[#eef2f7] bg-white p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <select
                        className={INPUT_CLASS}
                        value={resolveDraftCarrierSelectValue(shippingDrafts[order.orderId])}
                        onChange={(e) => handleCarrierSelectionChange(order.orderId, e.target.value)}
                      >
                        <option value="">택배사 선택</option>
                        {SHOP_CARRIER_OPTIONS.map((carrier) => (
                          <option key={carrier.code} value={carrier.code}>
                            {carrier.label}
                          </option>
                        ))}
                        <option value={CUSTOM_CARRIER_VALUE}>기타 택배사 직접 입력</option>
                      </select>
                      <input
                        className={INPUT_CLASS}
                        value={shippingDrafts[order.orderId]?.trackingNumber ?? ""}
                        onChange={(e) => handleShippingDraftChange(order.orderId, "trackingNumber", e.target.value)}
                        placeholder="운송장 번호"
                      />
                      <button
                        type="button"
                        data-auth-allow
                        disabled={shippingLoadingId === order.orderId}
                        onClick={() => void handleShippingAction(order.orderId, "mark_shipped")}
                        className={`${PRIMARY_BUTTON} h-12 text-[12px]`}
                      >
                        {shippingLoadingId === order.orderId ? "처리 중…" : "배송 시작"}
                      </button>
                    </div>
                    {resolveDraftCarrierSelectValue(shippingDrafts[order.orderId]) === CUSTOM_CARRIER_VALUE ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <input
                          className={INPUT_CLASS}
                          value={shippingDrafts[order.orderId]?.courier ?? ""}
                          onChange={(e) => handleShippingDraftChange(order.orderId, "courier", e.target.value)}
                          placeholder="기타 택배사명"
                        />
                        <input
                          className={INPUT_CLASS}
                          value={shippingDrafts[order.orderId]?.carrierCode ?? ""}
                          onChange={(e) => handleShippingDraftChange(order.orderId, "carrierCode", e.target.value)}
                          placeholder="스마트택배 연동 코드 (t_code)"
                        />
                      </div>
                    ) : null}
                    <div className="mt-2 text-[11px] text-ios-sub">
                      택배사를 선택하면 스마트택배 코드가 자동으로 연결됩니다. 기타 택배사만 직접 입력이 필요합니다.
                    </div>
                  </div>
                ) : null}
                {order.status === "SHIPPED" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-auth-allow
                      disabled={shippingLoadingId === order.orderId}
                      onClick={() => void handleShippingAction(order.orderId, "sync_tracking")}
                      className={`${SECONDARY_BUTTON} h-10 text-[12px]`}
                    >
                      {shippingLoadingId === order.orderId ? "조회 중…" : "배송 조회 동기화"}
                    </button>
                  </div>
                ) : null}
              </details>
            </div>
          ))}
          {!ordersLoading && orders.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("최근 주문이 없습니다.")}</div>
          ) : null}
        </div>
      </div>
      ) : null}
    </div>
  );
}
