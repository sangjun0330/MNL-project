"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ToolPageShell } from "./ToolPageShell";
import { calculateGCS } from "@/lib/nurseCalculators";
import { useI18n } from "@/lib/useI18n";

const EYE_OPTIONS = [
  { value: 4, label: "4 — 자발적 개안" },
  { value: 3, label: "3 — 음성에 개안" },
  { value: 2, label: "2 — 통증에 개안" },
  { value: 1, label: "1 — 개안 없음" },
];
const VERBAL_OPTIONS = [
  { value: 5, label: "5 — 지남력 있음" },
  { value: 4, label: "4 — 혼란된 대화" },
  { value: 3, label: "3 — 부적절한 단어" },
  { value: 2, label: "2 — 이해 불능 소리" },
  { value: 1, label: "1 — 반응 없음" },
];
const MOTOR_OPTIONS = [
  { value: 6, label: "6 — 명령 수행" },
  { value: 5, label: "5 — 통증 부위 인지" },
  { value: 4, label: "4 — 회피 반응" },
  { value: 3, label: "3 — 비정상 굴곡" },
  { value: 2, label: "2 — 신전 반응" },
  { value: 1, label: "1 — 반응 없음" },
];

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  mild: { label: "경도 (13-15)", color: "text-green-600" },
  moderate: { label: "중등도 (9-12)", color: "text-yellow-600" },
  severe: { label: "중증 (3-8)", color: "text-red-600" },
};

function OptionGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-ios-text">{title}</div>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full rounded-xl px-4 py-3 text-left text-[13px] transition ${
              value === opt.value
                ? "bg-black text-white font-semibold"
                : "bg-black/5 text-ios-text hover:bg-black/8"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToolGCSPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [eye, setEye] = useState(4);
  const [verbal, setVerbal] = useState(5);
  const [motor, setMotor] = useState(6);

  const result = useMemo(() => calculateGCS({ eye, verbal, motor }), [eye, verbal, motor]);

  const handleReset = () => {
    setEye(4);
    setVerbal(5);
    setMotor(6);
  };

  return (
    <ToolPageShell title={t("GCS 의식 평가")} subtitle={t("Glasgow Coma Scale 점수 계산")} badge="NEW" embedded={embedded}>
      <div className="space-y-4">
        <Card className="p-5">
          <OptionGroup title={t("눈 반응 (E)")} options={EYE_OPTIONS} value={eye} onChange={setEye} />
        </Card>

        <Card className="p-5">
          <OptionGroup title={t("언어 반응 (V)")} options={VERBAL_OPTIONS} value={verbal} onChange={setVerbal} />
        </Card>

        <Card className="p-5">
          <OptionGroup title={t("운동 반응 (M)")} options={MOTOR_OPTIONS} value={motor} onChange={setMotor} />
        </Card>

        {result.ok && (
          <Card className="p-5">
            <div className="text-center">
              <div className="text-[13px] text-ios-sub">{t("GCS 총점")}</div>
              <div className="mt-1 text-[40px] font-extrabold tracking-tight text-ios-text">
                {result.data.total}
              </div>
              <div className={`mt-1 text-[15px] font-semibold ${SEVERITY_LABELS[result.data.severity]?.color}`}>
                {SEVERITY_LABELS[result.data.severity]?.label}
              </div>
              <div className="mt-2 text-[12px] text-ios-muted">
                E{eye} + V{verbal} + M{motor}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.warnings.map((w) => (
                  <div
                    key={w.code}
                    className={`rounded-xl px-4 py-3 text-[12px] leading-relaxed ${
                      w.severity === "critical"
                        ? "bg-red-50 text-red-700"
                        : w.severity === "warning"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {w.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        <Button variant="secondary" className="w-full" onClick={handleReset}>
          {t("초기화")}
        </Button>
      </div>
    </ToolPageShell>
  );
}
