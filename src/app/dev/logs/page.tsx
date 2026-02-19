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
  if (!required || token !== required) {
    return (
      <div className="mx-auto max-w-[720px] p-6">
        <h1 className="text-xl font-semibold">Not Found</h1>
        <p className="mt-2 text-sm text-gray-500">DEV_LOG_VIEW_TOKEN을 설정하고 ?token= 로 접근하세요.</p>
      </div>
    );
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
