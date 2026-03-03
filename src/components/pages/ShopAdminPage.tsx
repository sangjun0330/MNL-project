"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import {
  createShopProductId,
  formatShopPrice,
  getShopCategoryMeta,
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
import { useI18n } from "@/lib/useI18n";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type ShopAdminOrderSummary = {
  orderId: string;
  userLabel: string;
  status: "READY" | "PAID" | "FAILED" | "CANCELED" | "REFUND_REQUESTED" | "REFUND_REJECTED" | "REFUNDED";
  amount: number;
  createdAt: string;
  approvedAt: string | null;
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
  benefitTags: string[];
  useMoments: string[];
  caution: string;
  imageUrls: string[];
  specs: ShopProductSpec[];
  priority: string;
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
    default: return status;
  }
}

function orderStatusClass(status: ShopAdminOrderSummary["status"]) {
  if (status === "PAID" || status === "REFUNDED") return "border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]";
  if (status === "FAILED" || status === "REFUND_REJECTED") return "border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]";
  return "border-[#dfe5ee] bg-[#f7f8fb] text-[#3d4d63]";
}

function formatDateLabel(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
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
    specs: [],
    priority: "4",
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
    specs: product.specs.map((s) => ({ label: s.label, value: s.value })),
    priority: String(product.priority),
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
  const addRow = () => { if (value.length < max) onChange([...value, ""]); };
  const updateRow = (i: number, v: string) => { const next = [...value]; next[i] = v; onChange(next); };
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const isValidUrl = (url: string) => {
    if (!url) return true;
    try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
  };

  return (
    <div className="space-y-2">
      {value.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <input
              className={[INPUT_CLASS, !isValidUrl(url) && url ? INPUT_ERROR : ""].join(" ")}
              value={url}
              onChange={(e) => updateRow(i, e.target.value)}
              placeholder="https://..."
            />
            {!isValidUrl(url) && url ? <p className={ERROR_CLASS}>올바른 URL을 입력해주세요 (https://로 시작)</p> : null}
          </div>
          {url && isValidUrl(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-10 w-10 rounded-xl border border-[#d7dfeb] object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : <div className="h-10 w-10 flex-shrink-0 rounded-xl border border-[#d7dfeb] bg-[#f4f7fb]" />}
          <button type="button" data-auth-allow onClick={() => removeRow(i)} className="flex-shrink-0 rounded-xl p-2 text-[#92a0b4] hover:text-[#a33a2b]">✕</button>
        </div>
      ))}
      {value.length < max ? (
        <button type="button" data-auth-allow onClick={addRow} className={`${SECONDARY_BUTTON} h-9 text-[12px]`}>+ URL 추가</button>
      ) : null}
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
          <div className={LABEL_CLASS}>가격 라벨</div>
          <input
            className={INPUT_CLASS}
            value={draft.priceLabel}
            onChange={(e) => setDraft((d) => ({ ...d, priceLabel: e.target.value }))}
            placeholder="예: 제휴 가격 연동 예정"
          />
        </label>
      </div>

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
        <div className={LABEL_CLASS}>상품 이미지 URL (최대 6개)</div>
        <UrlListInput
          value={draft.imageUrls}
          onChange={(v) => setDraft((d) => ({ ...d, imageUrls: v }))}
          max={6}
        />
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

  // Catalog (includes inactive for admin)
  const [catalog, setCatalog] = useState<(ShopProduct & { active?: boolean })[]>(SHOP_PRODUCTS);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");

  // Orders & refunds
  const [orders, setOrders] = useState<ShopAdminOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Edit state
  const [draft, setDraft] = useState<ProductDraft>(createEmptyDraft());
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("basic");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"error" | "notice">("notice");
  const [refundLoadingId, setRefundLoadingId] = useState<string | null>(null);

  const refundQueue = useMemo(() => orders.filter((o) => o.status === "REFUND_REQUESTED"), [orders]);
  const filteredCatalog = useMemo(() => {
    if (catalogFilter === "active") return catalog.filter((p) => p.active !== false);
    if (catalogFilter === "inactive") return catalog.filter((p) => p.active === false);
    return catalog;
  }, [catalog, catalogFilter]);

  const showNotice = (tone: "error" | "notice", text: string) => {
    setNoticeTone(tone);
    setNotice(text);
  };

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
        setOrdersLoading(true);

        const [catalogResult, ordersResult] = await Promise.allSettled([
          fetch("/api/admin/shop/catalog", {
            method: "GET",
            headers: { "content-type": "application/json", ...headers },
            cache: "no-store",
          }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) })),
          fetch("/api/admin/shop/orders?limit=20", {
            method: "GET",
            headers: { "content-type": "application/json", ...headers },
            cache: "no-store",
          }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) })),
        ]);

        if (!active) return;

        if (catalogResult.status === "fulfilled" && catalogResult.value.ok && Array.isArray(catalogResult.value.json?.data?.products)) {
          setCatalog(catalogResult.value.json.data.products);
        } else {
          setCatalog(SHOP_PRODUCTS);
          showNotice("error", "상품 목록을 불러오지 못했습니다.");
        }

        if (ordersResult.status === "fulfilled" && ordersResult.value.ok && Array.isArray(ordersResult.value.json?.data?.orders)) {
          setOrders(ordersResult.value.json.data.orders);
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
    return () => { active = false; };
  }, [status, user?.userId]);

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
          matchSignals: draft.matchSignals,
          detailPage: {
            headline: draft.detailHeadline,
            summary: draft.detailSummary,
            storyTitle: draft.detailStoryTitle,
            storyBody: draft.detailStoryBody,
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

  const handleRefundAction = async (orderId: string, action: "approve" | "reject") => {
    if (accessState !== "allowed") return;
    setRefundLoadingId(orderId);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/admin/shop/orders/${encodeURIComponent(orderId)}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          action,
          note: action === "reject" ? "운영 기준상 현재 환불을 진행할 수 없습니다." : "환불 승인 완료",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error();
      const nextOrder = json.data.order as ShopAdminOrderSummary;
      setOrders((cur) => [nextOrder, ...cur.filter((o) => o.orderId !== nextOrder.orderId)].slice(0, 20));
      showNotice("notice", action === "approve" ? "환불을 승인했습니다." : "환불 요청을 반려했습니다.");
    } catch {
      showNotice("error", "환불 처리에 실패했습니다.");
    } finally {
      setRefundLoadingId(null);
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

  return (
    <div className="mx-auto w-full max-w-[960px] space-y-4 px-4 pb-24 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/shop" data-auth-allow className={`${SECONDARY_BUTTON} h-9 text-[12px]`}>{t("← 쇼핑으로")}</Link>
          <div className="mt-3 text-[28px] font-extrabold tracking-[-0.02em] text-ios-text">{t("쇼핑 운영 관리")}</div>
          <div className="mt-1 text-[12.5px] text-ios-sub">{t("상품 등록 · 주문 확인 · 환불 처리")}</div>
        </div>
      </div>

      {/* Global notice */}
      {notice ? (
        <div className={[
          "rounded-2xl px-4 py-3 text-[12.5px] leading-5",
          noticeTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
        ].join(" ")}>
          {notice}
        </div>
      ) : null}

      {/* Main grid: product list | edit form */}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">

        {/* ── Product list ── */}
        <div className="rounded-[28px] border border-ios-sep bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[15px] font-bold tracking-[-0.02em] text-ios-text">{t("등록된 상품")}</div>
            <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-2.5 py-0.5 text-[11px] font-semibold text-[#11294b]">
              {catalogLoading ? "…" : `${catalog.length}개`}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="mt-3 flex gap-1">
            {(["all", "active", "inactive"] as CatalogFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                data-auth-allow
                onClick={() => setCatalogFilter(f)}
                className={[
                  "flex-1 rounded-xl py-1.5 text-[11px] font-semibold transition",
                  catalogFilter === f ? "bg-[#11294b] text-white" : "bg-[#f4f7fb] text-[#11294b]",
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
                        {isActive ? (product.checkoutEnabled && product.priceKrw ? "직접 결제" : product.externalUrl ? "외부 링크" : "준비중") : "비활성"}
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

          {/* Tab bar */}
          <div className="mb-5 flex flex-wrap gap-1 border-b border-[#eef2f7] pb-4">
            {TABS.map(({ key, label }) => {
              const hasErr = errorsInTab(fieldErrors, key);
              return (
                <button
                  key={key}
                  type="button"
                  data-auth-allow
                  onClick={() => setActiveTab(key)}
                  className={[
                    "rounded-xl px-3 py-1.5 text-[12px] font-semibold transition relative",
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

      {/* ── Refund queue ── */}
      <div className="rounded-[28px] border border-ios-sep bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">{t("환불 요청 처리")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">{t("환불 요청만 먼저 표시됩니다.")}</div>
          </div>
          <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
            {ordersLoading ? "…" : `${refundQueue.length}건`}
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
              {order.shipping.addressLine1 ? (
                <div className="mt-2 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-3 py-3 text-[11.5px] leading-5 text-[#44556d]">
                  {order.shipping.recipientName} · {order.shipping.phone}<br />
                  ({order.shipping.postalCode}) {order.shipping.addressLine1}
                  {order.shipping.addressLine2 ? ` ${order.shipping.addressLine2}` : ""}
                  {order.shipping.deliveryNote ? <><br />메모: {order.shipping.deliveryNote}</> : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-auth-allow
                  disabled={refundLoadingId === order.orderId}
                  onClick={() => void handleRefundAction(order.orderId, "approve")}
                  className={`${PRIMARY_BUTTON} h-10 text-[12px]`}
                >
                  {refundLoadingId === order.orderId ? "처리 중…" : "환불 승인"}
                </button>
                <button
                  type="button"
                  data-auth-allow
                  disabled={refundLoadingId === order.orderId}
                  onClick={() => void handleRefundAction(order.orderId, "reject")}
                  className={`${SECONDARY_BUTTON} h-10 text-[12px]`}
                >
                  반려
                </button>
              </div>
            </div>
          ))}
          {!ordersLoading && refundQueue.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("현재 처리할 환불 요청이 없습니다.")}</div>
          ) : null}
        </div>
      </div>

      {/* ── Recent orders ── */}
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
              {order.shipping.addressLine1 ? (
                <div className="mt-2 text-[11px] leading-5 text-ios-sub">
                  {order.shipping.recipientName} · {order.shipping.phone}<br />
                  ({order.shipping.postalCode}) {order.shipping.addressLine1}
                  {order.shipping.addressLine2 ? ` ${order.shipping.addressLine2}` : ""}
                </div>
              ) : null}
            </div>
          ))}
          {!ordersLoading && orders.length === 0 ? (
            <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[12.5px] text-ios-sub">{t("최근 주문이 없습니다.")}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
