"use client";

export function InsightsLockedNotice({ recordedDays, minDays = 7 }: { recordedDays: number; minDays?: number }) {
  const remaining = Math.max(minDays - recordedDays, 0);
  return (
    <div className="rounded-apple border border-ios-sep bg-white p-6 shadow-apple">
      <div className="text-[18px] font-bold text-ios-text">인사이트가 아직 잠겨 있어요</div>
      <div className="mt-2 text-[13px] text-ios-sub">
        건강 정보를 최소 {minDays}일 이상 기록해야 인사이트가 열립니다.
      </div>
      <div className="mt-4 rounded-2xl border border-ios-sep bg-black/[0.03] px-4 py-3 text-[14px] text-ios-text">
        현재 {recordedDays}일 기록됨 · {remaining}일 더 기록하면 열려요
      </div>
      <div className="mt-4 text-[12px] text-ios-muted">
        수면/스트레스/활동/기분/낮잠/증상/카페인 중 하나라도 입력된 날짜가 기록일로 집계됩니다.
      </div>
    </div>
  );
}
