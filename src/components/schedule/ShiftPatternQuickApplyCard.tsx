"use client";

import { useEffect, useMemo, useState } from "react";
import type { ISODate } from "@/lib/date";
import { useAppStore } from "@/lib/store";
import { parsePattern, applyPatternToSchedule } from "@/lib/pattern";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { useI18n } from "@/lib/useI18n";

type Mode = "overwrite" | "fill-empty";

export function ShiftPatternQuickApplyCard({ selectedISO }: { selectedISO: ISODate }) {
  const store = useAppStore();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>("fill-empty");
  const [days, setDays] = useState(60);
  const [startISO, setStartISO] = useState<ISODate>(selectedISO);

  // ✅ “현재 패턴”을 input으로 직접 수정 가능하게
  const savedPattern = store.settings.defaultSchedulePattern ?? "";
  const [patternInput, setPatternInput] = useState(savedPattern);

  const parsedPattern = useMemo(() => parsePattern(patternInput.trim()), [patternInput]);

  const modeOptions = useMemo(
    () => [
      { value: "overwrite", label: t("덮어쓰기") },
      { value: "fill-empty", label: t("빈칸만") },
    ],
    [t]
  );

  const daysOptions = useMemo(
    () => [
      { value: "30", label: t("30일") },
      { value: "60", label: t("60일") },
      { value: "90", label: t("90일") },
      { value: "180", label: t("180일") },
    ],
    [t]
  );

  useEffect(() => {
    setStartISO(selectedISO);
  }, [selectedISO]);

  const apply = () => {
    if (!parsedPattern.length) return;

    const patch = applyPatternToSchedule({
      pattern: parsedPattern,
      startISO,
      days,
      mode,
      existing: store.schedule,
    });

    store.batchSetSchedule(patch);

    // ✅ 저장: 홈/일정 공통으로 “적용 시작일 이후만” 표시되게 기준값 저장
    // (store.settings 타입에 없을 수 있어 any 처리)
    store.setSettings({
      ...(store.settings as any),
      defaultSchedulePattern: patternInput.trim(),
      schedulePatternAppliedFrom: startISO,
    } as any);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] font-semibold">{t("기본 패턴 빠른 적용")}</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">{t("선택한 날짜부터 자동 채우기")}</div>
        </div>

        {/* ✅ 여기 있던 “패턴 수정” 텍스트/링크 삭제 */}
        <div />
      </div>

      <div className="mt-4 rounded-2xl border border-ios-sep bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12.5px] text-ios-muted">{t("현재 패턴")}</div>
          <div className="text-[12px] font-semibold text-ios-muted">{t("예: D, M, E, N, OFF")}</div>
        </div>

        {/* ✅ 직접 입력 input */}
        <input
          value={patternInput}
          onChange={(e) => setPatternInput(e.target.value)}
          placeholder={t("예: D2E2N2M2OFF2")}
          className="mt-2 w-full rounded-xl border border-ios-sep bg-white px-3 py-2 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-black/10"
          inputMode="text"
          autoCapitalize="characters"
        />

        {parsedPattern.length === 0 ? (
          <div className="mt-2 text-[12.5px] text-ios-muted">{t("패턴 형식 예: D2E2N2M2OFF2")}</div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-ios-sep bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12.5px] font-semibold text-ios-muted">{t("적용 시작일")}</div>
          <button
            type="button"
            onClick={() => setStartISO(selectedISO)}
            className="rounded-full border border-ios-sep bg-white px-2 py-0.5 text-[11px] font-semibold text-ios-muted"
          >
            {t("선택일로")}
          </button>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-ios-sep bg-white px-3 py-2">
          <input
            type="date"
            value={startISO}
            onChange={(e) => setStartISO(e.target.value as ISODate)}
            className="w-full min-w-0 appearance-none bg-transparent text-[14px] font-semibold outline-none"
          />
        </div>
        <div className="mt-2 text-[12px] text-ios-muted">{t("이 날짜부터 패턴을 적용합니다.")}</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[12px] font-semibold text-ios-muted">{t("적용 방식")}</div>
          <Segmented value={mode as any} options={modeOptions as any} onChange={(v) => setMode(v as Mode)} />
        </div>

        <div>
          <div className="mb-2 text-[12px] font-semibold text-ios-muted">{t("적용 기간")}</div>
          <Segmented value={String(days) as any} options={daysOptions as any} onChange={(v) => setDays(Number(v))} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={apply} className="w-full justify-center px-3 text-center text-[12.5px]">
          {t("선택 시작일 적용")}
        </Button>
        <Button variant="secondary" onClick={() => store.setSelected(selectedISO)} className="w-full justify-center px-3 text-center text-[12.5px]">
          {t("선택일 유지")}
        </Button>
      </div>
    </Card>
  );
}
