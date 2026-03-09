"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/Segmented";
import { sanitizeInternalPath } from "@/lib/navigation";
import { useAppStore } from "@/lib/store";
import {
  caffeineSensitivityPresetDescription,
  caffeineSensitivityPresetFromValue,
  caffeineSensitivityPresetLabel,
  caffeineSensitivityValueFromPreset,
  chronotypePresetDescription,
  chronotypePresetFromValue,
  chronotypePresetLabel,
  chronotypeValueFromPreset,
  normalizeProfileSettings,
} from "@/lib/recoveryPlanner";

export function SettingsPersonalizationPage() {
  const searchParams = useSearchParams();
  const store = useAppStore();
  const profile = normalizeProfileSettings(store.settings.profile);
  const chronotype = chronotypePresetFromValue(profile.chronotype);
  const caffeineSensitivity = caffeineSensitivityPresetFromValue(profile.caffeineSensitivity);
  const backHref = sanitizeInternalPath(searchParams.get("returnTo"), "/settings");

  const chronotypeOptions = useMemo(
    () => [
      { value: "morning", label: chronotypePresetLabel("morning") },
      { value: "balanced", label: chronotypePresetLabel("balanced") },
      { value: "evening", label: chronotypePresetLabel("evening") },
    ],
    []
  );

  const caffeineOptions = useMemo(
    () => [
      { value: "low", label: caffeineSensitivityPresetLabel("low") },
      { value: "normal", label: caffeineSensitivityPresetLabel("normal") },
      { value: "high", label: caffeineSensitivityPresetLabel("high") },
    ],
    []
  );

  const plannerPreviewLines = useMemo(() => {
    const lines: string[] = [];
    if (chronotype === "morning") {
      lines.push("아침형 리듬 기준으로 나이트 전환 시 낮잠·빛 차단을 조금 더 일찍 강조합니다.");
    } else if (chronotype === "evening") {
      lines.push("저녁형 리듬 기준으로 데이 근무 전 취침을 더 앞당기도록 안내합니다.");
    } else {
      lines.push("중간형 리듬 기준으로 근무 전후 수면/빛 조절을 균형 있게 안내합니다.");
    }

    if (caffeineSensitivity === "high") {
      lines.push("카페인 컷오프 시간을 더 앞당겨 늦은 섭취 간섭을 줄이도록 반영합니다.");
    } else if (caffeineSensitivity === "low") {
      lines.push("카페인 컷오프를 약간 유연하게 보되, 근무 후반 과다 섭취는 계속 경고합니다.");
    } else {
      lines.push("일반적인 컷오프 기준으로 수면 간섭을 줄이는 방향으로 반영합니다.");
    }

    lines.push("AI 맞춤회복도 같은 설정을 기준으로 오늘 플랜의 이유를 설명합니다.");
    return lines;
  }, [caffeineSensitivity, chronotype]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link href={backHref} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text">
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">개인화</div>
      </div>

      <div className="space-y-4">
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-sub">Recovery Planner</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">회복 플래너 정밀도 높이기</div>
          <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
            크로노타입과 카페인 민감도를 설정하면 회복 플래너와 AI 맞춤회복이 내 리듬에 더 맞게 조정됩니다.
          </p>
        </div>

        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-text">크로노타입</div>
          <div className="mt-2">
            <Segmented
              value={chronotype}
              options={chronotypeOptions}
              onValueChange={(value) =>
                store.setSettings({
                  profile: {
                    ...profile,
                    chronotype: chronotypeValueFromPreset(value as "morning" | "balanced" | "evening"),
                  },
                })
              }
            />
          </div>
          <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-sub">
            {chronotypePresetDescription(chronotype)}
          </div>
        </div>

        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-text">카페인 민감도</div>
          <div className="mt-2">
            <Segmented
              value={caffeineSensitivity}
              options={caffeineOptions}
              onValueChange={(value) =>
                store.setSettings({
                  profile: {
                    ...profile,
                    caffeineSensitivity: caffeineSensitivityValueFromPreset(value as "low" | "normal" | "high"),
                  },
                })
              }
            />
          </div>
          <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-sub">
            {caffeineSensitivityPresetDescription(caffeineSensitivity)}
          </div>
        </div>

        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[13px] font-semibold text-ios-sub">Planner Preview</div>
          <div className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-ios-text">현재 설정이 반영되는 방식</div>
          <div className="mt-3 space-y-2">
            {plannerPreviewLines.map((line) => (
              <div key={line} className="rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[13px] leading-6 text-ios-sub">
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPersonalizationPage;
