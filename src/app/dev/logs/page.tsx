import { notFound } from "next/navigation";
import { headers } from "next/headers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DevLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const params = await searchParams;
  const reqHeaders = await headers();
  const headerToken = (reqHeaders.get("x-dev-log-view-token") ?? "").trim();
  const queryToken = (typeof params.token === "string" ? params.token : "")?.trim();
  const token = headerToken || queryToken;
  const required = process.env.DEV_LOG_VIEW_TOKEN;
  // 인증 실패 시 존재 여부 힌트 없이 404 반환.
  // 운영에서는 페이지 자체를 숨기고, 개발환경에서도 헤더 토큰을 우선 사용한다.
  if (!required || token !== required) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[960px] p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Daily Logs Disabled</h1>
        <p className="mt-1 text-sm text-gray-500">
          rnest_daily_logs 기능은 제거되었습니다. 건강 기록 저장은 rnest_user_state만 사용합니다.
        </p>
      </div>
    </div>
  );
}
