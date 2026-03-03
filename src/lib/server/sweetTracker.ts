import type { ShopSmartTrackerMeta } from "@/lib/shopProfile";

const SWEETTRACKER_TRACKING_TEMPLATE_URL = "https://info.sweettracker.co.kr/tracking/5";
const SWEETTRACKER_MIN_POLL_MS = 60_000;

export type SweetTrackerResult = {
  ok: true;
  delivered: boolean;
  rawStatus: string;
  statusLabel: string;
  trackingUrl: string;
  lastEventAt: string | null;
  deliveredAt: string | null;
} | {
  ok: false;
  reason: "missing_config" | "invalid_input" | "not_found" | "fetch_failed";
  trackingUrl: string | null;
};

function cleanText(value: unknown, max = 400) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function readSweetTrackerKeyFromEnv() {
  const key = cleanText(process.env.SWEETTRACKER_API_KEY, 120);
  return key || null;
}

export function buildSweetTrackerTrackingUrl(input: {
  carrierCode: string | null | undefined;
  trackingNumber: string | null | undefined;
}) {
  const key = readSweetTrackerKeyFromEnv();
  const carrierCode = cleanText(input.carrierCode, 40);
  const trackingNumber = cleanText(input.trackingNumber, 80);
  if (!key || !carrierCode || !trackingNumber) return null;
  const url = new URL(SWEETTRACKER_TRACKING_TEMPLATE_URL);
  url.searchParams.set("t_key", key);
  url.searchParams.set("t_code", carrierCode);
  url.searchParams.set("t_invoice", trackingNumber);
  return url.toString();
}

function extractLatestTimestamp(text: string): string | null {
  const matches = Array.from(
    text.matchAll(
      /\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\b/g
    )
  );
  if (matches.length === 0) return null;
  const latest = matches[matches.length - 1];
  const year = latest[1];
  const month = latest[2].padStart(2, "0");
  const day = latest[3].padStart(2, "0");
  const hour = (latest[4] ?? "00").padStart(2, "0");
  const minute = (latest[5] ?? "00").padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}

function parseSweetTrackerStatus(text: string) {
  const normalized = cleanText(text, 10000);
  if (!normalized) {
    return {
      delivered: false,
      rawStatus: "unknown",
      statusLabel: "조회 정보 없음",
      lastEventAt: null,
      deliveredAt: null,
      notFound: false,
    };
  }

  const notFoundPatterns = [
    "운송장번호를 확인",
    "조회결과가 없습니다",
    "조회된 내역이 없습니다",
    "등록되지 않은 운송장",
    "없는 운송장",
  ];
  if (notFoundPatterns.some((pattern) => normalized.includes(pattern))) {
    return {
      delivered: false,
      rawStatus: "not_found",
      statusLabel: "조회 불가",
      lastEventAt: null,
      deliveredAt: null,
      notFound: true,
    };
  }

  const deliveredKeywords = ["배송완료", "배달완료", "배달 완료", "배송 완료"];
  const shippedKeywords = ["배송중", "배송 중", "상품인수", "배달출발", "집하", "간선하차", "이동중"];
  const delivered = deliveredKeywords.some((keyword) => normalized.includes(keyword));
  const matchedDeliveredKeyword = deliveredKeywords.find((keyword) => normalized.includes(keyword)) ?? null;
  const matchedShippedKeyword = shippedKeywords.find((keyword) => normalized.includes(keyword)) ?? null;
  const lastEventAt = extractLatestTimestamp(normalized);

  return {
    delivered,
    rawStatus: delivered ? "delivered" : "in_transit",
    statusLabel: matchedDeliveredKeyword ?? matchedShippedKeyword ?? "배송 조회중",
    lastEventAt,
    deliveredAt: delivered ? lastEventAt : null,
    notFound: false,
  };
}

export async function fetchSweetTrackerTracking(input: {
  carrierCode: string | null | undefined;
  trackingNumber: string | null | undefined;
}): Promise<SweetTrackerResult> {
  const trackingUrl = buildSweetTrackerTrackingUrl(input);
  if (!trackingUrl) {
    return {
      ok: false,
      reason: readSweetTrackerKeyFromEnv() ? "invalid_input" : "missing_config",
      trackingUrl: trackingUrl ?? null,
    };
  }

  let res: Response;
  try {
    res = await fetch(trackingUrl, {
      method: "GET",
      headers: {
        "cache-control": "no-cache",
      },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      reason: "fetch_failed",
      trackingUrl,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: "fetch_failed",
      trackingUrl,
    };
  }

  const html = await res.text().catch(() => "");
  const parsed = parseSweetTrackerStatus(stripHtml(html));
  if (parsed.notFound) {
    return {
      ok: false,
      reason: "not_found",
      trackingUrl,
    };
  }

  return {
    ok: true,
    delivered: parsed.delivered,
    rawStatus: parsed.rawStatus,
    statusLabel: parsed.statusLabel,
    trackingUrl,
    lastEventAt: parsed.lastEventAt,
    deliveredAt: parsed.deliveredAt,
  };
}

export function shouldPollSweetTracker(meta: ShopSmartTrackerMeta | null | undefined, force = false) {
  if (force) return true;
  const lastPolledAt = cleanText(meta?.lastPolledAt, 64);
  if (!lastPolledAt) return true;
  const last = new Date(lastPolledAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= SWEETTRACKER_MIN_POLL_MS;
}

