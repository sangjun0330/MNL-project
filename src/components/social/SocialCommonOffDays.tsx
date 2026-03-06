"use client";

type Props = {
  dates: string[]; // ISO date strings
  friendCount: number;
};

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatKorean(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const date = new Date(iso + "T00:00:00");
  const weekday = WEEKDAY_KO[date.getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

export function SocialCommonOffDays({ dates, friendCount }: Props) {
  if (dates.length === 0) return null;

  return (
    <div className="rounded-apple border border-ios-sep bg-white shadow-apple px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[18px]">📅</span>
        <span className="text-[13.5px] font-semibold text-ios-text">이번 달 같이 쉬는 날</span>
      </div>
      <div className="space-y-1">
        {dates.map((iso) => (
          <div key={iso} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[13px] text-ios-text">{formatKorean(iso)}</span>
          </div>
        ))}
      </div>
      {friendCount > 1 && (
        <p className="mt-2 text-[11.5px] text-ios-muted">
          {friendCount}명 모두 오프
        </p>
      )}
    </div>
  );
}
