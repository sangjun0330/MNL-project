import { listDailyLogs } from "@/lib/server/logStore";

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

  const deviceId = typeof params.deviceId === "string" ? params.deviceId : undefined;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  const rows = await listDailyLogs({ deviceId, from, to, limit: 365 });

  return (
    <div className="mx-auto max-w-[960px] p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Daily Health Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          deviceId별/날짜별로 자동 저장된 건강 기록 스냅샷입니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="grid grid-cols-[180px_160px_1fr] gap-0 border-b bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          <div>deviceId</div>
          <div>date</div>
          <div>payload (collapsed)</div>
        </div>
        <div className="divide-y">
          {rows.map((r) => (
            <details key={`${r.deviceId}-${r.date}`} className="px-4 py-3">
              <summary className="grid cursor-pointer grid-cols-[180px_160px_1fr] items-center gap-0 text-sm">
                <div className="truncate pr-2 font-mono text-[12px]">{r.deviceId}</div>
                <div className="font-mono text-[12px]">{r.date}</div>
                <div className="truncate text-[12px] text-gray-600">{JSON.stringify(r.payload)}</div>
              </summary>
              <pre className="mt-3 overflow-auto rounded-xl bg-gray-900 p-3 text-xs text-gray-100">
                {JSON.stringify(r.payload, null, 2)}
              </pre>
            </details>
          ))}
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">데이터가 없어요.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
