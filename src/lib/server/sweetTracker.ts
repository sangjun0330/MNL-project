/**
 * SweetTracker 배송 조회 서버사이드 라이브러리
 *
 * - 정식 JSON REST API (`/api/v1/trackingInfo`) 사용
 * - HTML 스크래핑 방식 완전 폐기 (불안정, 마크업 변경에 취약)
 * - 사용자 노출 URL은 별도 템플릿 페이지 사용 (trackingOpenUrl)
 */

import { resolveSweetTrackerCarrierCode } from "@/lib/shopShipping";
import type { ShopSmartTrackerMeta } from "@/lib/shopProfile";

/** 정식 JSON REST API 엔드포인트 */
const SWEETTRACKER_API_URL = "https://info.sweettracker.co.kr/api/v1/trackingInfo";
/** 사용자 노출용 배송 조회 템플릿 페이지 */
const SWEETTRACKER_TRACKING_PAGE_URL = "https://info.sweettracker.co.kr/tracking/5";
/** 동일 주문 최소 재조회 간격 (ms) */
const SWEETTRACKER_MIN_POLL_MS = 60_000;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SweetTrackerResult =
  | {
      ok: true;
      delivered: boolean;
      rawStatus: string;
      statusLabel: string;
      trackingUrl: string;
      lastEventAt: string | null;
      deliveredAt: string | null;
    }
  | {
      ok: false;
      reason: "missing_config" | "invalid_input" | "not_found" | "fetch_failed";
      trackingUrl: string | null;
    };

/** SweetTracker API 응답 중 개별 배송 이벤트 */
type SweetTrackerDetail = {
  timeString: string; // "2024/03/04 09:30" (KST)
  where: string;
  kind: string; // 배달완료 | 배달출발 | 간선하차 | …
  level: string; // "1"–"5" (5 = 배달완료)
  telno?: string | null;
  manName?: string | null;
  manPic?: string | null;
};

/** SweetTracker `/api/v1/trackingInfo` 성공 응답 */
type SweetTrackerApiResponse = {
  msg: string; // "성공" | 오류 메시지
  trackingDetails?: SweetTrackerDetail[];
  itemImage?: string | null;
  complete?: boolean; // true = 배달완료
  recipient?: string | null;
  itemName?: string | null;
  invoiceNo?: string | null;
  code?: string | null;
  companyName?: string | null;
  adUrl?: string | null;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function cleanText(value: unknown, max = 400) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function readSweetTrackerKeyFromEnv() {
  const key = cleanText(process.env.SWEETTRACKER_API_KEY, 120);
  return key || null;
}

/**
 * "2024/03/04 09:30" → ISO8601+09:00 (KST)
 */
function parseSweetTrackerTimeString(timeString: string | null | undefined): string | null {
  if (!timeString) return null;
  const match = timeString.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * 사용자에게 노출할 배송 조회 URL (브라우저에서 직접 열기용)
 * API 호출이 아닌 SweetTracker 템플릿 페이지 URL
 */
export function buildSweetTrackerTrackingUrl(input: {
  carrierCode: string | null | undefined;
  trackingNumber: string | null | undefined;
  courier?: string | null | undefined;
}) {
  const key = readSweetTrackerKeyFromEnv();
  const carrierCode = resolveSweetTrackerCarrierCode({
    carrierCode: input.carrierCode,
    courier: input.courier,
  });
  const trackingNumber = cleanText(input.trackingNumber, 80);
  if (!key || !carrierCode || !trackingNumber) return null;

  const url = new URL(SWEETTRACKER_TRACKING_PAGE_URL);
  url.searchParams.set("t_key", key);
  url.searchParams.set("t_code", carrierCode);
  url.searchParams.set("t_invoice", trackingNumber);
  return url.toString();
}

/**
 * SweetTracker REST API를 호출하여 배송 상태를 JSON으로 조회합니다.
 *
 * GET /api/v1/trackingInfo?t_key=&t_code=&t_invoice=
 * - 성공: { msg: "성공", trackingDetails: [...], complete: bool, ... }
 * - 실패: { msg: "운송장번호를 확인해 주세요" } 등
 */
export async function fetchSweetTrackerTracking(input: {
  carrierCode: string | null | undefined;
  trackingNumber: string | null | undefined;
}): Promise<SweetTrackerResult> {
  const key = readSweetTrackerKeyFromEnv();
  if (!key) {
    return { ok: false, reason: "missing_config", trackingUrl: null };
  }

  const carrierCode = resolveSweetTrackerCarrierCode({
    carrierCode: input.carrierCode,
    courier: undefined,
  });
  const trackingNumber = cleanText(input.trackingNumber, 80);

  if (!carrierCode || !trackingNumber) {
    return {
      ok: false,
      reason: "invalid_input",
      trackingUrl: buildSweetTrackerTrackingUrl({ carrierCode, trackingNumber }),
    };
  }

  // 사용자 노출용 URL (반환값에 포함)
  const trackingUrl = buildSweetTrackerTrackingUrl({ carrierCode, trackingNumber });

  // ── REST API 호출 ──────────────────────────────
  const apiUrl = new URL(SWEETTRACKER_API_URL);
  apiUrl.searchParams.set("t_key", key);
  apiUrl.searchParams.set("t_code", carrierCode);
  apiUrl.searchParams.set("t_invoice", trackingNumber);

  let res: Response;
  try {
    res = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "fetch_failed", trackingUrl };
  }

  if (!res.ok) {
    return { ok: false, reason: "fetch_failed", trackingUrl };
  }

  let data: SweetTrackerApiResponse;
  try {
    data = (await res.json()) as SweetTrackerApiResponse;
  } catch {
    return { ok: false, reason: "fetch_failed", trackingUrl };
  }

  // ── 오류 메시지 감지 ──────────────────────────
  const msg = cleanText(data.msg, 200);
  const apiKeyErrorPatterns = ["API KEY", "키가 없", "인증"];
  const notFoundPatterns = [
    "운송장번호",
    "조회결과가 없",
    "조회된 내역이 없",
    "등록되지 않은",
    "없는 운송장",
    "확인해 주세요",
  ];

  if (apiKeyErrorPatterns.some((p) => msg.includes(p))) {
    console.warn("[SweetTracker] API KEY 인증 실패:", msg);
    return { ok: false, reason: "missing_config", trackingUrl };
  }
  if (notFoundPatterns.some((p) => msg.includes(p))) {
    return { ok: false, reason: "not_found", trackingUrl };
  }

  // ── 배송 이벤트 없음 처리 ──────────────────────
  const details = Array.isArray(data.trackingDetails) ? data.trackingDetails : [];
  if (details.length === 0) {
    // 운송장 등록 직후(이벤트 없음) 또는 아직 발송 전
    return {
      ok: true,
      delivered: false,
      rawStatus: "registered",
      statusLabel: "배송 준비중",
      trackingUrl: trackingUrl ?? "",
      lastEventAt: null,
      deliveredAt: null,
    };
  }

  // ── 배송 완료 여부 ──────────────────────────────
  const delivered = Boolean(data.complete);

  // 최신 이벤트(배열 마지막 항목)로 상태 결정
  const latest = details[details.length - 1];
  const lastEventAt = parseSweetTrackerTimeString(latest?.timeString ?? null);

  // level "5" 또는 complete=true 이면 배달완료
  const level = parseInt(cleanText(latest?.level, 4), 10);
  let statusLabel: string;
  if (delivered || level >= 5) {
    statusLabel = "배달완료";
  } else if (latest?.kind) {
    statusLabel = latest.kind;
  } else if (level === 4) {
    statusLabel = "배달출발";
  } else if (level === 3) {
    statusLabel = "배달지 도착";
  } else if (level === 2) {
    statusLabel = "이동 중";
  } else {
    statusLabel = "배송 중";
  }

  return {
    ok: true,
    delivered: delivered || level >= 5,
    rawStatus: delivered || level >= 5 ? "delivered" : "in_transit",
    statusLabel,
    trackingUrl: trackingUrl ?? "",
    lastEventAt,
    deliveredAt: delivered || level >= 5 ? lastEventAt : null,
  };
}

/**
 * 마지막 조회 시각 기준으로 재조회가 필요한지 판단합니다.
 */
export function shouldPollSweetTracker(
  meta: ShopSmartTrackerMeta | null | undefined,
  force = false
) {
  if (force) return true;
  const lastPolledAt = cleanText(meta?.lastPolledAt, 64);
  if (!lastPolledAt) return true;
  const last = new Date(lastPolledAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= SWEETTRACKER_MIN_POLL_MS;
}
