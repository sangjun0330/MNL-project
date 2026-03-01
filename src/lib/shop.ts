import { todayISO } from "@/lib/date";
import type { ISODate } from "@/lib/date";
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

export type ShopProduct = {
  id: string;
  name: string;
  subtitle: string;
  category: Exclude<ShopCategoryKey, "all">;
  priceLabel: string;
  partnerLabel: string;
  visualLabel: string;
  visualClass: string;
  matchSignals: ShopSignalKey[];
  priority: number;
  externalUrl?: string;
};

export type ShopRecommendation = {
  product: ShopProduct;
  score: number;
  matchedSignals: ShopSignal[];
  primaryReason: string;
};

type CategoryMeta = {
  key: ShopCategoryKey;
  label: string;
  subtitle: string;
};

const SIGNAL_META: Record<ShopSignalKey, Omit<ShopSignal, "weight">> = {
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

export const SHOP_CATEGORIES: CategoryMeta[] = [
  { key: "all", label: "전체", subtitle: "오늘 추천부터" },
  { key: "sleep", label: "수면", subtitle: "야간 전후 루틴" },
  { key: "hydration", label: "수분", subtitle: "카페인 밸런스" },
  { key: "comfort", label: "피로완화", subtitle: "목·눈·긴장" },
  { key: "warmth", label: "온열", subtitle: "복부·순환" },
  { key: "nutrition", label: "간편영양", subtitle: "근무 중 보충" },
  { key: "gear", label: "근무용품", subtitle: "오래 쓰는 편의" },
];

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: "sleep-eye-mask",
    name: "온열 아이 마스크",
    subtitle: "야간 후 눈 피로와 잠들기 전 루틴을 가볍게 정리하는 기본 아이템",
    category: "sleep",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "수면 파트너 연동 준비중",
    visualLabel: "Sleep Reset",
    visualClass: "bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 text-white",
    matchSignals: ["baseline_recovery", "sleep_low", "night_shift", "eye_fatigue", "stress_high"],
    priority: 6,
  },
  {
    id: "daily-tumbler",
    name: "보온 텀블러",
    subtitle: "근무 중 수분 루틴을 끊기지 않게 유지하는 데 초점을 둔 기본 장비",
    category: "hydration",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "리빙 파트너 연동 준비중",
    visualLabel: "Hydration Flow",
    visualClass: "bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-500 text-white",
    matchSignals: ["baseline_recovery", "hydration_needed", "long_shift", "night_shift"],
    priority: 5,
  },
  {
    id: "compression-socks",
    name: "압박 양말",
    subtitle: "오래 서 있는 날 다리 부담을 줄이는 쪽에 맞춘 근무 보조 아이템",
    category: "gear",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "근무용품 파트너 연동 준비중",
    visualLabel: "Shift Support",
    visualClass: "bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-400 text-white",
    matchSignals: ["baseline_recovery", "long_shift", "muscle_tension"],
    priority: 4,
  },
  {
    id: "warm-pad",
    name: "복부 온열 패드",
    subtitle: "생리 기간이나 직전 컨디션 변동을 부드럽게 넘기도록 돕는 온열 루틴용",
    category: "warmth",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "웰니스 파트너 연동 준비중",
    visualLabel: "Warm Comfort",
    visualClass: "bg-gradient-to-br from-rose-500 via-orange-400 to-amber-300 text-white",
    matchSignals: ["baseline_recovery", "period_active", "pms_window", "muscle_tension"],
    priority: 7,
  },
  {
    id: "protein-snack",
    name: "간편 단백질 스낵",
    subtitle: "식사 텀이 긴 날 빠르게 에너지를 보충하는 쪽에 맞춘 간편 루틴",
    category: "nutrition",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "뉴트리션 파트너 연동 준비중",
    visualLabel: "Quick Fuel",
    visualClass: "bg-gradient-to-br from-emerald-500 via-lime-400 to-yellow-300 text-slate-900",
    matchSignals: ["baseline_recovery", "long_shift", "sleep_low", "night_shift"],
    priority: 3,
  },
  {
    id: "neck-pad",
    name: "목·어깨 온열 쿠션",
    subtitle: "긴장감이 높은 날 목과 어깨 부담을 잠깐씩 풀어주는 회복 보조용",
    category: "comfort",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "컴포트 파트너 연동 준비중",
    visualLabel: "Ease Pressure",
    visualClass: "bg-gradient-to-br from-stone-800 via-stone-600 to-stone-400 text-white",
    matchSignals: ["baseline_recovery", "stress_high", "muscle_tension", "long_shift"],
    priority: 5,
  },
  {
    id: "blue-light-guard",
    name: "블루라이트 차단 안경",
    subtitle: "야간 또는 저녁 근무 후 눈 자극을 줄이는 데 초점을 둔 가벼운 보조용",
    category: "comfort",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "아이케어 파트너 연동 준비중",
    visualLabel: "Eye Guard",
    visualClass: "bg-gradient-to-br from-sky-950 via-blue-900 to-cyan-700 text-white",
    matchSignals: ["baseline_recovery", "night_shift", "eye_fatigue"],
    priority: 4,
  },
  {
    id: "caffeine-free-tea",
    name: "무카페인 릴렉스 티",
    subtitle: "긴장도가 높거나 수면이 흔들리는 날 밤 루틴을 정리하는 데 맞춘 선택지",
    category: "sleep",
    priceLabel: "제휴 가격 연동 예정",
    partnerLabel: "티 파트너 연동 준비중",
    visualLabel: "Calm Evening",
    visualClass: "bg-gradient-to-br from-teal-700 via-emerald-600 to-lime-500 text-white",
    matchSignals: ["baseline_recovery", "sleep_low", "stress_high", "pms_window"],
    priority: 4,
  },
];

function bumpSignal(map: Map<ShopSignalKey, ShopSignal>, key: ShopSignalKey, weight: number) {
  const meta = SIGNAL_META[key];
  const prev = map.get(key);
  if (prev) {
    prev.weight += weight;
    return;
  }
  map.set(key, { ...meta, weight });
}

type SignalInput = {
  selected?: ISODate | null;
  schedule: Record<ISODate, Shift | undefined>;
  bio: Record<ISODate, BioInputs | undefined>;
  settings: AppSettings;
};

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

  const sleepHours = Number(bio?.sleepHours ?? NaN);
  if (Number.isFinite(sleepHours)) {
    if (sleepHours < 6) bumpSignal(signalMap, "sleep_low", 4);
    else if (sleepHours < 7) bumpSignal(signalMap, "sleep_low", 2);
  }

  const stress = Number(bio?.stress ?? NaN);
  if (Number.isFinite(stress) && stress >= 2) {
    bumpSignal(signalMap, "stress_high", stress >= 3 ? 4 : 3);
  }

  const caffeine = Number(bio?.caffeineMg ?? NaN);
  if (Number.isFinite(caffeine) && caffeine >= 180) {
    bumpSignal(signalMap, "hydration_needed", caffeine >= 300 ? 4 : 3);
  }

  const activity = Number(bio?.activity ?? NaN);
  if ((Number.isFinite(activity) && activity >= 2) || (bio?.workEventTags?.length ?? 0) > 0 || Boolean(bio?.workEventNote)) {
    bumpSignal(signalMap, "muscle_tension", 3);
  }

  const symptomSeverity = Number(bio?.symptomSeverity ?? NaN);
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
}): { selectedDate: ISODate; signals: ShopSignal[]; recommendations: ShopRecommendation[] } {
  const { selectedDate, signals } = deriveShopSignals(args);
  const activeCategory = args.category ?? "all";
  const recommendations = SHOP_PRODUCTS.filter((product) => activeCategory === "all" || product.category === activeCategory)
    .map((product) => {
      const matchedSignals = signals.filter((signal) => product.matchSignals.includes(signal.key));
      const signalScore = matchedSignals.reduce((sum, signal) => sum + signal.weight, 0);
      const score = signalScore + product.priority;
      const primaryReason = matchedSignals[0]?.reason ?? SIGNAL_META.baseline_recovery.reason;
      return {
        product,
        score,
        matchedSignals,
        primaryReason,
      };
    })
    .sort((a, b) => b.score - a.score || b.product.priority - a.product.priority || a.product.name.localeCompare(b.product.name, "ko"));

  return { selectedDate, signals, recommendations };
}
