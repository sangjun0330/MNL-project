/**
 * 이메일 알림 서비스
 *
 * 현재: RESEND_API_KEY 환경변수가 설정되면 Resend를 통해 실제 발송됩니다.
 * 미설정 시: 콘솔 로그만 남기고 조용히 통과합니다.
 *
 * 키 설정 방법:
 *   .env.local 또는 Vercel 환경변수에 RESEND_API_KEY=re_xxx... 추가
 *   SHOP_EMAIL_FROM=RNest <noreply@rnest.kr> 추가 (선택)
 */

import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

const FROM_ADDRESS = process.env.SHOP_EMAIL_FROM ?? "RNest <noreply@rnest.kr>";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

async function sendEmail(payload: EmailPayload): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log("[EmailService] 이메일 미발송 (RESEND_API_KEY 미설정):", payload.subject, "→", payload.to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[EmailService] 발송 실패:", res.status, body);
  }
}

export async function loadUserEmailById(userId: string): Promise<string | null> {
  const normalized = String(userId ?? "").trim();
  if (!normalized) return null;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(normalized);
    if (error) return null;
    return String(data.user?.email ?? "").trim() || null;
  } catch {
    return null;
  }
}

function formatKrw(amount: number) {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

function emailLayout(title: string, content: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:40px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">
      <tr><td style="background:#11294b;padding:28px 32px;">
        <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">RNest</span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 20px;font-size:18px;font-weight:700;color:#111827;letter-spacing:-0.02em;">${title}</h2>
        ${content}
        <p style="margin:28px 0 0;font-size:12px;color:#8d99ab;line-height:1.7;">
          이 이메일은 RNest 쇼핑몰 주문과 관련하여 자동 발송되었습니다.<br/>
          문의: support@rnest.kr
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendOrderConfirmationEmail(order: {
  orderId: string;
  customerEmail: string | null;
  productName: string;
  quantity: number;
  amount: number;
  recipientName: string;
  addressLine1: string;
  addressLine2: string;
}): Promise<void> {
  if (!order.customerEmail) return;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:#44556d;line-height:1.7;">
      <strong>${order.recipientName}</strong>님, 주문이 완료되었습니다.<br/>
      상품 준비 후 배송이 시작되면 별도 안내 드립니다.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;width:100px;">주문번호</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#111827;">${order.orderId}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;">상품</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#111827;">${order.productName} × ${order.quantity}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;">결제금액</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:14px;font-weight:700;color:#111827;">${formatKrw(order.amount)}</td></tr>
      <tr><td style="padding:10px 0;font-size:13px;color:#8d99ab;">배송지</td>
          <td style="padding:10px 0;font-size:13px;color:#111827;">${order.addressLine1}${order.addressLine2 ? ` ${order.addressLine2}` : ""}</td></tr>
    </table>`;

  await sendEmail({
    to: order.customerEmail,
    subject: `[RNest] 주문이 완료되었습니다 — ${order.productName}`,
    html: emailLayout("주문 완료", content),
  });
}

export async function sendShippingStartedEmail(order: {
  customerEmail: string | null;
  productName: string;
  trackingNumber: string;
  courier: string;
}): Promise<void> {
  if (!order.customerEmail) return;
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:#44556d;line-height:1.7;">
      주문하신 상품이 발송되었습니다. 아래 운송장 번호로 배송을 추적하실 수 있습니다.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;width:100px;">상품</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#111827;">${order.productName}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;">택배사</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#111827;">${order.courier}</td></tr>
      <tr><td style="padding:10px 0;font-size:13px;color:#8d99ab;">운송장번호</td>
          <td style="padding:10px 0;font-size:14px;font-weight:700;color:#111827;">${order.trackingNumber}</td></tr>
    </table>`;

  await sendEmail({
    to: order.customerEmail,
    subject: `[RNest] 상품이 발송되었습니다 — ${order.productName}`,
    html: emailLayout("배송 시작", content),
  });
}

export async function sendRefundResultEmail(order: {
  customerEmail: string | null;
  productName: string;
  result: "approved" | "rejected";
  note: string | null;
  cancelAmount: number | null;
}): Promise<void> {
  if (!order.customerEmail) return;
  const isApproved = order.result === "approved";
  const title = isApproved ? "환불이 완료되었습니다" : "환불 요청이 반려되었습니다";
  const content = `
    <p style="margin:0 0 16px;font-size:14px;color:#44556d;line-height:1.7;">
      ${isApproved
        ? `환불이 처리되었습니다. 환불 금액은 영업일 기준 3~5일 이내에 결제 수단으로 반환됩니다.`
        : `환불 요청이 반려되었습니다. 아래 사유를 확인해 주세요.`
      }
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;width:100px;">상품</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#111827;">${order.productName}</td></tr>
      ${isApproved && order.cancelAmount != null ? `
      <tr><td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:13px;color:#8d99ab;">환불금액</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf1f6;font-size:14px;font-weight:700;color:#111827;">${formatKrw(order.cancelAmount)}</td></tr>` : ""}
      ${order.note ? `
      <tr><td style="padding:10px 0;font-size:13px;color:#8d99ab;">사유</td>
          <td style="padding:10px 0;font-size:13px;color:#111827;">${order.note}</td></tr>` : ""}
    </table>`;

  await sendEmail({
    to: order.customerEmail,
    subject: `[RNest] ${title} — ${order.productName}`,
    html: emailLayout(title, content),
  });
}
