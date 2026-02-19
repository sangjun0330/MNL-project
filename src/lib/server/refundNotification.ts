import type { PlanTier } from "@/lib/billing/plans";

type RefundNotifyInput = {
  requestId: number;
  userId: string;
  requesterEmail?: string | null;
  orderId: string;
  reason: string;
  amount: number;
  planTier: PlanTier;
  requestedAt: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatKrw(amount: number) {
  return `${Math.max(0, Math.round(amount)).toLocaleString("ko-KR")} KRW`;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRecipients(value: string) {
  return value
    .split(/[,\n;]/)
    .map((item) => clean(item).toLowerCase())
    .filter((item) => isEmail(item));
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      reply_to: params.replyTo,
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    return {
      ok: false,
      message: `resend_http_${res.status}:${raw.slice(0, 180)}`,
    };
  }
  return { ok: true, message: "ok" };
}

export async function sendRefundRequestNotification(input: RefundNotifyInput): Promise<{
  sent: boolean;
  message: string;
}> {
  const apiKey = clean(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return { sent: false, message: "missing_resend_api_key" };
  }

  const to = clean(process.env.BILLING_REFUND_NOTIFY_TO) || "REFUND_ADMIN_EMAIL_REDACTED";
  const from = clean(process.env.BILLING_REFUND_FROM_EMAIL) || "onboarding@resend.dev";

  const subject = `[RNest] 환불 요청 접수 #${input.requestId}`;
  const reason = clean(input.reason) || "사용자 요청";
  const requestedAt = clean(input.requestedAt) || new Date().toISOString();
  const requesterEmail = clean(input.requesterEmail);
  const hasRequesterEmail = isEmail(requesterEmail);
  const recipients = parseRecipients(to);
  const filteredRecipients = hasRequesterEmail
    ? recipients.filter((email) => email !== requesterEmail.toLowerCase())
    : recipients;

  if (!filteredRecipients.length) {
    return { sent: false, message: "missing_refund_notify_recipients" };
  }

  const adminText = [
    "RNest 환불 요청이 접수되었습니다.",
    "",
    `요청 ID: ${input.requestId}`,
    `사용자 ID: ${input.userId}`,
    `사용자 이메일: ${hasRequesterEmail ? requesterEmail : "-"}`,
    `주문 ID: ${input.orderId}`,
    `플랜: ${input.planTier}`,
    `결제 금액: ${formatKrw(input.amount)}`,
    `요청 시각: ${requestedAt}`,
    "",
    "[환불 사유]",
    reason,
    "",
    "주의: 현재 시스템은 자동 환불을 수행하지 않습니다. 관리자가 사유 검토 후 수동 처리해야 합니다.",
  ].join("\n");

  const adminHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 12px;">RNest 환불 요청 접수</h2>
      <p style="margin:0 0 12px;">관리자 검토 후 수동으로 환불 처리해야 합니다.</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#666;">요청 ID</td><td style="padding:4px 0;">${input.requestId}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">사용자 ID</td><td style="padding:4px 0;">${escapeHtml(input.userId)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">사용자 이메일</td><td style="padding:4px 0;">${hasRequesterEmail ? escapeHtml(requesterEmail) : "-"}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">주문 ID</td><td style="padding:4px 0;">${escapeHtml(input.orderId)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">플랜</td><td style="padding:4px 0;">${escapeHtml(input.planTier)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">결제 금액</td><td style="padding:4px 0;">${formatKrw(input.amount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">요청 시각</td><td style="padding:4px 0;">${escapeHtml(requestedAt)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
        <div style="margin-bottom:6px;color:#666;">환불 사유</div>
        <div>${escapeHtml(reason)}</div>
      </div>
    </div>
  `.trim();

  const adminResult = await sendResendEmail({
    apiKey,
    from,
    to: filteredRecipients,
    replyTo: hasRequesterEmail ? requesterEmail : undefined,
    subject,
    text: adminText,
    html: adminHtml,
  });

  if (!adminResult.ok) {
    return {
      sent: false,
      message: adminResult.message,
    };
  }

  if (!hasRequesterEmail) {
    return { sent: true, message: "admin_sent_user_skipped" };
  }

  const userSubject = "[RNest] 환불 요청이 접수되었습니다";
  const userText = [
    "RNest 환불 요청이 접수되었습니다.",
    "",
    `사용자 이메일: ${requesterEmail}`,
    `결제 금액: ${formatKrw(input.amount)}`,
    `요청 시각: ${requestedAt}`,
    "",
    "[환불 사유]",
    reason,
    "",
    "관리자 검토 후 순차 처리되며, 처리 결과는 별도 안내됩니다.",
  ].join("\n");
  const userHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.55;">
      <h2 style="margin:0 0 12px;">RNest 환불 요청 접수</h2>
      <p style="margin:0 0 12px;">요청이 정상 접수되었습니다. 관리자 검토 후 순차 처리됩니다.</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#666;">사용자 이메일</td><td style="padding:4px 0;">${escapeHtml(requesterEmail)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">결제 금액</td><td style="padding:4px 0;">${formatKrw(input.amount)}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#666;">요청 시각</td><td style="padding:4px 0;">${escapeHtml(requestedAt)}</td></tr>
      </table>
      <div style="margin-top:14px;padding:10px 12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">
        <div style="margin-bottom:6px;color:#666;">환불 사유</div>
        <div>${escapeHtml(reason)}</div>
      </div>
    </div>
  `.trim();

  const userResult = await sendResendEmail({
    apiKey,
    from,
    to: [requesterEmail],
    subject: userSubject,
    text: userText,
    html: userHtml,
  });

  if (!userResult.ok) {
    return { sent: true, message: `admin_sent_user_failed:${userResult.message}` };
  }

  return { sent: true, message: "admin_sent_user_sent" };
}
