import { notFound } from "next/navigation";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DevLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = (typeof params.token === "string" ? params.token : "")?.trim();
  const required = process.env.DEV_LOG_VIEW_TOKEN;
  // LOW-1: 인증 실패 시 존재 여부 힌트 없이 404 반환
  // URL 토큰은 브라우저 히스토리/서버 로그에 노출되므로 운영환경에서는 사용 주의
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
