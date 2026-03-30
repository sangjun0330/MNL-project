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
            크로노타입과 카페인 민감도를 설정하면 회복 플래너 화면 안내가 내 리듬에 더 맞게 조정됩니다.
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

      </div>
    </div>
  );
}

export default SettingsPersonalizationPage;
