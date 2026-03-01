import type { ISODate } from "@/lib/date";
import { todayISO } from "@/lib/date";
import type { AppSettings, BioInputs } from "@/lib/model";
import { menstrualContextForDate } from "@/lib/menstrual";
import type { Shift } from "@/lib/types";

export type ShopCategoryKey = "all" | "sleep" | "hydration" | "comfort" | "warmth" | "nutrition" | "gear";

export type ShopSignalKey =
  | "baseline_recovery"
  | "night_shift"
  | "long_shift"
  | "sleep_low"
  | "stress_high"
  | "hydration_needed"
  | "period_active"
  | "pms_window"
  | "muscle_tension"
  | "eye_fatigue";

export type ShopSignal = {
  key: ShopSignalKey;
  label: string;
  reason: string;
  weight: number;
};

export type ShopVisualPreset = {
  key: string;
  label: string;
  className: string;
};

export type ShopDetailPage = {
  headline: string;
  summary: string;
  storyTitle: string;
  storyBody: string;
  featureTitle: string;
  featureItems: string[];
  routineTitle: string;
  routineItems: string[];
  noticeTitle: string;
  noticeBody: string;
};

export type ShopProductSpec = {
  label: string;
  value: string;
};

export type ShopProduct = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: Exclude<ShopCategoryKey, "all">;
  priceKrw: number | null;
  priceLabel: string;
  checkoutEnabled: boolean;
  partnerLabel: string;
  partnerStatus: string;
  visualLabel: string;
  visualClass: string;
  matchSignals: ShopSignalKey[];
  benefitTags: string[];
  useMoments: string[];
  caution: string;
  priority: number;
  imageUrls: string[];
  specs: ShopProductSpec[];
  detailPage: ShopDetailPage;
  externalUrl?: string;
};

export type ShopRecommendation = {
  product: ShopProduct;
  score: number;
  matchedSignals: ShopSignal[];
  primaryReason: string;
  secondaryReason: string;
};

export type ShopRecommendationState = {
  selectedDate: ISODate;
  signals: ShopSignal[];
  recommendations: ShopRecommendation[];
  focusSummary: string;
};

type CategoryMeta = {
  key: ShopCategoryKey;
  label: string;
  subtitle: string;
};

type SignalMeta = Omit<ShopSignal, "weight">;

const SIGNAL_META: Record<ShopSignalKey, SignalMeta> = {
  baseline_recovery: {
    key: "baseline_recovery",
    label: "기본 회복 루틴",
    reason: "오늘 상태와 무관하게 매일 부담 없이 쓰는 기본 회복 아이템이에요.",
  },
  night_shift: {
    key: "night_shift",
    label: "야간 근무 대비",
    reason: "오늘 근무가 야간이라 수면 리듬 보호와 각성 피로 관리가 중요해요.",
  },
  long_shift: {
    key: "long_shift",
    label: "긴 근무 대비",
    reason: "오늘 근무가 있는 날이라 오래 쓰기 편한 회복 보조 아이템을 먼저 봐야 해요.",
  },
  sleep_low: {
    key: "sleep_low",
    label: "수면 보완",
    reason: "오늘 수면 시간이 낮아 회복 루틴을 더 부드럽게 잡아주는 쪽이 좋아요.",
  },
  stress_high: {
    key: "stress_high",
    label: "긴장 완화",
    reason: "스트레스 입력이 높아 바로 쉬는 감각을 주는 아이템 우선순위가 올라가요.",
  },
  hydration_needed: {
    key: "hydration_needed",
    label: "수분 보강",
    reason: "카페인 섭취가 높아 수분 보강과 루틴 보조가 같이 필요해요.",
  },
  period_active: {
    key: "period_active",
    label: "생리 기간 보조",
    reason: "생리 기간 또는 통증 강도가 있어 온열과 부담 완화 중심으로 보는 편이 좋아요.",
  },
  pms_window: {
    key: "pms_window",
    label: "생리 전 컨디션 관리",
    reason: "생리 직전 구간이라 컨디션 변동을 줄여주는 편안한 아이템이 맞아요.",
  },
  muscle_tension: {
    key: "muscle_tension",
    label: "근육 긴장 완화",
    reason: "활동량 또는 근무 이벤트 입력이 있어 목·어깨·다리 부담을 낮추는 쪽이 좋아요.",
  },
  eye_fatigue: {
    key: "eye_fatigue",
    label: "눈 피로 관리",
    reason: "야간/미들/이브닝 근무 흐름이라 눈 피로를 줄이는 루틴이 잘 맞아요.",
  },
};

export const SHOP_SIGNAL_OPTIONS: SignalMeta[] = Object.values(SIGNAL_META);

export const SHOP_CATEGORIES: CategoryMeta[] = [
  { key: "all", label: "전체", subtitle: "오늘 추천부터" },
  { key: "sleep", label: "수면", subtitle: "야간 전후 루틴" },
  { key: "hydration", label: "수분", subtitle: "카페인 밸런스" },
  { key: "comfort", label: "피로완화", subtitle: "목·눈·긴장" },
  { key: "warmth", label: "온열", subtitle: "복부·순환" },
  { key: "nutrition", label: "간편영양", subtitle: "근무 중 보충" },
  { key: "gear", label: "근무용품", subtitle: "오래 쓰는 편의" },
];

export const SHOP_VISUAL_PRESETS: ShopVisualPreset[] = [
  { key: "midnight", label: "딥 네이비", className: "bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 text-white" },
  { key: "ocean", label: "오션 블루", className: "bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-500 text-white" },
  { key: "violet", label: "인디고", className: "bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-400 text-white" },
  { key: "sunset", label: "웜 오렌지", className: "bg-gradient-to-br from-rose-500 via-orange-400 to-amber-300 text-white" },
  { key: "lime", label: "라임", className: "bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 text-slate-900" },
  { key: "stone", label: "스톤", className: "bg-gradient-to-br from-stone-800 via-stone-600 to-stone-400 text-white" },
  { key: "deepblue", label: "딥 블루", className: "bg-gradient-to-br from-sky-950 via-blue-900 to-cyan-700 text-white" },
  { key: "teal", label: "틸 그린", className: "bg-gradient-to-br from-teal-700 via-emerald-600 to-lime-500 text-white" },
];

const RAW_SHOP_PRODUCTS = [
  {
    id: "sleep-eye-mask",
    name: "온열 아이 마스크",
    subtitle: "야간 후 눈 피로와 잠들기 전 루틴을 가볍게 정리하는 기본 아이템",
    description: "눈 피로 완화와 취침 전 루틴 정리를 같이 엮는 가장 기본적인 회복 카테고리입니다.",
    category: "sleep",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "수면 파트너 연동 준비중",
    partnerStatus: "제휴 검수 전 단계",
    visualLabel: "Sleep Reset",
    visualClass: "bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 text-white",
    matchSignals: ["baseline_recovery", "sleep_low", "night_shift", "eye_fatigue", "stress_high"],
    benefitTags: ["수면 루틴", "눈 피로", "야간 후 정리"],
    useMoments: ["야간 근무 후 바로 쉬기 전", "잠들기 20~30분 전", "눈이 뻐근한 날 짧게"],
    caution: "의료기기 대체가 아니라 편안한 루틴 보조용으로만 안내합니다.",
    priority: 6,
  },
  {
    id: "daily-tumbler",
    name: "보온 텀블러",
    subtitle: "근무 중 수분 루틴을 끊기지 않게 유지하는 데 초점을 둔 기본 장비",
    description: "카페인 섭취가 있는 날에도 물 섭취 루틴을 유지하기 쉽게 돕는 상시형 아이템입니다.",
    category: "hydration",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "리빙 파트너 연동 준비중",
    partnerStatus: "상품 피드 등록 준비중",
    visualLabel: "Hydration Flow",
    visualClass: "bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-500 text-white",
    matchSignals: ["baseline_recovery", "hydration_needed", "long_shift", "night_shift"],
    benefitTags: ["수분 루틴", "긴 근무", "카페인 밸런스"],
    useMoments: ["근무 시작 전 준비", "긴 근무 중 자리 이동", "카페인 섭취 후 물 보강"],
    caution: "가격과 구성은 판매처 기준으로 최종 확인이 필요합니다.",
    priority: 5,
  },
  {
    id: "compression-socks",
    name: "압박 양말",
    subtitle: "오래 서 있는 날 다리 부담을 줄이는 쪽에 맞춘 근무 보조 아이템",
    description: "장시간 서 있거나 많이 걷는 날 다리 부담을 낮추는 보조형 카테고리입니다.",
    category: "gear",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "근무용품 파트너 연동 준비중",
    partnerStatus: "제휴 협의중",
    visualLabel: "Shift Support",
    visualClass: "bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-400 text-white",
    matchSignals: ["baseline_recovery", "long_shift", "muscle_tension"],
    benefitTags: ["다리 부담", "긴 근무", "근무 편의"],
    useMoments: ["연속 근무 첫날", "오래 서 있는 날", "퇴근 후 붓기 관리 루틴"],
    caution: "압박 강도와 착용 시간은 개인 상태에 맞춰 조절해야 합니다.",
    priority: 4,
  },
  {
    id: "warm-pad",
    name: "복부 온열 패드",
    subtitle: "생리 기간이나 직전 컨디션 변동을 부드럽게 넘기도록 돕는 온열 루틴용",
    description: "복부와 하체의 부담이 있는 날에 온열 루틴으로 편안함을 더하는 카테고리입니다.",
    category: "warmth",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "웰니스 파트너 연동 준비중",
    partnerStatus: "제휴 검수 전 단계",
    visualLabel: "Warm Comfort",
    visualClass: "bg-gradient-to-br from-rose-500 via-orange-400 to-amber-300 text-white",
    matchSignals: ["baseline_recovery", "period_active", "pms_window", "muscle_tension"],
    benefitTags: ["온열", "생리 기간", "긴장 완화"],
    useMoments: ["생리 첫날", "PMS 구간", "퇴근 후 바로 쉬는 시간"],
    caution: "온열 강도와 사용 시간은 피부 상태에 맞춰 조절해야 합니다.",
    priority: 7,
  },
  {
    id: "protein-snack",
    name: "간편 단백질 스낵",
    subtitle: "식사 텀이 긴 날 빠르게 에너지를 보충하는 쪽에 맞춘 간편 루틴",
    description: "식사 간격이 길어질 때 빠르게 보충하기 쉬운 휴대형 카테고리입니다.",
    category: "nutrition",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "뉴트리션 파트너 연동 준비중",
    partnerStatus: "상품 피드 등록 준비중",
    visualLabel: "Quick Fuel",
    visualClass: "bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 text-slate-900",
    matchSignals: ["baseline_recovery", "long_shift", "sleep_low", "night_shift"],
    benefitTags: ["간편 보충", "긴 근무", "빠른 섭취"],
    useMoments: ["식사 텀이 긴 날", "야간 전 간단 보충", "브레이크가 짧은 근무일"],
    caution: "영양 정보와 알레르기 유발 성분은 판매처 상세를 확인해야 합니다.",
    priority: 3,
  },
  {
    id: "neck-pad",
    name: "목·어깨 온열 쿠션",
    subtitle: "긴장감이 높은 날 목과 어깨 부담을 잠깐씩 풀어주는 회복 보조용",
    description: "근육 긴장과 피로가 겹치는 날 잠깐 쉬는 시간을 회복 루틴으로 바꾸는 카테고리입니다.",
    category: "comfort",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "컴포트 파트너 연동 준비중",
    partnerStatus: "제휴 협의중",
    visualLabel: "Ease Pressure",
    visualClass: "bg-gradient-to-br from-stone-800 via-stone-600 to-stone-400 text-white",
    matchSignals: ["baseline_recovery", "stress_high", "muscle_tension", "long_shift"],
    benefitTags: ["목·어깨", "긴장 완화", "퇴근 후 회복"],
    useMoments: ["퇴근 후 10분 루틴", "스트레스가 높은 날", "목과 어깨가 굳는 날"],
    caution: "심한 통증이 있으면 일반 생활용품보다 전문 진료 판단이 우선입니다.",
    priority: 5,
  },
  {
    id: "blue-light-guard",
    name: "블루라이트 차단 안경",
    subtitle: "야간 또는 저녁 근무 후 눈 자극을 줄이는 데 초점을 둔 가벼운 보조용",
    description: "밝은 조명과 화면 자극이 많은 흐름에서 눈 부담을 덜어주는 보조형 카테고리입니다.",
    category: "comfort",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "아이케어 파트너 연동 준비중",
    partnerStatus: "제휴 검수 전 단계",
    visualLabel: "Eye Guard",
    visualClass: "bg-gradient-to-br from-sky-950 via-blue-900 to-cyan-700 text-white",
    matchSignals: ["baseline_recovery", "night_shift", "eye_fatigue"],
    benefitTags: ["눈 피로", "야간 루틴", "조명 자극 완화"],
    useMoments: ["야간 근무 전", "퇴근 후 화면을 볼 때", "눈 피로가 누적된 날"],
    caution: "시력 보정이 필요한 경우 전문 안경 렌즈 기준으로 별도 확인이 필요합니다.",
    priority: 4,
  },
  {
    id: "caffeine-free-tea",
    name: "무카페인 릴렉스 티",
    subtitle: "긴장도가 높거나 수면이 흔들리는 날 밤 루틴을 정리하는 데 맞춘 선택지",
    description: "밤 루틴을 부드럽게 정리하면서 심리적으로 마무리 신호를 주는 카테고리입니다.",
    category: "sleep",
    priceKrw: null,
    priceLabel: "제휴 가격 연동 예정",
    checkoutEnabled: false,
    partnerLabel: "티 파트너 연동 준비중",
    partnerStatus: "상품 피드 등록 준비중",
    visualLabel: "Calm Evening",
    visualClass: "bg-gradient-to-br from-teal-700 via-emerald-600 to-lime-500 text-white",
    matchSignals: ["baseline_recovery", "sleep_low", "stress_high", "pms_window"],
    benefitTags: ["취침 전 루틴", "무카페인", "긴장 완화"],
    useMoments: ["잠들기 전 1시간", "긴장도가 높은 저녁", "PMS 구간의 밤 루틴"],
    caution: "식품 선택은 개인 기호와 성분 확인 기준으로 결정해야 합니다.",
    priority: 4,
  },
] as const;

export const SHOP_PRODUCTS: ShopProduct[] = normalizeShopCatalogProducts(RAW_SHOP_PRODUCTS);

function bumpSignal(map: Map<ShopSignalKey, ShopSignal>, key: ShopSignalKey, weight: number) {
  const meta = SIGNAL_META[key];
  const prev = map.get(key);
  if (prev) {
    prev.weight += weight;
    return;
  }
  map.set(key, { ...meta, weight });
}

function clampText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.slice(0, maxLength);
}

function sanitizeStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  const next = value
    .map((item) => clampText(item, maxLength))
    .filter(Boolean);
  return Array.from(new Set(next)).slice(0, maxItems);
}

function sanitizeUrlList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  for (const item of value) {
    const raw = String(item ?? "").trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      const normalized = url.toString().slice(0, 500);
      if (!next.includes(normalized)) next.push(normalized);
      if (next.length >= maxItems) break;
    } catch {
      continue;
    }
  }
  return next;
}

function normalizeShopSpecs(value: unknown, maxItems = 8): ShopProductSpec[] {
  if (!Array.isArray(value)) return [];
  const next: ShopProductSpec[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const label = clampText(source.label, 40);
    const specValue = clampText(source.value, 120);
    if (!label || !specValue) continue;
    next.push({ label, value: specValue });
    if (next.length >= maxItems) break;
  }
  return next;
}

function buildDefaultDetailPage(args: {
  name: string;
  subtitle: string;
  description: string;
  benefitTags: string[];
  useMoments: string[];
  caution: string;
  visualLabel: string;
}): ShopDetailPage {
  const fallbackFeature = args.benefitTags.length > 0 ? args.benefitTags : [args.subtitle || `${args.name}에 맞는 기본 포인트`];
  const fallbackRoutine = args.useMoments.length > 0 ? args.useMoments : [args.subtitle || `${args.name}을(를) 가볍게 보는 상황`];
  const safeDescription = args.description || `${args.name}에 대한 기본 상세 설명입니다.`;
  const safeCaution = args.caution || "구매 전 구성과 사용 안내를 판매처 기준으로 다시 확인해 주세요.";

  return {
    headline: args.visualLabel || args.name,
    summary: safeDescription,
    storyTitle: "이 제품은",
    storyBody: safeDescription,
    featureTitle: "핵심 포인트",
    featureItems: fallbackFeature.slice(0, 6),
    routineTitle: "이럴 때 보기 좋아요",
    routineItems: fallbackRoutine.slice(0, 6),
    noticeTitle: "구매 전 안내",
    noticeBody: safeCaution,
  };
}

function normalizeShopDetailPage(
  value: unknown,
  defaults: {
    name: string;
    subtitle: string;
    description: string;
    benefitTags: string[];
    useMoments: string[];
    caution: string;
    visualLabel: string;
  }
): ShopDetailPage {
  const fallback = buildDefaultDetailPage(defaults);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;

  return {
    headline: clampText(source.headline, 80) || fallback.headline,
    summary: clampText(source.summary, 220) || fallback.summary,
    storyTitle: clampText(source.storyTitle, 40) || fallback.storyTitle,
    storyBody: clampText(source.storyBody, 420) || fallback.storyBody,
    featureTitle: clampText(source.featureTitle, 40) || fallback.featureTitle,
    featureItems: sanitizeStringList(source.featureItems, 6, 48).slice(0, 6).length > 0
      ? sanitizeStringList(source.featureItems, 6, 48).slice(0, 6)
      : fallback.featureItems,
    routineTitle: clampText(source.routineTitle, 40) || fallback.routineTitle,
    routineItems: sanitizeStringList(source.routineItems, 6, 72).slice(0, 6).length > 0
      ? sanitizeStringList(source.routineItems, 6, 72).slice(0, 6)
      : fallback.routineItems,
    noticeTitle: clampText(source.noticeTitle, 40) || fallback.noticeTitle,
    noticeBody: clampText(source.noticeBody, 240) || fallback.noticeBody,
  };
}

function describeSignalCombination(signals: ShopSignal[]) {
  const [first, second] = signals;
  if (!first) {
    return "오늘 상태가 아직 가볍거나 입력이 적어서, 매일 쓰기 쉬운 기본 회복 아이템부터 보여줘요.";
  }
  if (!second) {
    return `${first.label} 흐름이 보여서, ${first.reason}`;
  }
  return `${first.label}과 ${second.label}이 함께 보여서, 오늘은 가볍게 바로 쓸 수 있는 회복 보조 아이템을 먼저 배치했어요.`;
}

function buildProductReason(product: ShopProduct, matchedSignals: ShopSignal[]) {
  const [first, second] = matchedSignals;
  if (!first) {
    return {
      primary: SIGNAL_META.baseline_recovery.reason,
      secondary: `${product.name}은(는) 기본 회복 루틴에 부담 없이 넣기 쉬운 카테고리입니다.`,
    };
  }
  if (!second) {
    return {
      primary: first.reason,
      secondary: `${first.label} 기준으로 ${product.name} 카테고리를 먼저 보는 편이 잘 맞습니다.`,
    };
  }
  return {
    primary: `${first.reason} ${second.reason}`,
    secondary: `${first.label}과 ${second.label}이 겹쳐 ${product.name} 우선순위가 올라갔습니다.`,
  };
}

type SignalInput = {
  selected?: ISODate | null;
  schedule: Record<ISODate, Shift | undefined>;
  bio: Record<ISODate, BioInputs | undefined>;
  settings: AppSettings;
};

export function getShopCategoryMeta(key: ShopCategoryKey) {
  return SHOP_CATEGORIES.find((item) => item.key === key) ?? SHOP_CATEGORIES[0];
}

export function getShopProductById(id: string) {
  return SHOP_PRODUCTS.find((product) => product.id === id) ?? null;
}

export function getShopSignalMeta(key: ShopSignalKey) {
  return SIGNAL_META[key];
}

export function isShopCategoryKey(value: string): value is ShopCategoryKey {
  return SHOP_CATEGORIES.some((item) => item.key === value);
}

export function isShopSignalKey(value: string): value is ShopSignalKey {
  return Object.prototype.hasOwnProperty.call(SIGNAL_META, value);
}

export function isShopVisualPresetKey(value: string) {
  return SHOP_VISUAL_PRESETS.some((item) => item.key === value);
}

export function getShopVisualPreset(key: string | null | undefined) {
  return SHOP_VISUAL_PRESETS.find((item) => item.key === key) ?? SHOP_VISUAL_PRESETS[0];
}

export function createShopProductId(name: string) {
  const ascii = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  if (ascii) return ascii.slice(0, 48);
  return `shop-${Date.now().toString(36)}`;
}

export function normalizeShopProduct(raw: unknown): ShopProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;

  const name = clampText(source.name, 80);
  const subtitle = clampText(source.subtitle, 180);
  const description = clampText(source.description, 280);
  const rawCategory = String(source.category ?? "");
  const category = isShopCategoryKey(rawCategory) && rawCategory !== "all" ? rawCategory : null;
  const visualPresetKey = String(source.visualPresetKey ?? "");
  const visualPreset = getShopVisualPreset(visualPresetKey);
  const matchSignals = sanitizeStringList(source.matchSignals, 8, 32).filter(isShopSignalKey);

  if (!name || !subtitle || !description || !category) return null;

  const id = createShopProductId(String(source.id ?? name));
  const visualLabel = clampText(source.visualLabel, 40) || name;
  const rawPriceKrw = Number(source.priceKrw);
  const priceKrw = Number.isFinite(rawPriceKrw) && rawPriceKrw > 0 ? Math.round(rawPriceKrw) : null;
  const checkoutEnabled = Boolean(source.checkoutEnabled) && priceKrw != null;
  const benefitTags = sanitizeStringList(source.benefitTags, 6, 24);
  const useMoments = sanitizeStringList(source.useMoments, 5, 60);
  const caution = clampText(source.caution, 180) || "의학적 치료 대체가 아니라 생활 루틴 보조용으로만 안내합니다.";
  const imageUrls = sanitizeUrlList(source.imageUrls, 6);
  const specs = normalizeShopSpecs(source.specs, 8);
  const detailPage = normalizeShopDetailPage(source.detailPage, {
    name,
    subtitle,
    description,
    benefitTags,
    useMoments,
    caution,
    visualLabel,
  });

  return {
    id,
    name,
    subtitle,
    description,
    category,
    priceKrw,
    priceLabel: clampText(source.priceLabel, 60) || "제휴 가격 연동 예정",
    checkoutEnabled,
    partnerLabel: clampText(source.partnerLabel, 60) || "제휴 파트너 연동 준비중",
    partnerStatus: clampText(source.partnerStatus, 80) || "제휴 검수 전 단계",
    visualLabel,
    visualClass: clampText(source.visualClass, 160) || visualPreset.className,
    matchSignals: matchSignals.length > 0 ? matchSignals : ["baseline_recovery"],
    benefitTags,
    useMoments,
    caution,
    priority: Math.max(1, Math.min(9, Number(source.priority) || 4)),
    imageUrls,
    specs,
    detailPage,
    externalUrl: (() => {
      const value = String(source.externalUrl ?? "").trim();
      if (!value) return undefined;
      try {
        const url = new URL(value);
        if (url.protocol === "https:" || url.protocol === "http:") return url.toString().slice(0, 400);
      } catch {
        return undefined;
      }
      return undefined;
    })(),
  };
}

export function normalizeShopCatalogProducts(raw: unknown): ShopProduct[] {
  if (!Array.isArray(raw)) return [];
  const next: ShopProduct[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const product = normalizeShopProduct(item);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    next.push(product);
  }
  return next;
}

export function upsertShopProductInCatalog(catalog: ShopProduct[], product: ShopProduct) {
  const next = catalog.filter((item) => item.id !== product.id);
  return [product, ...next].slice(0, 80);
}

export function formatShopPrice(product: ShopProduct) {
  if (product.priceKrw != null && product.priceKrw > 0) {
    return `${Math.round(product.priceKrw).toLocaleString("ko-KR")}원`;
  }
  return product.priceLabel;
}

export function deriveShopSignals(input: SignalInput): { selectedDate: ISODate; signals: ShopSignal[] } {
  const selectedDate = input.selected ?? todayISO();
  const bio = input.bio[selectedDate];
  const shift = input.schedule[selectedDate];
  const signalMap = new Map<ShopSignalKey, ShopSignal>();

  bumpSignal(signalMap, "baseline_recovery", 1);

  if (shift === "N") {
    bumpSignal(signalMap, "night_shift", 4);
    bumpSignal(signalMap, "eye_fatigue", 2);
  }

  if (shift === "E" || shift === "M") {
    bumpSignal(signalMap, "eye_fatigue", 1);
  }

  if (shift && shift !== "OFF" && shift !== "VAC") {
    bumpSignal(signalMap, "long_shift", 2);
  }

  const sleepHours = Number(bio?.sleepHours ?? Number.NaN);
  if (Number.isFinite(sleepHours)) {
    if (sleepHours < 6) bumpSignal(signalMap, "sleep_low", 4);
    else if (sleepHours < 7) bumpSignal(signalMap, "sleep_low", 2);
  }

  const stress = Number(bio?.stress ?? Number.NaN);
  if (Number.isFinite(stress) && stress >= 2) {
    bumpSignal(signalMap, "stress_high", stress >= 3 ? 4 : 3);
  }

  const caffeine = Number(bio?.caffeineMg ?? Number.NaN);
  if (Number.isFinite(caffeine) && caffeine >= 180) {
    bumpSignal(signalMap, "hydration_needed", caffeine >= 300 ? 4 : 3);
  }

  const activity = Number(bio?.activity ?? Number.NaN);
  if ((Number.isFinite(activity) && activity >= 2) || (bio?.workEventTags?.length ?? 0) > 0 || Boolean(bio?.workEventNote)) {
    bumpSignal(signalMap, "muscle_tension", 3);
  }

  const symptomSeverity = Number(bio?.symptomSeverity ?? Number.NaN);
  const menstrual = menstrualContextForDate(selectedDate, input.settings.menstrual);
  if (menstrual.phase === "period") {
    bumpSignal(signalMap, "period_active", 4);
  } else if (menstrual.phase === "pms") {
    bumpSignal(signalMap, "pms_window", 3);
  }
  if (Number.isFinite(symptomSeverity) && symptomSeverity >= 2) {
    bumpSignal(signalMap, "period_active", 2);
    bumpSignal(signalMap, "muscle_tension", 1);
  }

  const signals = Array.from(signalMap.values()).sort((a, b) => b.weight - a.weight);
  return { selectedDate, signals };
}

export function buildShopRecommendations(args: {
  selected?: ISODate | null;
  schedule: Record<ISODate, Shift | undefined>;
  bio: Record<ISODate, BioInputs | undefined>;
  settings: AppSettings;
  category?: ShopCategoryKey;
  products?: ShopProduct[];
}): ShopRecommendationState {
  const { selectedDate, signals } = deriveShopSignals(args);
  const activeCategory = args.category ?? "all";
  const catalog = (args.products && args.products.length > 0 ? args.products : SHOP_PRODUCTS).slice(0, 80);
  const recommendations = catalog.filter((product) => activeCategory === "all" || product.category === activeCategory)
    .map((product) => {
      const matchedSignals = signals.filter((signal) => product.matchSignals.includes(signal.key));
      const signalScore = matchedSignals.reduce((sum, signal) => sum + signal.weight, 0);
      const score = signalScore + product.priority;
      const reason = buildProductReason(product, matchedSignals);
      return {
        product,
        score,
        matchedSignals,
        primaryReason: reason.primary,
        secondaryReason: reason.secondary,
      };
    })
    .sort((a, b) => b.score - a.score || b.product.priority - a.product.priority || a.product.name.localeCompare(b.product.name, "ko"));

  return {
    selectedDate,
    signals,
    recommendations,
    focusSummary: describeSignalCombination(signals),
  };
}
