import { approveShopOrderRefund, readShopOrder, readShopOrderForUser, rejectShopOrderRefund, requestShopOrderRefund } from "@/lib/server/shopOrderStore";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";
import type { Json } from "@/types/supabase";

const SHOP_CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIST_LIMIT = 120;
const SHOP_CLAIMS_FALLBACK_KEY = "shopClaims";

export type ShopClaimType = "REFUND" | "EXCHANGE";
export type ShopClaimStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "RETURN_SHIPPED"
  | "RETURN_RECEIVED"
  | "REFUND_COMPLETED"
  | "EXCHANGE_SHIPPED"
  | "WITHDRAWN";

export type ShopClaimRecord = {
  claimId: string;
  orderId: string;
  userId: string;
  claimType: ShopClaimType;
  status: ShopClaimStatus;
  reason: string;
  detail: string | null;
  adminNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  returnTrackingNumber: string | null;
  returnCourier: string | null;
  returnShippedAt: string | null;
  returnReceivedAt: string | null;
  exchangeTrackingNumber: string | null;
  exchangeCourier: string | null;
  exchangeShippedAt: string | null;
  refundCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function cleanText(value: unknown, max = 220) {
  return String(value ?? "").trim().slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTimestamp(value: string | null | undefined) {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isStorageUnavailableError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return message.includes("supabase admin env missing");
}

function isMissingTableError(error: unknown, tableName: string) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    (message.includes("schema cache") && message.includes(tableName)) ||
    (message.includes("relation") && message.includes(tableName)) ||
    (message.includes(tableName) && message.includes("does not exist"))
  );
}

function isConflictError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  return code === "23505";
}

function normalizeClaimType(value: unknown): ShopClaimType | null {
  const text = cleanText(value, 24).toUpperCase();
  if (text === "REFUND") return "REFUND";
  if (text === "EXCHANGE") return "EXCHANGE";
  return null;
}

function normalizeClaimStatus(value: unknown): ShopClaimStatus | null {
  const text = cleanText(value, 40).toUpperCase();
  if (text === "REQUESTED") return "REQUESTED";
  if (text === "APPROVED") return "APPROVED";
  if (text === "REJECTED") return "REJECTED";
  if (text === "RETURN_SHIPPED") return "RETURN_SHIPPED";
  if (text === "RETURN_RECEIVED") return "RETURN_RECEIVED";
  if (text === "REFUND_COMPLETED") return "REFUND_COMPLETED";
  if (text === "EXCHANGE_SHIPPED") return "EXCHANGE_SHIPPED";
  if (text === "WITHDRAWN") return "WITHDRAWN";
  return null;
}

function toDbClaimType(type: ShopClaimType) {
  return type.toLowerCase();
}

function toDbClaimStatus(status: ShopClaimStatus) {
  return status.toLowerCase();
}

function fromShopClaimRow(row: any): ShopClaimRecord | null {
  if (!row || typeof row !== "object") return null;
  const claimType = normalizeClaimType(row.claim_type);
  const status = normalizeClaimStatus(row.status);
  const claimId = cleanText(row.claim_id, 80);
  const orderId = cleanText(row.order_id, 80);
  const userId = cleanText(row.user_id, 120);
  if (!claimType || !status || !claimId || !orderId || !userId) return null;
  return {
    claimId,
    orderId,
    userId,
    claimType,
    status,
    reason: cleanText(row.reason, 240) || "후속 처리 요청",
    detail: cleanText(row.detail, 800) || null,
    adminNote: cleanText(row.admin_note, 800) || null,
    requestedAt: cleanText(row.requested_at, 64) || cleanText(row.created_at, 64) || new Date().toISOString(),
    reviewedAt: cleanText(row.reviewed_at, 64) || null,
    reviewedBy: cleanText(row.reviewed_by, 120) || null,
    returnTrackingNumber: cleanText(row.return_tracking_number, 120) || null,
    returnCourier: cleanText(row.return_courier, 80) || null,
    returnShippedAt: cleanText(row.return_shipped_at, 64) || null,
    returnReceivedAt: cleanText(row.return_received_at, 64) || null,
    exchangeTrackingNumber: cleanText(row.exchange_tracking_number, 120) || null,
    exchangeCourier: cleanText(row.exchange_courier, 80) || null,
    exchangeShippedAt: cleanText(row.exchange_shipped_at, 64) || null,
    refundCompletedAt: cleanText(row.refund_completed_at, 64) || null,
    createdAt: cleanText(row.created_at, 64) || new Date().toISOString(),
    updatedAt: cleanText(row.updated_at, 64) || cleanText(row.created_at, 64) || new Date().toISOString(),
  };
}

function toClaimSortTime(claim: ShopClaimRecord) {
  return Math.max(toTimestamp(claim.updatedAt), toTimestamp(claim.requestedAt), toTimestamp(claim.createdAt));
}

function sortClaimsDesc(claims: ShopClaimRecord[]) {
  return [...claims].sort((a, b) => toClaimSortTime(b) - toClaimSortTime(a));
}

function fromFallbackClaim(raw: unknown, fallbackUserId?: string): ShopClaimRecord | null {
  if (!isRecord(raw)) return null;
  const claimType = normalizeClaimType(raw.claimType ?? raw.claim_type);
  const status = normalizeClaimStatus(raw.status);
  const claimId = cleanText(raw.claimId ?? raw.claim_id, 80);
  const orderId = cleanText(raw.orderId ?? raw.order_id, 80);
  const userId = cleanText(raw.userId ?? raw.user_id ?? fallbackUserId, 120);
  if (!claimType || !status || !claimId || !orderId || !userId) return null;
  const nowIso = new Date().toISOString();
  return {
    claimId,
    orderId,
    userId,
    claimType,
    status,
    reason: cleanText(raw.reason, 240) || "후속 처리 요청",
    detail: cleanText(raw.detail, 800) || null,
    adminNote: cleanText(raw.adminNote ?? raw.admin_note, 800) || null,
    requestedAt: cleanText(raw.requestedAt ?? raw.requested_at, 64) || cleanText(raw.createdAt ?? raw.created_at, 64) || nowIso,
    reviewedAt: cleanText(raw.reviewedAt ?? raw.reviewed_at, 64) || null,
    reviewedBy: cleanText(raw.reviewedBy ?? raw.reviewed_by, 120) || null,
    returnTrackingNumber: cleanText(raw.returnTrackingNumber ?? raw.return_tracking_number, 120) || null,
    returnCourier: cleanText(raw.returnCourier ?? raw.return_courier, 80) || null,
    returnShippedAt: cleanText(raw.returnShippedAt ?? raw.return_shipped_at, 64) || null,
    returnReceivedAt: cleanText(raw.returnReceivedAt ?? raw.return_received_at, 64) || null,
    exchangeTrackingNumber: cleanText(raw.exchangeTrackingNumber ?? raw.exchange_tracking_number, 120) || null,
    exchangeCourier: cleanText(raw.exchangeCourier ?? raw.exchange_courier, 80) || null,
    exchangeShippedAt: cleanText(raw.exchangeShippedAt ?? raw.exchange_shipped_at, 64) || null,
    refundCompletedAt: cleanText(raw.refundCompletedAt ?? raw.refund_completed_at, 64) || null,
    createdAt: cleanText(raw.createdAt ?? raw.created_at, 64) || nowIso,
    updatedAt: cleanText(raw.updatedAt ?? raw.updated_at, 64) || cleanText(raw.createdAt ?? raw.created_at, 64) || nowIso,
  };
}

function toFallbackClaimPayload(claim: ShopClaimRecord) {
  return {
    claimId: claim.claimId,
    orderId: claim.orderId,
    userId: claim.userId,
    claimType: claim.claimType,
    status: claim.status,
    reason: claim.reason,
    detail: claim.detail,
    adminNote: claim.adminNote,
    requestedAt: claim.requestedAt,
    reviewedAt: claim.reviewedAt,
    reviewedBy: claim.reviewedBy,
    returnTrackingNumber: claim.returnTrackingNumber,
    returnCourier: claim.returnCourier,
    returnShippedAt: claim.returnShippedAt,
    returnReceivedAt: claim.returnReceivedAt,
    exchangeTrackingNumber: claim.exchangeTrackingNumber,
    exchangeCourier: claim.exchangeCourier,
    exchangeShippedAt: claim.exchangeShippedAt,
    refundCompletedAt: claim.refundCompletedAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };
}

function readFallbackClaimsFromPayload(payload: unknown, userId: string) {
  if (!isRecord(payload)) return [] as ShopClaimRecord[];
  const rawClaims = Array.isArray(payload[SHOP_CLAIMS_FALLBACK_KEY]) ? payload[SHOP_CLAIMS_FALLBACK_KEY] : [];
  return sortClaimsDesc(
    rawClaims
      .map((item) => fromFallbackClaim(item, userId))
      .filter((item): item is ShopClaimRecord => Boolean(item))
  );
}

async function loadFallbackClaimsForUser(userId: string) {
  const safeUserId = cleanText(userId, 120);
  if (!safeUserId) return [] as ShopClaimRecord[];
  const row = await loadUserState(safeUserId).catch(() => null);
  return readFallbackClaimsFromPayload(row?.payload, safeUserId);
}

async function saveFallbackClaimsForUser(userId: string, claims: ShopClaimRecord[]) {
  const safeUserId = cleanText(userId, 120);
  if (!safeUserId) return;
  const row = await loadUserState(safeUserId).catch(() => null);
  const basePayload = isRecord(row?.payload) ? { ...row?.payload } : {};
  basePayload[SHOP_CLAIMS_FALLBACK_KEY] = sortClaimsDesc(claims).map(toFallbackClaimPayload);
  await saveUserState({
    userId: safeUserId,
    payload: basePayload,
  });
}

async function listFallbackClaimsForAdmin(limit = 80): Promise<ShopClaimRecord[]> {
  const admin: any = getSupabaseAdmin();
  const userScanLimit = Math.max(80, Math.min(800, Math.round(Number(limit) || 80) * 6));
  const { data, error } = await admin
    .from("rnest_user_state")
    .select("user_id, payload")
    .limit(userScanLimit);
  if (error) throw error;
  const merged: ShopClaimRecord[] = [];
  for (const row of data ?? []) {
    const userId = cleanText((row as any)?.user_id, 120);
    if (!userId) continue;
    merged.push(...readFallbackClaimsFromPayload((row as any)?.payload, userId));
  }
  return sortClaimsDesc(merged).slice(0, normalizeLimit(limit));
}

async function findFallbackClaimById(claimId: string) {
  const safeClaimId = cleanText(claimId, 80);
  if (!safeClaimId) return null;
  const admin: any = getSupabaseAdmin();
  const { data, error } = await admin
    .from("rnest_user_state")
    .select("user_id, payload")
    .limit(800);
  if (error) throw error;
  for (const row of data ?? []) {
    const userId = cleanText((row as any)?.user_id, 120);
    if (!userId) continue;
    const claims = readFallbackClaimsFromPayload((row as any)?.payload, userId);
    const claim = claims.find((item) => item.claimId === safeClaimId);
    if (claim) return { userId, claim, claims };
  }
  return null;
}

function isOpenClaimStatus(status: ShopClaimStatus) {
  return status === "REQUESTED" || status === "APPROVED" || status === "RETURN_SHIPPED" || status === "RETURN_RECEIVED";
}

function canCreatePostOrderClaim(input: { status: string; deliveredAt: string | null; refundStatus: string }) {
  if (input.status === "FAILED" || input.status === "CANCELED" || input.status === "REFUNDED") {
    return false;
  }
  if (input.refundStatus === "done") return false;
  return Boolean(input.deliveredAt);
}

function hasClaimWindowExpired(deliveredAt: string | null) {
  if (!deliveredAt) return true;
  const deliveredAtMs = toTimestamp(deliveredAt);
  if (!deliveredAtMs) return true;
  return Date.now() - deliveredAtMs > SHOP_CLAIM_WINDOW_MS;
}

function sanitizeClaimReason(value: unknown) {
  const text = cleanText(value, 240);
  return text || null;
}

function sanitizeClaimDetail(value: unknown) {
  const text = cleanText(value, 800);
  return text || null;
}

function sanitizeNote(value: unknown) {
  const text = cleanText(value, 800);
  return text || null;
}

function buildShopClaimId(orderId: string) {
  const stamp = Date.now().toString(36);
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const safeOrder = cleanText(orderId, 20).replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase() || "order";
  return `claim_${safeOrder}_${stamp}_${rand}`.slice(0, 72);
}

async function readClaimById(claimId: string): Promise<ShopClaimRecord | null> {
  const admin: any = getSupabaseAdmin();
  const { data, error } = await admin.from("shop_claims").select("*").eq("claim_id", claimId).maybeSingle();
  if (error) throw error;
  return fromShopClaimRow(data);
}

async function updateClaim(claimId: string, patch: Record<string, unknown>): Promise<ShopClaimRecord> {
  const admin: any = getSupabaseAdmin();
  const { data, error } = await admin.from("shop_claims").update(patch).eq("claim_id", claimId).select("*").single();
  if (error) throw error;
  const claim = fromShopClaimRow(data);
  if (!claim) throw new Error("shop_claim_not_found");
  return claim;
}

async function insertClaim(input: {
  claimId: string;
  orderId: string;
  userId: string;
  claimType: ShopClaimType;
  reason: string;
  detail: string | null;
  requestedAt: string;
}): Promise<ShopClaimRecord> {
  const admin: any = getSupabaseAdmin();
  const { data, error } = await admin
    .from("shop_claims")
    .insert({
      claim_id: input.claimId,
      order_id: input.orderId,
      user_id: input.userId,
      claim_type: toDbClaimType(input.claimType),
      status: toDbClaimStatus("REQUESTED"),
      reason: input.reason,
      detail: input.detail ?? "",
      requested_at: input.requestedAt,
      created_at: input.requestedAt,
      updated_at: input.requestedAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  const claim = fromShopClaimRow(data);
  if (!claim) throw new Error("failed_to_create_shop_claim");
  return claim;
}

async function deleteClaim(claimId: string) {
  const admin: any = getSupabaseAdmin();
  await admin.from("shop_claims").delete().eq("claim_id", claimId);
}

async function writeClaimEventSafe(input: {
  claim: ShopClaimRecord;
  eventType: string;
  actorRole: "system" | "user" | "admin";
  actorUserId?: string | null;
  message?: string | null;
  metadata?: Json | null;
}) {
  const payload = {
    claim_id: input.claim.claimId,
    order_id: input.claim.orderId,
    user_id: input.claim.userId,
    actor_user_id: cleanText(input.actorUserId, 120) || null,
    actor_role: input.actorRole,
    event_type: cleanText(input.eventType, 64) || "updated",
    status: toDbClaimStatus(input.claim.status),
    message: cleanText(input.message, 500) || null,
    metadata: input.metadata ?? null,
  };

  try {
    const admin: any = getSupabaseAdmin();
    const { error } = await admin.from("shop_claim_events").insert(payload);
    if (error && !isMissingTableError(error, "shop_claim_events")) throw error;
  } catch (error) {
    if (isMissingTableError(error, "shop_claim_events")) return;
  }
}

function normalizeLimit(limit?: number, max = MAX_LIST_LIMIT) {
  return Math.max(1, Math.min(max, Math.round(Number(limit) || 40)));
}

function toShopClaimHttpStorageError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  const normalized = message.toLowerCase();
  if (
    message === "shop_claim_storage_unavailable" ||
    isStorageUnavailableError(error) ||
    isMissingTableError(error, "shop_claims") ||
    isMissingTableError(error, "shop_claim_events") ||
    isMissingTableError(error, "rnest_user_state") ||
    (normalized.includes("schema cache") && normalized.includes("shop_claim")) ||
    (normalized.includes("shop_claim") && normalized.includes("does not exist")) ||
    (normalized.includes("invalid input syntax for type uuid") && normalized.includes("shop_claim"))
  ) {
    return "shop_claim_storage_unavailable";
  }
  return null;
}

async function listClaims(input: { userId?: string; orderId?: string; limit?: number }) {
  const admin: any = getSupabaseAdmin();
  let query = admin
    .from("shop_claims")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(normalizeLimit(input.limit));
  if (input.userId) query = query.eq("user_id", cleanText(input.userId, 120));
  if (input.orderId) query = query.eq("order_id", cleanText(input.orderId, 80));
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => fromShopClaimRow(row))
    .filter((row: ShopClaimRecord | null): row is ShopClaimRecord => Boolean(row));
}

export async function listShopClaimsForUser(
  userId: string,
  input?: { orderId?: string | null; limit?: number | null }
): Promise<ShopClaimRecord[]> {
  const safeUserId = cleanText(userId, 120);
  const safeOrderId = cleanText(input?.orderId, 80) || null;
  const safeLimit = Number(input?.limit) || undefined;
  try {
    return await listClaims({ userId: safeUserId, orderId: safeOrderId || undefined, limit: safeLimit });
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const fallbackClaims = await loadFallbackClaimsForUser(safeUserId);
      const filtered = safeOrderId ? fallbackClaims.filter((claim) => claim.orderId === safeOrderId) : fallbackClaims;
      return filtered.slice(0, normalizeLimit(safeLimit));
    }
    throw error;
  }
}

export async function listShopClaimsForAdmin(limit = 80): Promise<ShopClaimRecord[]> {
  try {
    return await listClaims({ limit });
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) return listFallbackClaimsForAdmin(limit);
    throw error;
  }
}

export async function readShopClaimForUser(userId: string, claimId: string): Promise<ShopClaimRecord | null> {
  const safeUserId = cleanText(userId, 120);
  const safeClaimId = cleanText(claimId, 80);
  try {
    const claim = await readClaimById(safeClaimId);
    if (!claim || claim.userId !== safeUserId) return null;
    return claim;
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const claims = await loadFallbackClaimsForUser(safeUserId);
      return claims.find((claim) => claim.claimId === safeClaimId) ?? null;
    }
    throw error;
  }
}

export async function createShopClaim(input: {
  userId: string;
  orderId: string;
  claimType: ShopClaimType;
  reason: string;
  detail?: string | null;
}) {
  const userId = cleanText(input.userId, 120);
  const orderId = cleanText(input.orderId, 80);
  if (!userId || !orderId) throw new Error("invalid_shop_claim_input");

  const order = await readShopOrderForUser(userId, orderId);
  if (!order) throw new Error("shop_order_not_found");

  if (
    !canCreatePostOrderClaim({
      status: order.status,
      deliveredAt: order.deliveredAt,
      refundStatus: order.refund.status,
    })
  ) {
    throw new Error("shop_claim_not_eligible");
  }
  if (hasClaimWindowExpired(order.deliveredAt)) throw new Error("shop_claim_window_expired");

  const existingClaims = await listShopClaimsForUser(userId, { orderId, limit: 30 }).catch(() => []);
  const openClaim = existingClaims.find((claim) => isOpenClaimStatus(claim.status));
  if (openClaim) throw new Error("shop_claim_already_open");

  const claimType = input.claimType;
  if (claimType === "REFUND" && order.refund.status === "done") {
    throw new Error("shop_order_already_refunded");
  }

  const reason = sanitizeClaimReason(input.reason);
  if (!reason || reason.length < 5) throw new Error("shop_claim_reason_required");
  const detail = sanitizeClaimDetail(input.detail);
  const now = new Date().toISOString();
  const claimId = buildShopClaimId(orderId);

  let created: ShopClaimRecord | null = null;
  try {
    created = await insertClaim({
      claimId,
      orderId,
      userId,
      claimType,
      reason,
      detail,
      requestedAt: now,
    });

    if (claimType === "REFUND") {
      await requestShopOrderRefund({
        userId,
        orderId,
        reason,
      });
    }

    await writeClaimEventSafe({
      claim: created,
      eventType: "claim_requested",
      actorRole: "user",
      actorUserId: userId,
      message: reason,
      metadata: {
        claimType: created.claimType,
        orderId: created.orderId,
      } as Json,
    });

    return created;
  } catch (error) {
    if (created) {
      await deleteClaim(created.claimId).catch(() => undefined);
    }
    if (isConflictError(error)) throw new Error("shop_claim_already_open");
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const fallbackClaim: ShopClaimRecord = {
        claimId,
        orderId,
        userId,
        claimType,
        status: "REQUESTED",
        reason,
        detail,
        adminNote: null,
        requestedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        returnTrackingNumber: null,
        returnCourier: null,
        returnShippedAt: null,
        returnReceivedAt: null,
        exchangeTrackingNumber: null,
        exchangeCourier: null,
        exchangeShippedAt: null,
        refundCompletedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      const fallbackClaims = await loadFallbackClaimsForUser(userId);
      const openFallback = fallbackClaims.find((claim) => isOpenClaimStatus(claim.status) && claim.orderId === orderId);
      if (openFallback) throw new Error("shop_claim_already_open");

      if (claimType === "REFUND") {
        await requestShopOrderRefund({
          userId,
          orderId,
          reason,
        });
      }
      await saveFallbackClaimsForUser(userId, [fallbackClaim, ...fallbackClaims.filter((claim) => claim.claimId !== fallbackClaim.claimId)]);
      return fallbackClaim;
    }
    throw error;
  }
}

export async function reviewShopClaimByAdmin(input: {
  claimId: string;
  adminUserId: string;
  action: "approve" | "reject";
  note?: string | null;
}) {
  const claimId = cleanText(input.claimId, 80);
  const adminUserId = cleanText(input.adminUserId, 120);
  if (!claimId || !adminUserId) throw new Error("invalid_shop_claim_input");

  try {
    const current = await readClaimById(claimId);
    if (!current) throw new Error("shop_claim_not_found");
    if (current.status !== "REQUESTED") throw new Error("shop_claim_not_reviewable");

    const reviewedAt = new Date().toISOString();
    const adminNote = sanitizeNote(input.note);
    const status: ShopClaimStatus = input.action === "approve" ? "APPROVED" : "REJECTED";
    const reviewedClaim = await updateClaim(claimId, {
      status: toDbClaimStatus(status),
      reviewed_at: reviewedAt,
      reviewed_by: adminUserId,
      admin_note: adminNote,
    });

    if (current.claimType === "REFUND" && input.action === "reject") {
      await rejectShopOrderRefund({
        orderId: current.orderId,
        adminUserId,
        note: adminNote ?? "환불 요청이 반려되었습니다.",
      }).catch(() => undefined);
    }

    await writeClaimEventSafe({
      claim: reviewedClaim,
      eventType: input.action === "approve" ? "claim_approved" : "claim_rejected",
      actorRole: "admin",
      actorUserId: adminUserId,
      message: adminNote ?? (input.action === "approve" ? "요청이 승인되었습니다." : "요청이 반려되었습니다."),
      metadata: {
        action: input.action,
      } as Json,
    });

    return reviewedClaim;
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const fallback = await findFallbackClaimById(claimId).catch(() => null);
      if (!fallback) throw new Error("shop_claim_not_found");
      const current = fallback.claim;
      if (current.status !== "REQUESTED") throw new Error("shop_claim_not_reviewable");

      const reviewedAt = new Date().toISOString();
      const adminNote = sanitizeNote(input.note);
      const nextStatus: ShopClaimStatus = input.action === "approve" ? "APPROVED" : "REJECTED";
      const saved: ShopClaimRecord = {
        ...current,
        status: nextStatus,
        reviewedAt,
        reviewedBy: adminUserId,
        adminNote,
        updatedAt: reviewedAt,
      };

      if (current.claimType === "REFUND" && input.action === "reject") {
        await rejectShopOrderRefund({
          orderId: current.orderId,
          adminUserId,
          note: adminNote ?? "환불 요청이 반려되었습니다.",
        }).catch(() => undefined);
      }

      await saveFallbackClaimsForUser(
        fallback.userId,
        [saved, ...fallback.claims.filter((claim) => claim.claimId !== saved.claimId)]
      );
      return saved;
    }
    throw error;
  }
}

export async function submitShopClaimReturnShipmentByUser(input: {
  userId: string;
  claimId: string;
  courier: string;
  trackingNumber: string;
}) {
  const userId = cleanText(input.userId, 120);
  const claimId = cleanText(input.claimId, 80);
  const courier = cleanText(input.courier, 80);
  const trackingNumber = cleanText(input.trackingNumber, 120);
  if (!userId || !claimId || !courier || !trackingNumber) throw new Error("invalid_shop_claim_input");

  try {
    const current = await readShopClaimForUser(userId, claimId);
    if (!current) throw new Error("shop_claim_not_found");
    if (current.status !== "APPROVED") throw new Error("shop_claim_return_not_allowed");

    const now = new Date().toISOString();
    const saved = await updateClaim(claimId, {
      status: toDbClaimStatus("RETURN_SHIPPED"),
      return_courier: courier,
      return_tracking_number: trackingNumber,
      return_shipped_at: now,
    });

    await writeClaimEventSafe({
      claim: saved,
      eventType: "return_shipped",
      actorRole: "user",
      actorUserId: userId,
      message: `${courier} ${trackingNumber}`,
      metadata: {
        courier,
        trackingNumber,
      } as Json,
    });

    return saved;
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const claims = await loadFallbackClaimsForUser(userId);
      const current = claims.find((claim) => claim.claimId === claimId) ?? null;
      if (!current) throw new Error("shop_claim_not_found");
      if (current.status !== "APPROVED") throw new Error("shop_claim_return_not_allowed");

      const now = new Date().toISOString();
      const saved: ShopClaimRecord = {
        ...current,
        status: "RETURN_SHIPPED",
        returnCourier: courier,
        returnTrackingNumber: trackingNumber,
        returnShippedAt: now,
        updatedAt: now,
      };
      await saveFallbackClaimsForUser(userId, [saved, ...claims.filter((claim) => claim.claimId !== saved.claimId)]);
      return saved;
    }
    throw error;
  }
}

export async function markShopClaimReturnReceivedByAdmin(input: {
  claimId: string;
  adminUserId: string;
  note?: string | null;
}) {
  const claimId = cleanText(input.claimId, 80);
  const adminUserId = cleanText(input.adminUserId, 120);
  if (!claimId || !adminUserId) throw new Error("invalid_shop_claim_input");

  try {
    const current = await readClaimById(claimId);
    if (!current) throw new Error("shop_claim_not_found");
    if (current.status !== "RETURN_SHIPPED") throw new Error("shop_claim_return_not_shipped");

    const now = new Date().toISOString();
    const note = sanitizeNote(input.note);
    const saved = await updateClaim(claimId, {
      status: toDbClaimStatus("RETURN_RECEIVED"),
      return_received_at: now,
      admin_note: note,
      reviewed_at: current.reviewedAt ?? now,
      reviewed_by: current.reviewedBy ?? adminUserId,
    });

    await writeClaimEventSafe({
      claim: saved,
      eventType: "return_received",
      actorRole: "admin",
      actorUserId: adminUserId,
      message: note ?? "반품 상품이 입고되었습니다.",
      metadata: null,
    });

    return saved;
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const fallback = await findFallbackClaimById(claimId).catch(() => null);
      if (!fallback) throw new Error("shop_claim_not_found");
      const current = fallback.claim;
      if (current.status !== "RETURN_SHIPPED") throw new Error("shop_claim_return_not_shipped");

      const now = new Date().toISOString();
      const note = sanitizeNote(input.note);
      const saved: ShopClaimRecord = {
        ...current,
        status: "RETURN_RECEIVED",
        returnReceivedAt: now,
        adminNote: note,
        reviewedAt: current.reviewedAt ?? now,
        reviewedBy: current.reviewedBy ?? adminUserId,
        updatedAt: now,
      };
      await saveFallbackClaimsForUser(
        fallback.userId,
        [saved, ...fallback.claims.filter((claim) => claim.claimId !== saved.claimId)]
      );
      return saved;
    }
    throw error;
  }
}

export async function completeShopRefundClaimByAdmin(input: {
  claimId: string;
  adminUserId: string;
  note?: string | null;
  requestAcceptLanguage?: string | null;
}) {
  const claimId = cleanText(input.claimId, 80);
  const adminUserId = cleanText(input.adminUserId, 120);
  if (!claimId || !adminUserId) throw new Error("invalid_shop_claim_input");

  try {
    const current = await readClaimById(claimId);
    if (!current) throw new Error("shop_claim_not_found");
    if (current.claimType !== "REFUND") throw new Error("shop_claim_not_refund");
    if (current.status !== "RETURN_RECEIVED") throw new Error("shop_claim_refund_not_ready");

    const note = sanitizeNote(input.note) ?? "교환/환불 클레임 환불 승인";
    try {
      await approveShopOrderRefund({
        orderId: current.orderId,
        adminUserId,
        note,
        requestAcceptLanguage: input.requestAcceptLanguage ?? null,
      });
    } catch (error: any) {
      const message = String(error?.message ?? "");
      if (message.includes("not_requested")) throw new Error("shop_claim_refund_not_ready");
      throw error;
    }

    const now = new Date().toISOString();
    const saved = await updateClaim(claimId, {
      status: toDbClaimStatus("REFUND_COMPLETED"),
      refund_completed_at: now,
      admin_note: note,
    });

    await writeClaimEventSafe({
      claim: saved,
      eventType: "claim_refund_completed",
      actorRole: "admin",
      actorUserId: adminUserId,
      message: note,
      metadata: null,
    });

    return saved;
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const fallback = await findFallbackClaimById(claimId).catch(() => null);
      if (!fallback) throw new Error("shop_claim_not_found");
      const current = fallback.claim;
      if (current.claimType !== "REFUND") throw new Error("shop_claim_not_refund");
      if (current.status !== "RETURN_RECEIVED") throw new Error("shop_claim_refund_not_ready");

      const note = sanitizeNote(input.note) ?? "교환/환불 클레임 환불 승인";
      try {
        await approveShopOrderRefund({
          orderId: current.orderId,
          adminUserId,
          note,
          requestAcceptLanguage: input.requestAcceptLanguage ?? null,
        });
      } catch (refundError: any) {
        const message = String(refundError?.message ?? "");
        if (message.includes("not_requested")) throw new Error("shop_claim_refund_not_ready");
        throw refundError;
      }

      const now = new Date().toISOString();
      const saved: ShopClaimRecord = {
        ...current,
        status: "REFUND_COMPLETED",
        refundCompletedAt: now,
        adminNote: note,
        updatedAt: now,
      };
      await saveFallbackClaimsForUser(
        fallback.userId,
        [saved, ...fallback.claims.filter((claim) => claim.claimId !== saved.claimId)]
      );
      return saved;
    }
    throw error;
  }
}

export async function markShopExchangeClaimShippedByAdmin(input: {
  claimId: string;
  adminUserId: string;
  courier: string;
  trackingNumber: string;
  note?: string | null;
}) {
  const claimId = cleanText(input.claimId, 80);
  const adminUserId = cleanText(input.adminUserId, 120);
  const courier = cleanText(input.courier, 80);
  const trackingNumber = cleanText(input.trackingNumber, 120);
  if (!claimId || !adminUserId || !courier || !trackingNumber) throw new Error("invalid_shop_claim_input");

  try {
    const current = await readClaimById(claimId);
    if (!current) throw new Error("shop_claim_not_found");
    if (current.claimType !== "EXCHANGE") throw new Error("shop_claim_not_exchange");
    if (current.status !== "RETURN_RECEIVED") throw new Error("shop_claim_exchange_not_ready");

    const now = new Date().toISOString();
    const note = sanitizeNote(input.note);
    const saved = await updateClaim(claimId, {
      status: toDbClaimStatus("EXCHANGE_SHIPPED"),
      exchange_courier: courier,
      exchange_tracking_number: trackingNumber,
      exchange_shipped_at: now,
      admin_note: note,
    });

    await writeClaimEventSafe({
      claim: saved,
      eventType: "claim_exchange_shipped",
      actorRole: "admin",
      actorUserId: adminUserId,
      message: note ?? `${courier} ${trackingNumber}`,
      metadata: {
        courier,
        trackingNumber,
      } as Json,
    });

    return saved;
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (storageError) {
      const fallback = await findFallbackClaimById(claimId).catch(() => null);
      if (!fallback) throw new Error("shop_claim_not_found");
      const current = fallback.claim;
      if (current.claimType !== "EXCHANGE") throw new Error("shop_claim_not_exchange");
      if (current.status !== "RETURN_RECEIVED") throw new Error("shop_claim_exchange_not_ready");

      const now = new Date().toISOString();
      const note = sanitizeNote(input.note);
      const saved: ShopClaimRecord = {
        ...current,
        status: "EXCHANGE_SHIPPED",
        exchangeCourier: courier,
        exchangeTrackingNumber: trackingNumber,
        exchangeShippedAt: now,
        adminNote: note,
        updatedAt: now,
      };
      await saveFallbackClaimsForUser(
        fallback.userId,
        [saved, ...fallback.claims.filter((claim) => claim.claimId !== saved.claimId)]
      );
      return saved;
    }
    throw error;
  }
}

export async function getShopClaimLinkedOrder(input: { claimId: string; userId?: string | null }) {
  const claimId = cleanText(input.claimId, 80);
  if (!claimId) return { claim: null, order: null };
  try {
    const claim = await readClaimById(claimId);
    if (!claim) return { claim: null, order: null };
    if (input.userId && claim.userId !== cleanText(input.userId, 120)) return { claim: null, order: null };
    const order = await readShopOrder(claim.orderId).catch(() => null);
    return { claim, order };
  } catch (error) {
    const storageError = toShopClaimHttpStorageError(error);
    if (!storageError) throw error;
    const safeUserId = cleanText(input.userId, 120) || null;
    let claim: ShopClaimRecord | null = null;
    if (safeUserId) {
      const claims = await loadFallbackClaimsForUser(safeUserId);
      claim = claims.find((item) => item.claimId === claimId) ?? null;
    } else {
      const fallback = await findFallbackClaimById(claimId).catch(() => null);
      claim = fallback?.claim ?? null;
    }
    if (!claim) return { claim: null, order: null };
    const order = await readShopOrder(claim.orderId).catch(() => null);
    return { claim, order };
  }
}
