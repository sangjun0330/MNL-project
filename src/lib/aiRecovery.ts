// src/lib/aiRecovery.ts
// AI 맞춤 회복 처방 생성 엔진
// - 유저의 DailyVital 데이터(수면, 근무, 카페인, 생리주기, 스트레스, 활동)를 분석
// - 카테고리별 조건부 처방을 줄글로 생성

import type { DailyVital } from "@/lib/vitals";
import type { MenstrualContext, MenstrualPhase } from "@/lib/menstrual";
import type { Shift } from "@/lib/types";
import type { Language } from "@/lib/i18n";

// ─── Types ───────────────────────────────────────────────

export type RecoveryCategory =
  | "sleep"
  | "shift"
  | "caffeine"
  | "menstrual"
  | "stress"
  | "activity";

export type RecoverySeverity = "info" | "caution" | "warning";

export type RecoverySection = {
  category: RecoveryCategory;
  severity: RecoverySeverity;
  title: string;
  description: string;
  tips: string[];
};

export type CompoundAlert = {
  factors: string[];
  message: string;
};

export type WeeklySummary = {
  avgBattery: number;
  prevAvgBattery: number;
  topDrains: { label: string; pct: number }[];
  personalInsight: string;
  nextWeekPreview: string;
};

export type AIRecoveryResult = {
  headline: string;
  compoundAlert: CompoundAlert | null;
  sections: RecoverySection[];
  weeklySummary: WeeklySummary | null;
};

// ─── Helpers ─────────────────────────────────────────────

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function shiftLabel(shift: Shift, lang: Language): string {
  const ko: Record<Shift, string> = {
    D: "데이", E: "이브닝", N: "나이트", M: "미들", OFF: "OFF", VAC: "휴가",
  };
  const en: Record<Shift, string> = {
    D: "Day", E: "Evening", N: "Night", M: "Middle", OFF: "OFF", VAC: "Vacation",
  };
  return lang === "en" ? en[shift] : ko[shift];
}

function phaseLabel(phase: MenstrualPhase, lang: Language): string {
  const ko: Record<MenstrualPhase, string> = {
    period: "생리 기간", pms: "PMS 기간", ovulation: "배란기",
    follicular: "여포기", luteal: "황체기", none: "",
  };
  const en: Record<MenstrualPhase, string> = {
    period: "Period", pms: "PMS", ovulation: "Ovulation",
    follicular: "Follicular", luteal: "Luteal", none: "",
  };
  return lang === "en" ? en[phase] : ko[phase];
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ─── Core Generator ──────────────────────────────────────

export function generateAIRecovery(
  today: DailyVital | null,
  vitals7: DailyVital[],
  prevWeekVitals: DailyVital[],
  nextShift: Shift | null,
  lang: Language = "ko",
): AIRecoveryResult {
  if (!today) {
    return {
      headline: lang === "en"
        ? "Not enough data to generate recovery prescriptions. Please record your health data."
        : "회복 처방을 생성할 데이터가 부족해요. 건강 기록을 입력해 주세요.",
      compoundAlert: null,
      sections: [],
      weeklySummary: null,
    };
  }

  const sections: RecoverySection[] = [];
  const riskFactors: string[] = [];

  // ── 1. Sleep Section ──
  const sleepSection = buildSleepSection(today, vitals7, nextShift, lang);
  if (sleepSection) sections.push(sleepSection);

  // ── 2. Shift Section ──
  const shiftSection = buildShiftSection(today, vitals7, lang);
  if (shiftSection) sections.push(shiftSection);

  // ── 3. Caffeine Section ──
  const caffeineSection = buildCaffeineSection(today, lang);
  if (caffeineSection) sections.push(caffeineSection);

  // ── 4. Menstrual Section ──
  const menstrualSection = buildMenstrualSection(today, lang);
  if (menstrualSection) sections.push(menstrualSection);

  // ── 5. Stress & Mood Section ──
  const stressSection = buildStressSection(today, vitals7, lang);
  if (stressSection) sections.push(stressSection);

  // ── 6. Activity Section ──
  const activitySection = buildActivitySection(today, lang);
  if (activitySection) sections.push(activitySection);

  // Sort by severity: warning > caution > info
  const severityOrder: Record<RecoverySeverity, number> = { warning: 0, caution: 1, info: 2 };
  sections.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // ── Compound Alert ──
  const compoundAlert = buildCompoundAlert(today, riskFactors, lang);

  // ── Headline ──
  const headline = buildHeadline(today, sections, lang);

  // ── Weekly Summary ──
  const weeklySummary = buildWeeklySummary(vitals7, prevWeekVitals, today, nextShift, lang);

  return { headline, compoundAlert, sections, weeklySummary };
}

// ─── Section Builders ────────────────────────────────────

function buildSleepSection(
  today: DailyVital,
  vitals7: DailyVital[],
  nextShift: Shift | null,
  lang: Language,
): RecoverySection | null {
  const debt = today.engine?.sleepDebtHours ?? 0;
  const sleepH = today.inputs.sleepHours ?? 0;
  const napH = today.inputs.napHours ?? 0;
  const shift = today.shift;

  // Don't show if sleep is fine
  if (debt < 2 && sleepH >= 6.5) return null;

  const severity: RecoverySeverity = debt >= 6 ? "warning" : debt >= 3 ? "caution" : "info";
  const tips: string[] = [];

  if (lang === "en") {
    // Description
    let desc = "";
    if (debt >= 4) {
      desc = `You've accumulated ${round1(debt)} hours of sleep debt. Yesterday you slept ${round1(sleepH)} hours${napH > 0 ? ` (+${round1(napH)}h nap)` : ""}. Supplemental sleep is essential today.`;
    } else if (sleepH < 6) {
      desc = `You only slept ${round1(sleepH)} hours yesterday. Your body needs more recovery time.`;
    } else {
      desc = `Your sleep debt is ${round1(debt)} hours. Maintaining good sleep is key.`;
    }

    // Tips based on next shift
    if (nextShift === "N") {
      tips.push("Try a 90-minute pre-shift nap between 2-5 PM to prepare for the night shift.");
    } else if (nextShift === "D") {
      tips.push("Aim for 7+ hours tonight. Avoid screens 30 minutes before bed.");
    } else if (nextShift === "OFF" || nextShift === "VAC") {
      tips.push(`Use this OFF day for catch-up sleep. An extra ${Math.min(2, round1(debt * 0.3))} hours can help.`);
    }

    if (debt >= 4) {
      tips.push("Recover in 90-minute sleep blocks when possible.");
    }
    if (sleepH < 5 && shift === "N") {
      tips.push("After night shift, use blackout curtains and keep room at 18-20°C for better day sleep.");
    }
    if (napH === 0 && debt >= 3) {
      tips.push("Even a 20-minute power nap can significantly improve alertness.");
    }

    return { category: "sleep", severity, title: "Sleep Recovery", description: desc, tips };
  }

  // Korean
  let desc = "";
  if (debt >= 4) {
    desc = `수면빚이 ${round1(debt)}시간 누적된 상태예요. 어제 ${round1(sleepH)}시간${napH > 0 ? `(+낮잠 ${round1(napH)}시간)` : ""} 밖에 못 잤기 때문에 오늘 보충수면이 꼭 필요합니다.`;
  } else if (sleepH < 6) {
    desc = `어제 수면이 ${round1(sleepH)}시간으로 부족한 상태예요. 몸이 더 많은 회복 시간을 필요로 하고 있어요.`;
  } else {
    desc = `수면빚이 ${round1(debt)}시간이에요. 꾸준한 수면 관리가 중요합니다.`;
  }

  if (nextShift === "N") {
    tips.push("나이트 전 오후 2-5시 사이 90분 선행수면을 자보세요.");
  } else if (nextShift === "D") {
    tips.push("오늘 밤 7시간 이상 수면을 목표로 하세요. 취침 30분 전 스크린 차단이 도움됩니다.");
  } else if (nextShift === "OFF" || nextShift === "VAC") {
    tips.push(`오늘 OFF를 활용해서 보충수면을 하세요. +${Math.min(2, round1(debt * 0.3))}시간이면 도움이 됩니다.`);
  }

  if (debt >= 4) {
    tips.push("90분 단위 수면 블록으로 보충하면 깊은 수면 효과를 얻을 수 있어요.");
  }
  if (sleepH < 5 && shift === "N") {
    tips.push("나이트 후 낮잠 시 차광커튼, 18-20도 실온, 귀마개를 활용해보세요.");
  }
  if (napH === 0 && debt >= 3) {
    tips.push("20분 파워냅이라도 집중력 회복에 큰 도움이 돼요.");
  }

  return { category: "sleep", severity, title: "수면 회복", description: desc, tips };
}

function buildShiftSection(
  today: DailyVital,
  vitals7: DailyVital[],
  lang: Language,
): RecoverySection | null {
  const shift = today.shift;
  const nightStreak = today.engine?.nightStreak ?? 0;
  const csi = today.engine?.CSI ?? 0;

  // Find tomorrow's shift from vitals or infer
  const todayIdx = vitals7.findIndex((v) => v.dateISO === today.dateISO);
  const tomorrowVital = todayIdx >= 0 && todayIdx < vitals7.length - 1
    ? vitals7[todayIdx + 1]
    : null;
  const tomorrowShift = tomorrowVital?.shift ?? null;

  // Don't show if shift impact is minimal
  if ((shift === "OFF" || shift === "VAC") && nightStreak === 0) return null;
  if (shift === "D" && nightStreak === 0 && csi < 0.2) return null;

  const severity: RecoverySeverity =
    nightStreak >= 3 ? "warning" : nightStreak >= 2 || csi >= 0.5 ? "caution" : "info";

  const tips: string[] = [];

  if (lang === "en") {
    let desc = "";
    if (nightStreak >= 2) {
      desc = `This is night shift day ${nightStreak}. Fatigue accelerates sharply from here.`;
    } else if (shift === "N") {
      desc = `Night shift today. Your circadian rhythm is under extra strain (CSI ${Math.round(csi * 100)}%).`;
    } else if (shift === "E") {
      desc = `Evening shift today. Late-ending shifts can push back your sleep time.`;
    } else {
      desc = `Shift rhythm load is at ${Math.round(csi * 100)}%. Be mindful of recovery between shifts.`;
    }

    if (nightStreak >= 2) {
      tips.push(`Watch out for the "zombie zone" (3-5 AM) — do light stretching before this window.`);
    }
    if (tomorrowShift === "OFF" && shift === "N") {
      tips.push("Tomorrow is OFF after nights: sleep 4h in the morning, then resume normal bedtime to reset your rhythm.");
    }
    if (shift === "E" && tomorrowShift === "D") {
      tips.push("Evening-to-Day quick return: prioritize at least 5 hours of core sleep tonight.");
    }

    return { category: "shift", severity, title: "Shift Adaptation", description: desc, tips };
  }

  // Korean
  let desc = "";
  if (nightStreak >= 2) {
    desc = `나이트 ${nightStreak}일차입니다. 이 시점부터 피로가 급격히 쌓이는 구간이에요.`;
  } else if (shift === "N") {
    desc = `오늘 나이트 근무예요. 생체리듬에 부담이 가는 상태입니다 (리듬 부담 ${Math.round(csi * 100)}%).`;
  } else if (shift === "E") {
    desc = `오늘 이브닝 근무예요. 퇴근이 늦어지면서 수면 시간이 밀릴 수 있어요.`;
  } else {
    desc = `교대 리듬 부담이 ${Math.round(csi * 100)}%예요. 근무 간 회복에 신경 쓰세요.`;
  }

  if (nightStreak >= 2) {
    tips.push("새벽 3-5시(좀비존)에 특히 집중력이 떨어져요. 이 시간대 전에 가벼운 스트레칭을 추천합니다.");
  }
  if (tomorrowShift === "OFF" && shift === "N") {
    tips.push("내일 OFF 전환: 오전에 짧게 4시간 자고, 저녁에 정상 시간 취침하면 리듬이 빨리 돌아와요.");
  }
  if (shift === "E" && tomorrowShift === "D") {
    tips.push("이브닝→데이 빠른 교대: 오늘 밤 최소 5시간 핵심수면을 확보하세요.");
  }

  return { category: "shift", severity, title: "교대근무 적응", description: desc, tips };
}

function buildCaffeineSection(
  today: DailyVital,
  lang: Language,
): RecoverySection | null {
  const caffeineMg = today.inputs.caffeineMg ?? 0;
  const csd = today.engine?.CSD ?? 0;
  const shift = today.shift;

  // Don't show if caffeine is minimal
  if (caffeineMg < 100 && csd < 0.15) return null;

  const severity: RecoverySeverity = csd >= 0.4 || caffeineMg >= 500 ? "warning" : caffeineMg >= 200 ? "caution" : "info";
  const tips: string[] = [];

  if (lang === "en") {
    let desc = `Today's caffeine intake: ${Math.round(caffeineMg)}mg.`;

    if (csd >= 0.3) {
      desc += ` Estimated caffeine residual at sleep time may delay falling asleep.`;
    }

    if (shift === "N") {
      tips.push("For night shifts, have your last caffeine before 3 AM to protect post-shift sleep.");
    } else if (shift === "E") {
      tips.push("For evening shifts, cut off caffeine by 7 PM.");
    } else {
      tips.push("For day shifts, avoid caffeine after 2 PM for best sleep quality.");
    }

    if (caffeineMg >= 400) {
      tips.push(`${Math.round(caffeineMg)}mg is high. Try replacing later cups with water or herbal tea.`);
    }
    if (csd >= 0.3) {
      tips.push("If you feel drowsy, try cold water on your face or light stretching instead of more caffeine.");
    }

    return { category: "caffeine", severity, title: "Caffeine Management", description: desc, tips };
  }

  // Korean
  let desc = `오늘 카페인 ${Math.round(caffeineMg)}mg 섭취했어요.`;

  if (csd >= 0.3) {
    desc += " 수면 시 잔류 카페인이 입면을 방해할 수 있어요.";
  }

  if (shift === "N") {
    tips.push("나이트 근무 시 새벽 3시 이후로는 카페인을 중단해서 퇴근 후 수면을 보호하세요.");
  } else if (shift === "E") {
    tips.push("이브닝 근무는 오후 7시 이후 카페인 컷오프를 권장합니다.");
  } else {
    tips.push("데이 근무는 오후 2시 이후 카페인을 피하는 게 수면 질에 좋아요.");
  }

  if (caffeineMg >= 400) {
    tips.push(`${Math.round(caffeineMg)}mg은 많은 편이에요. 후반 커피는 따뜻한 물이나 허브티로 대체해보세요.`);
  }
  if (csd >= 0.3) {
    tips.push("졸릴 때는 카페인 대신 찬물 세수나 가벼운 스트레칭으로 대체해보세요.");
  }

  return { category: "caffeine", severity, title: "카페인 관리", description: desc, tips };
}

function buildMenstrualSection(
  today: DailyVital,
  lang: Language,
): RecoverySection | null {
  const mc = today.menstrual;
  if (!mc.enabled) return null;

  const phase = mc.phase;
  const symptom = today.inputs.symptomSeverity ?? 0;
  const shift = today.shift;

  // Skip if phase has minimal impact
  if (phase === "follicular" || phase === "ovulation") {
    // Positive phases - show brief encouraging message
    if (lang === "en") {
      return {
        category: "menstrual",
        severity: "info",
        title: "Menstrual Cycle",
        description: `Currently in ${phaseLabel(phase, lang)} phase (Day ${mc.dayInCycle ?? "?"} of cycle). This is your energy peak period.`,
        tips: [
          "This is a good window for more intense exercise or catching up on tasks.",
          "Energy levels are naturally higher — make the most of it.",
        ],
      };
    }
    return {
      category: "menstrual",
      severity: "info",
      title: "생리주기",
      description: `현재 ${phaseLabel(phase, lang)} (주기 ${mc.dayInCycle ?? "?"}일차)예요. 에너지가 높은 구간입니다.`,
      tips: [
        "강도 높은 운동이나 밀린 일을 하기 좋은 시기예요.",
        "에너지가 자연스럽게 높은 구간이니 활용해보세요.",
      ],
    };
  }

  if (phase === "none" || phase === "luteal") {
    // Luteal: show if approaching PMS
    const pmsDays = 5; // default
    const pmsStart = mc.cycleLength - pmsDays;
    const daysToGo = pmsStart - (mc.dayIndexInCycle ?? 0);

    if (phase === "luteal" && daysToGo <= 3 && daysToGo > 0) {
      if (lang === "en") {
        return {
          category: "menstrual",
          severity: "caution",
          title: "Menstrual Cycle",
          description: `Currently in the luteal phase, with PMS expected in about ${daysToGo} day${daysToGo > 1 ? "s" : ""}. Prepare in advance.`,
          tips: [
            "Stock up on magnesium and iron-rich foods ahead of PMS.",
            "If sleep quality has been dropping, try stretching 30 minutes before bed.",
          ],
        };
      }
      return {
        category: "menstrual",
        severity: "caution",
        title: "생리주기",
        description: `현재 황체기 후반이고, ${daysToGo}일 뒤 PMS가 시작될 것으로 예상돼요. 미리 대비하세요.`,
        tips: [
          "미리 마그네슘, 철분이 풍부한 음식을 챙겨두면 PMS 증상 완화에 도움이 돼요.",
          "수면 질이 떨어지고 있다면 취침 30분 전 스트레칭을 해보세요.",
        ],
      };
    }

    return null; // No significant info for early luteal or none
  }

  // PMS or Period
  const severity: RecoverySeverity = symptom >= 2 ? "warning" : "caution";
  const tips: string[] = [];

  if (lang === "en") {
    let desc = "";
    if (phase === "pms") {
      desc = `Currently in the PMS phase (Day ${mc.dayInCycle ?? "?"} of cycle). You may feel more fatigued and sensitive.`;
    } else {
      desc = `Currently on your period (Day ${mc.dayInCycle ?? "?"} of cycle).`;
    }

    if (phase === "period" && shift === "N") {
      tips.push("Period + night shift: Keep a hot pack, warm drinks, and iron supplements ready.");
    }
    if (phase === "pms") {
      tips.push("During PMS, prioritize sleep (+30 min) and magnesium-rich foods.");
    }
    if (symptom >= 2) {
      tips.push("Symptom severity is elevated. Don't push through — rest when you can.");
    }
    if (phase === "period" && today.engine?.sleepDebtHours && today.engine.sleepDebtHours >= 3) {
      tips.push("Period + sleep deficit compounds fatigue. Even a short nap helps significantly.");
    }

    return { category: "menstrual", severity, title: "Menstrual Cycle", description: desc, tips };
  }

  // Korean
  let desc = "";
  if (phase === "pms") {
    desc = `현재 PMS 기간 (주기 ${mc.dayInCycle ?? "?"}일차)이에요. 평소보다 피로감과 예민함이 높아질 수 있어요.`;
  } else {
    desc = `현재 생리 중 (주기 ${mc.dayInCycle ?? "?"}일차)이에요.`;
  }

  if (phase === "period" && shift === "N") {
    tips.push("생리 중 나이트 근무: 핫팩, 따뜻한 음료, 철분 보충을 미리 준비하세요.");
  }
  if (phase === "pms") {
    tips.push("PMS 기간에는 수면 시간 +30분, 마그네슘이 풍부한 음식을 챙기세요.");
  }
  if (symptom >= 2) {
    tips.push("증상 강도가 높은 상태예요. 무리하지 말고 쉴 수 있을 때 쉬세요.");
  }
  if (phase === "period" && today.engine?.sleepDebtHours && today.engine.sleepDebtHours >= 3) {
    tips.push("생리 중 수면 부족은 피로를 배로 키워요. 짧은 낮잠이라도 큰 도움이 됩니다.");
  }

  return { category: "menstrual", severity, title: "생리주기", description: desc, tips };
}

function buildStressSection(
  today: DailyVital,
  vitals7: DailyVital[],
  lang: Language,
): RecoverySection | null {
  const stress = today.inputs.stress ?? 1;
  const mood = today.inputs.mood ?? today.emotion?.mood ?? 3;
  const shift = today.shift;
  const mentalBattery = today.mental.ema;

  // Count consecutive high-stress days
  const recentHighStress = vitals7.filter((v) => (v.inputs.stress ?? 1) >= 2).length;
  const recentLowMood = vitals7.filter((v) => ((v.inputs.mood ?? v.emotion?.mood ?? 3) <= 2)).length;

  // Don't show if stress and mood are fine
  if (stress <= 1 && mood >= 4 && mentalBattery >= 60) return null;

  const severity: RecoverySeverity =
    (stress >= 3 && mood <= 2) || mentalBattery < 25
      ? "warning"
      : stress >= 2 || mood <= 2 || mentalBattery < 40
        ? "caution"
        : "info";

  const tips: string[] = [];

  if (lang === "en") {
    let desc = "";
    if (recentHighStress >= 3) {
      desc = `Stress has been high for ${recentHighStress} of the last 7 days. This level of sustained stress affects recovery.`;
    } else if (mood <= 2) {
      desc = `Your mood has been low${recentLowMood >= 2 ? ` for ${recentLowMood} days recently` : ""}. Emotional recovery is also important.`;
    } else if (mentalBattery < 30) {
      desc = `Mental battery is at ${Math.round(mentalBattery)}. You're running on empty emotionally.`;
    } else {
      desc = `Stress level ${stress}/3, mood ${mood}/5. Worth paying attention to your emotional state.`;
    }

    tips.push("After your shift, take 10 minutes of complete stillness — no phone, just breathing.");
    if (shift === "N") {
      tips.push("Feeling down after night shifts is completely normal. Don't blame yourself.");
    }
    if (recentLowMood >= 3) {
      tips.push("Low mood has persisted — try noting one good thing from each day, no matter how small.");
    }
    if (mentalBattery < 25 && stress >= 2) {
      tips.push("Burnout signals detected. If possible, secure an OFF day or ask for lighter duties.");
    }

    return { category: "stress", severity, title: "Stress & Mood", description: desc, tips };
  }

  // Korean
  let desc = "";
  if (recentHighStress >= 3) {
    desc = `최근 7일 중 ${recentHighStress}일이 고스트레스 상태예요. 지속적인 스트레스는 회복력을 크게 떨어뜨립니다.`;
  } else if (mood <= 2) {
    desc = `기분이 낮은 상태${recentLowMood >= 2 ? `가 최근 ${recentLowMood}일 이어지고 있어요` : "예요"}. 감정 회복도 중요합니다.`;
  } else if (mentalBattery < 30) {
    desc = `멘탈 배터리가 ${Math.round(mentalBattery)}이에요. 감정적으로 많이 소진된 상태입니다.`;
  } else {
    desc = `스트레스 ${stress}/3, 기분 ${mood}/5 상태예요. 감정 상태에 주의를 기울여보세요.`;
  }

  tips.push("퇴근 후 10분만 아무것도 안 하는 시간을 가져보세요. 핸드폰도 잠시 내려놓기.");
  if (shift === "N") {
    tips.push("나이트 근무 후 감정이 가라앉는 건 자연스러운 현상이에요. 자책하지 마세요.");
  }
  if (recentLowMood >= 3) {
    tips.push("기분 저하가 계속되고 있어요. 매일 좋았던 순간 1가지만 기록해보는 건 어떨까요?");
  }
  if (mentalBattery < 25 && stress >= 2) {
    tips.push("번아웃 위험 신호가 감지됐어요. 가능하다면 연차나 OFF를 확보하세요.");
  }

  return { category: "stress", severity, title: "스트레스 & 감정", description: desc, tips };
}

function buildActivitySection(
  today: DailyVital,
  lang: Language,
): RecoverySection | null {
  const activity = today.inputs.activity ?? 1;
  const sleepH = today.inputs.sleepHours ?? 7;
  const shift = today.shift;
  const bodyBattery = today.body.value;

  // Don't show unless noteworthy
  if (activity <= 1 && bodyBattery >= 50 && shift !== "OFF") return null;

  const severity: RecoverySeverity =
    activity >= 3 && sleepH < 5 ? "warning" : activity >= 2 && sleepH < 6 ? "caution" : "info";

  const tips: string[] = [];

  if (lang === "en") {
    let desc = "";
    if (activity >= 3 && sleepH < 6) {
      desc = `Intense activity with only ${round1(sleepH)} hours of sleep. This combination raises injury risk.`;
    } else if (shift === "OFF" || shift === "VAC") {
      if (bodyBattery >= 70) {
        desc = "It's a rest day and your battery is good. Light to moderate exercise is fine.";
      } else if (bodyBattery >= 40) {
        desc = "Rest day but battery is moderate. Gentle activity like walking is recommended.";
      } else {
        desc = "Rest day with low battery. Keep activity very light today — recovery first.";
      }
    } else {
      desc = `Activity level is ${activity}/3 with body battery at ${Math.round(bodyBattery)}.`;
    }

    if (shift === "OFF" || shift === "VAC") {
      if (bodyBattery >= 70) tips.push("Jogging, swimming, or cycling are all great options today.");
      else if (bodyBattery >= 40) tips.push("A 30-minute walk in the sunshine would be ideal.");
      else tips.push("Light stretching only. Your body needs rest, not more load.");
    }
    if (activity >= 3 && sleepH < 6) {
      tips.push("Tone it down tomorrow. High exertion + sleep deficit = higher risk.");
    }
    return { category: "activity", severity, title: "Physical Activity", description: desc, tips };
  }

  // Korean
  let desc = "";
  if (activity >= 3 && sleepH < 6) {
    desc = `수면 ${round1(sleepH)}시간인데 활동량이 격렬했어요. 이 조합은 부상 위험을 높여요.`;
  } else if (shift === "OFF" || shift === "VAC") {
    if (bodyBattery >= 70) {
      desc = "오늘 OFF이고 배터리가 양호해요. 적당한 운동을 해도 좋은 컨디션이에요.";
    } else if (bodyBattery >= 40) {
      desc = "OFF인데 배터리가 보통이에요. 가벼운 활동 정도를 추천합니다.";
    } else {
      desc = "OFF인데 배터리가 낮아요. 오늘은 아주 가볍게만 움직이고 회복에 집중하세요.";
    }
  } else {
    desc = `활동량 ${activity}/3, 바디 배터리 ${Math.round(bodyBattery)} 상태예요.`;
  }

  if (shift === "OFF" || shift === "VAC") {
    if (bodyBattery >= 70) tips.push("조깅, 수영, 자전거 등 적극적인 운동도 괜찮은 날이에요.");
    else if (bodyBattery >= 40) tips.push("햇빛 아래 30분 산책이 가장 좋은 회복 운동이에요.");
    else tips.push("가벼운 스트레칭만 하세요. 몸에 더 부하를 주지 마세요.");
  }
  if (activity >= 3 && sleepH < 6) {
    tips.push("내일은 활동량을 줄이세요. 고강도 활동 + 수면 부족 = 부상 위험 증가.");
  }
  return { category: "activity", severity, title: "신체 활동", description: desc, tips };
}

// ─── Compound Alert ──────────────────────────────────────

function buildCompoundAlert(
  today: DailyVital,
  _riskFactors: string[],
  lang: Language,
): CompoundAlert | null {
  const factors: string[] = [];
  const nightStreak = today.engine?.nightStreak ?? 0;
  const debt = today.engine?.sleepDebtHours ?? 0;
  const phase = today.menstrual.phase;
  const stress = today.inputs.stress ?? 1;
  const bodyBattery = today.body.value;
  const mentalBattery = today.mental.ema;

  if (nightStreak >= 2) factors.push(lang === "en" ? `Night ${nightStreak}` : `나이트${nightStreak}일차`);
  if (debt >= 4) factors.push(lang === "en" ? `Sleep debt ${round1(debt)}h` : `수면빚${round1(debt)}h`);
  if (phase === "period" || phase === "pms") factors.push(lang === "en" ? phaseLabel(phase, "en") : phaseLabel(phase, "ko"));
  if (stress >= 3) factors.push(lang === "en" ? "High stress" : "고스트레스");
  if (bodyBattery < 25) factors.push(lang === "en" ? "Low body battery" : "바디배터리 위험");
  if (mentalBattery < 25) factors.push(lang === "en" ? "Low mental battery" : "멘탈배터리 위험");

  if (factors.length < 2) return null;

  const message =
    lang === "en"
      ? `${factors.length} risk factors active simultaneously. Simplify tasks and ask colleagues for support if possible.`
      : `${factors.length}가지 위험 요소가 동시에 발생했어요. 가능하다면 동료에게 서포트를 요청하고, 오늘은 루틴 업무 위주로 진행하세요.`;

  return { factors, message };
}

// ─── Headline ────────────────────────────────────────────

function buildHeadline(
  today: DailyVital,
  sections: RecoverySection[],
  lang: Language,
): string {
  const body = today.body.value;
  const mental = today.mental.ema;
  const min = Math.min(body, mental);

  // Find the top priority section
  const topSection = sections[0];

  if (min >= 70) {
    if (lang === "en") return "Your condition is stable. Keep up the good routine.";
    return "컨디션이 안정적이에요. 지금의 루틴을 유지하세요.";
  }

  if (min < 30) {
    if (lang === "en") return "Battery is critically low. Rest and recovery are the top priority today.";
    return "배터리가 위험 수준이에요. 오늘은 휴식과 회복이 최우선입니다.";
  }

  if (!topSection) {
    if (lang === "en") return "Take care of yourself today. Small recovery actions add up.";
    return "오늘도 자기 자신을 챙기세요. 작은 회복 행동이 쌓여요.";
  }

  // Construct from top priority
  const catMessages: Record<RecoveryCategory, { ko: string; en: string }> = {
    sleep: {
      ko: "수면 회복에 집중하는 게 가장 효과적이에요.",
      en: "Focusing on sleep recovery will be most effective today.",
    },
    shift: {
      ko: "교대근무 적응에 주의가 필요한 날이에요.",
      en: "Pay extra attention to shift adaptation today.",
    },
    caffeine: {
      ko: "카페인 관리가 오늘의 핵심이에요.",
      en: "Caffeine management is key today.",
    },
    menstrual: {
      ko: "생리주기를 고려한 회복이 필요해요.",
      en: "Recovery should factor in your menstrual cycle today.",
    },
    stress: {
      ko: "감정 회복에 조금 더 신경 써보세요.",
      en: "Give a bit more attention to emotional recovery today.",
    },
    activity: {
      ko: "활동량 조절이 필요한 날이에요.",
      en: "Activity adjustment is recommended today.",
    },
  };

  const msg = catMessages[topSection.category];
  return lang === "en" ? msg.en : msg.ko;
}

// ─── Weekly Summary ──────────────────────────────────────

function buildWeeklySummary(
  vitals7: DailyVital[],
  prevWeekVitals: DailyVital[],
  today: DailyVital,
  nextShift: Shift | null,
  lang: Language,
): WeeklySummary | null {
  if (vitals7.length < 3) return null;

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgBattery = Math.round(avg(vitals7.map((v) => Math.min(v.body.value, v.mental.ema))));
  const prevAvgBattery = prevWeekVitals.length >= 3
    ? Math.round(avg(prevWeekVitals.map((v) => Math.min(v.body.value, v.mental.ema))))
    : avgBattery;

  // Top drains from aggregated factors
  const aggFactors: Record<string, number> = {
    sleep: 0, stress: 0, activity: 0, shift: 0, caffeine: 0, menstrual: 0, mood: 0,
  };
  let count = 0;
  for (const v of vitals7) {
    if (v.factors) {
      for (const [k, val] of Object.entries(v.factors)) {
        aggFactors[k] = (aggFactors[k] ?? 0) + (val as number);
      }
      count++;
    }
  }
  if (count > 0) {
    for (const k of Object.keys(aggFactors)) {
      aggFactors[k] = aggFactors[k] / count;
    }
  }

  const factorLabels: Record<string, { ko: string; en: string }> = {
    sleep: { ko: "수면 부족", en: "Sleep shortage" },
    stress: { ko: "스트레스", en: "Stress" },
    activity: { ko: "활동 과부하", en: "Activity overload" },
    shift: { ko: "교대근무 리듬", en: "Shift rhythm" },
    caffeine: { ko: "카페인", en: "Caffeine" },
    menstrual: { ko: "생리주기", en: "Menstrual cycle" },
    mood: { ko: "기분 저하", en: "Low mood" },
  };

  const sorted = Object.entries(aggFactors)
    .filter(([, v]) => v > 0.01)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const topDrains = sorted.map(([k, v]) => ({
    label: lang === "en" ? factorLabels[k]?.en ?? k : factorLabels[k]?.ko ?? k,
    pct: Math.round(v * 100),
  }));

  // Personal insight - find pattern
  const napDays = vitals7.filter((v) => (v.inputs.napHours ?? 0) > 0);
  const noNapDays = vitals7.filter((v) => (v.inputs.napHours ?? 0) === 0);
  const napAvg = napDays.length >= 2 ? avg(napDays.map((v) => v.body.value)) : 0;
  const noNapAvg = noNapDays.length >= 2 ? avg(noNapDays.map((v) => v.body.value)) : 0;
  const napDiff = napAvg - noNapAvg;

  let personalInsight: string;
  if (napDays.length >= 2 && napDiff > 5) {
    personalInsight =
      lang === "en"
        ? `On days you napped, your battery was ${Math.round(napDiff)} points higher on average. Napping seems effective for you.`
        : `낮잠을 잔 날은 배터리가 평균 ${Math.round(napDiff)}점 더 높았어요. 낮잠이 당신에게 가장 효과적인 회복 수단인 것 같아요.`;
  } else {
    const offDays = vitals7.filter((v) => v.shift === "OFF" || v.shift === "VAC");
    const workDays = vitals7.filter((v) => v.shift !== "OFF" && v.shift !== "VAC");
    const offAvg = offDays.length >= 1 ? avg(offDays.map((v) => v.body.value)) : 0;
    const workAvg = workDays.length >= 1 ? avg(workDays.map((v) => v.body.value)) : 0;
    const offDiff = offAvg - workAvg;

    if (offDiff > 10) {
      personalInsight =
        lang === "en"
          ? `Your battery was ${Math.round(offDiff)} points higher on OFF days. Rest days are critical for your recovery.`
          : `OFF일의 배터리가 근무일보다 평균 ${Math.round(offDiff)}점 높았어요. 휴식일이 당신의 회복에 핵심적이에요.`;
    } else {
      personalInsight =
        lang === "en"
          ? "Keep logging daily — more data means increasingly personalized insights."
          : "매일 꾸준히 기록하면 더 정교한 개인 맞춤 인사이트를 받을 수 있어요.";
    }
  }

  // Next week preview
  const delta = avgBattery - prevAvgBattery;
  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
  let nextWeekPreview: string;

  if (lang === "en") {
    nextWeekPreview = `This week's average battery was ${avgBattery} (${deltaStr} vs last week). `;
    if (topDrains.length > 0) {
      nextWeekPreview += `The biggest recovery blocker was ${topDrains[0].label.toLowerCase()}.`;
    }
  } else {
    nextWeekPreview = `이번 주 평균 배터리는 ${avgBattery}점이에요 (지난주 대비 ${deltaStr}). `;
    if (topDrains.length > 0) {
      nextWeekPreview += `가장 큰 회복 방해 요인은 ${topDrains[0].label}이었습니다.`;
    }
  }

  return { avgBattery, prevAvgBattery, topDrains, personalInsight, nextWeekPreview };
}

// ─── Category Metadata ───────────────────────────────────

export const CATEGORY_COLORS: Record<RecoveryCategory, string> = {
  sleep: "#3B82F6",
  shift: "#8B5CF6",
  caffeine: "#1B2747",
  menstrual: "#E87485",
  stress: "#F59E0B",
  activity: "#10B981",
};

export const CATEGORY_ICONS: Record<RecoveryCategory, string> = {
  sleep: "💤",
  shift: "🔄",
  caffeine: "☕",
  menstrual: "🩷",
  stress: "🧠",
  activity: "🏃",
};
