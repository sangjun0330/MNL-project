"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate, todayISO } from "@/lib/date";
import type { Shift } from "@/lib/types";
import type { AppState } from "@/lib/model";
import type { DailyVital } from "@/lib/vitals";
import { computeVitalsRange } from "@/lib/vitals";
import { FACTOR_LABEL_KO, topFactors, type FactorKey } from "@/lib/insightsV2";
import { Segmented } from "@/components/ui/Segmented";
import { DETAIL_GRADIENTS } from "@/components/pages/insights/InsightDetailShell";

type Props = {
  state: AppState;
  pivotISO?: ISODate;
};

type Tone = "stable" | "noti" | "warning";

type Line = {
  kind: "data" | "coach";
  text: string;
};

function shiftKo(s: Shift) {
  switch (s) {
    case "D":
      return "데이";
    case "E":
      return "이브";
    case "N":
      return "나이트";
    case "M":
      return "미들";
    case "OFF":
      return "오프";
    case "VAC":
      return "휴가";
  }
}

function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function fmt1(n: number) {
  return `${Math.round(n * 10) / 10}`;
}

function pct(n01: number) {
  const v = Number.isFinite(n01) ? n01 : 0;
  return `${Math.round(v * 100)}`;
}

// pct(0..1) -> UI label
function fmtPct01(p01: number) {
  const n = Number(p01);
  if (!Number.isFinite(n) || n <= 0) return "0%";
  const v = n * 100;
  if (v > 0 && v < 1) return "<1%";
  return `${Math.round(v)}%`;
}

function hashToIndex(seed: string, mod: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, mod);
}

function pick<T>(arr: T[], seed: string) {
  if (arr.length === 0) return undefined;
  return arr[hashToIndex(seed, arr.length)];
}

function getUserSeed() {
  try {
    const key = "wnl.user.seed";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const seed = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
    localStorage.setItem(key, seed);
    return seed;
  } catch {
    return "anon";
  }
}

function toneLabel(t: Tone) {
  if (t === "warning") return "워닝(Warning)";
  if (t === "noti") return "노티(Noti)";
  return "스테이블(Stable)";
}

function toneChipCls(t: Tone) {
  if (t === "warning") return "border-[#E87485]/25 bg-[#E87485]/10 text-[#E87485]";
  if (t === "noti") return "border-[#1B2747]/20 bg-[#1B2747]/10 text-[#1B2747]";
  return "border-[#007AFF]/20 bg-[#007AFF]/10 text-[#007AFF]";
}

function barCls(t: Tone) {
  if (t === "warning") return "bg-[#E87485]";
  if (t === "noti") return "bg-[#1B2747]";
  return "bg-[#007AFF]";
}

function calcTone(v: DailyVital | null): Tone {
  if (!v) return "stable";

  const vital = Math.round((v.body.value + v.mental.ema) / 2);
  const debt = v.engine?.sleepDebtHours ?? 0;
  const csi = v.engine?.CSI ?? v.engine?.CMF ?? 0;
  const sri = v.engine?.SRI ?? v.engine?.SRS ?? 1;
  const cif = v.engine?.CIF ?? (1 - (v.engine?.CSD ?? 0));
  const slf = v.engine?.SLF ?? 0;
  const mif = v.engine?.MIF ?? 1;
  const night = v.engine?.nightStreak ?? 0;

  // deterministic thresholds
  const warn =
    vital <= 45 ||
    debt >= 7 ||
    (night >= 2 && (csi >= 0.6 || sri <= 0.55)) ||
    cif <= 0.7 ||
    slf >= 0.75 ||
    mif <= 0.75;
  if (warn) return "warning";

  const noti =
    vital <= 60 ||
    debt >= 3 ||
    csi >= 0.45 ||
    sri <= 0.7 ||
    cif <= 0.85 ||
    slf >= 0.55 ||
    mif <= 0.85;
  if (noti) return "noti";

  return "stable";
}

function cutoffForNextDuty(next: Shift) {
  // 상대 시간(사용자가 생각하는 "컷오프")
  if (next === "D") return "15:00";
  if (next === "M") return "15:30";
  if (next === "E") return "16:00";
  if (next === "N") return "01:00";
  return "14:00";
}

function getNextDuty(state: AppState, pivot: ISODate): Shift {
  const tomorrow = toISODate(addDays(fromISODate(pivot), 1)) as ISODate;
  return (state.schedule?.[tomorrow] as Shift | undefined) ?? "OFF";
}

function compactSummary(v: DailyVital | null) {
  const body = v?.body.value ?? 50;
  const mental = v?.mental.ema ?? 50;
  const vital = Math.round((body + mental) / 2);
  const debt = v?.engine?.sleepDebtHours ?? 0;
  const night = v?.engine?.nightStreak ?? 0;
  const csi = v?.engine?.CSI ?? v?.engine?.CMF ?? 0;
  const sri = v?.engine?.SRI ?? v?.engine?.SRS ?? 1;
  const cif = v?.engine?.CIF ?? (1 - (v?.engine?.CSD ?? 0));
  const slf = v?.engine?.SLF ?? 0;
  const mif = v?.engine?.MIF ?? 1;
  return { body, mental, vital, debt, night, csi, sri, cif, slf, mif };
}

function scheduleSignature(state: AppState, pivot: ISODate) {
  // 사용자/개인별 문구 다양화를 위한 "근무 패턴" 시그니처
  const base = fromISODate(pivot);
  const s: string[] = [];
  for (let i = -7; i <= 7; i++) {
    const iso = toISODate(addDays(base, i)) as ISODate;
    const v = (state.schedule?.[iso] as Shift | undefined) ?? "-";
    s.push(v);
  }
  return s.join("|");
}

function data(text: string): Line {
  return { kind: "data", text };
}
function coach(text: string): Line {
  return { kind: "coach", text };
}

function buildOrderLines(opts: {
  nextDuty: Shift;
  key: FactorKey;
  tone: Tone;
  v: DailyVital | null;
  seed: string;
}): Line[] {
  const { nextDuty, key, tone, v, seed } = opts;

  const s = compactSummary(v);
  const cafCut = cutoffForNextDuty(nextDuty);
  const highDebt = s.debt >= 5;
  const mildDebt = s.debt >= 2.5;
  const lowSri = s.sri <= 0.6;
  const lowCif = s.cif <= 0.75;
  const highCsi = s.csi >= 0.6;
  const night2 = s.night >= 2;

  const micro = [
    coach("2분만 투자해요. 물 5모금 + 어깨 10회 + 호흡 6회면 스테이블 유지에 충분해요."),
    coach("‘크게’보다 ‘짧게 여러 번’이 듀티에서 더 안전해요."),
    coach("지금은 완벽보다 지속입니다. 70%만 해도 충분해요."),
    coach("실수 방지는 컨디션 관리가 반입니다. 체크리스트를 더 믿어도 돼요."),
    coach("하나만 고를까요? 물/빛/짧은 낮잠 중 1개만 챙겨요."),
    coach("오늘은 ‘버티기 루틴’이 정답이에요. 어렵게 만들지 말아요."),
    coach("30초만: 턱 힘 풀고, 어깨 내리고, 숨을 길게 내쉬어봐요."),
    coach("멘탈 배터리는 ‘과제 줄이기’로도 올라가요. 3개만 남겨요."),
    coach("가능한 만큼만 해요. 작은 성공이 회복을 빠르게 만듭니다."),
    coach("듀티 전에는 마음을 달래는 게 먼저예요. 호흡 6회만 해요."),
    coach("리듬은 빛이 결정해요. 아침/저녁 빛만 조절해도 달라져요."),
    coach("카페인은 ‘시간’이 약이에요. 컷오프만 지켜요."),
    coach("먹는 건 가볍게 자주가 스테이블합니다. 과식은 피로를 키워요."),
    coach("10분 걷기만 해도 멘탈이 리셋돼요. 샤워 대신 걷기도 좋아요."),
    coach("오늘은 몸이 말해요. 무리하지 말고 회복을 당겨요."),
    coach("지금 필요한 건 의지가 아니라 환경이에요. 조도/소음부터 줄여요."),
    coach("짧게 리셋하고 다시 가요. 60초 브레이크는 충분히 가치 있어요."),
    coach("듀티는 마라톤이에요. 초반 페이스를 낮춰도 괜찮아요."),
    coach("불안하면 손부터 풀어요. 손가락/손목 스트레칭 30초 해요."),
    coach("오늘은 ‘안전하게 버티기’가 목표예요. 스스로를 탓하지 말아요."),
    coach("지금은 컨디션 저장 모드. 작게 지켜도 충분히 좋은 날이에요."),
    coach("오늘의 목표는 ‘과소모 방지’예요. 에너지 낭비만 줄여요."),
    coach("루틴은 단순할수록 지속돼요. 1~2개만 고정해요."),
    coach("몸의 신호가 우선이에요. 속도보다 안정이 중요해요."),
    coach("타이밍만 지켜도 절반은 성공이에요. 컷오프/빛 타이밍만 챙겨요."),
    coach("짧게 리셋하고 다시 가요. 30~60초도 충분합니다."),
    coach("잘할 필요 없어요. 덜 지치면 오늘은 성공입니다."),
    coach("오늘은 ‘쉬운 버전’으로. 난이도를 낮추는 게 전략이에요."),
    coach("듀티 전후 루틴을 하나만 고정해요. 하나면 충분해요."),
    coach("지금 할 수 있는 만큼만. 작은 실행이 다음을 바꿔요."),
    coach("몸이 피곤하면 마음도 흔들려요. 호흡부터 안정시켜요."),
    coach("긴장 풀기: 턱/어깨/손 힘만 빼도 숨이 길어져요."),
    coach("수분은 빠른 회복 버튼이에요. 물 5모금만 먼저."),
    coach("걷기 5분이면 리듬이 바뀝니다. 아주 짧게라도 움직여요."),
    coach("오늘은 ‘유지’가 최고예요. 무리하지 마요."),
    coach("리듬이 핵심이에요. 조도/빛만 조절해도 달라져요."),
  ];

  const dutyHint: Record<Shift, Line[]> = {
    D: [
      data("내일 데이 듀티입니다."),
      coach("기상/취침을 30분만 당겨봐요. 내일이 훨씬 쉬워져요."),
    ],
    M: [
      data("내일 미들 듀티입니다."),
      coach("오전 리듬을 유지하고, 늦은 카페인만 줄여도 쉬워집니다."),
    ],
    E: [
      data("내일 이브 듀티입니다."),
      coach("오전은 ‘리듬 당기기’가 핵심이에요. 빛/가벼운 활동을 조금만 해요."),
    ],
    N: [
      data("내일 나이트 듀티입니다."),
      coach("출근 전 코어 수면(90분) 또는 낮잠+휴식으로 준비해요."),
    ],
    OFF: [
      data("내일 오프 듀티입니다."),
      coach("오프는 회복을 ‘쌓는 날’이에요. 수면/빛/걷기만 챙겨요."),
    ],
    VAC: [
      data("내일 휴가입니다."),
      coach("휴가는 회복을 ‘쌓는 날’이에요. 수면/빛/가벼운 걷기만 챙겨요."),
    ],
  };

  const base: Record<FactorKey, Line[]> = {
    sleep: [
      data(`수면부채 ${fmt1(s.debt)}h입니다.`),
      highDebt
        ? data("오늘은 회복 우선입니다. 수면 블록을 1개 확보해야 합니다.")
        : mildDebt
          ? data("부채가 누적 중입니다. 짧게라도 회복을 보강합니다.")
          : data("수면부채는 경미합니다. 리듬/카페인을 같이 정리합니다."),
      coach(highDebt ? "20분 낮잠 1회 + 취침 루틴을 단순화해요." : "15~25분 파워낮잠 1회면 듀티가 덜 힘들어요."),
      coach(lowSri ? "취침 30분 전: 조도↓/샤워/호흡으로 SRI를 끌어올려요." : "루틴을 고정하면 회복이 스테이블해져요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:sleep:${nextDuty}:${tone}`, micro.length)],
    ],
    stress: [
      data("스트레스 부하가 높습니다."),
      data("오늘은 처리량을 줄이고 실수 방지에 초점을 둡니다."),
      coach("해야 할 일은 3개만 남기고 나머지는 내일로 넘겨요."),
      coach("2~3시간마다 60초 마이크로 브레이크(어깨/목) 가져보세요."),
      coach("한 문장만 공유해요. 감정 정리가 빨라져요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:stress:${nextDuty}:${tone}`, micro.length)],
    ],
    activity: [
      data("활동량 밸런스가 깨져 있습니다."),
      data("강도보다 빈도가 중요합니다."),
      coach("10~15분 가벼운 걷기만 해도 바이탈이 올라가요."),
      coach("‘운동’보다 ‘순환’에 집중해요. 과훈련은 금지예요."),
      coach("퇴근 후 5분 스트레칭(종아리/햄스트링)만 해도 충분해요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:activity:${nextDuty}:${tone}`, micro.length)],
    ],
    shift: [
      data("근무 리듬 변동이 큽니다."),
      data(highCsi ? "리듬 부담(CSI)이 높습니다." : "리듬 부담(CSI)은 중간입니다."),
      coach(highCsi ? "빛 타이밍을 고정해요. 아침 밝게/저녁 어둡게가 핵심이에요." : "기상 시간을 30분 단위로 고정해봐요."),
      coach(night2 ? "연속 나이트 구간이면 ‘회복 우선 + 업무 최소화’로 가요." : "듀티 전후 루틴을 고정하면 소모가 줄어요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:shift:${nextDuty}:${tone}`, micro.length)],
    ],
    caffeine: [
      data(`카페인 영향(CIF)이 ${pct(clamp(s.cif, 0, 1))}% 수준입니다.`),
      data(lowCif ? "카페인 간섭이 커 수면 회복을 방해합니다." : "카페인 간섭은 관리 가능한 범위입니다."),
      coach(`카페인 컷오프는 ${cafCut} 권장해요.`),
      coach("초반엔 OK, 후반엔 줄여요. ‘시간’이 약이에요."),
      coach("물을 먼저 채우고, 필요할 때만 소량으로 가요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:caffeine:${nextDuty}:${tone}`, micro.length)],
    ],
    menstrual: [
      data("컨디션 변동은 주기 영향이 포함됩니다."),
      data("오늘은 난이도를 낮춰 안정화합니다."),
      coach("따뜻함/수분/가벼운 스트레칭이 도움이 돼요."),
      coach("통증 신호가 있으면 회복을 최우선으로 가져가요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:menstrual:${nextDuty}:${tone}`, micro.length)],
    ],
    mood: [
      data("기분 저하가 회복을 느리게 만듭니다."),
      data("오늘은 멘탈 배터리 보호가 우선입니다."),
      coach("작은 성공 1개만 만들어요. 난이도를 낮추는 게 전략이에요."),
      coach("10분 산책/샤워/정리 중 하나만 해도 분위기가 바뀌어요."),
      coach("누구에게든 한 문장만 공유해봐요. 생각이 정리돼요."),
      ...dutyHint[nextDuty],
      micro[hashToIndex(`${seed}:mood:${nextDuty}:${tone}`, micro.length)],
    ],
  };

  const lines = base[key] ?? [...dutyHint[nextDuty], micro[hashToIndex(`${seed}:default:${nextDuty}:${tone}`, micro.length)]!];
  if (tone === "warning") return lines.slice(0, 5);
  if (tone === "noti") return lines.slice(0, 6);
  return lines.slice(0, 7);
}

function oneLinerForDriver(opts: {
  nextDuty: Shift;
  key: FactorKey;
  tone: Tone;
  v: DailyVital | null;
  seed: string;
}): { title: string; line: Line } {
  const { nextDuty, key, tone, v, seed } = opts;
  const s = compactSummary(v);

  const t = FACTOR_LABEL_KO[key] ?? "요인";

  const pool: Line[] = [];
  const cafCut = cutoffForNextDuty(nextDuty);

  if (key === "sleep") {
    pool.push(
      data(`수면부채 ${fmt1(s.debt)}h입니다. 오늘은 낮잠 15~25분 1회가 효율적입니다.`),
      data(`수면회복(SRI) ${pct(s.sri)}%입니다. 취침 전 루틴을 고정해 회복을 올립니다.`),
      coach("오늘은 잠을 ‘길게’보다 ‘잘’ 자는 쪽으로 가요. 조도/샤워/호흡만 지켜요."),
      coach("내일 듀티를 위해 수면을 30~60분만 늘려봐요. 체감이 커요."),
    );
  }

  if (key === "caffeine") {
    pool.push(
      data(`카페인 간섭(CIF) ${pct(s.cif)}% · CIF가 낮을수록 수면 회복이 떨어집니다. 컷오프는 ${cafCut} 권장합니다.`),
      data(`CIF 관리가 수면회복(SRI)을 좌우합니다. 오늘은 시간 조절이 핵심입니다.`),
      coach("카페인은 ‘초반에만’ 써요. 후반엔 물로 버텨봐요."),
      coach("한 잔을 줄이는 것보다, 시간을 당기는 게 더 좋아요."),
    );
  }

  if (key === "shift") {
    pool.push(
      data(`리듬(CSI) ${pct(s.csi)}%입니다. 빛 노출 타이밍이 중요합니다.`),
      data("근무 변동이 크면 리듬을 고정해야 합니다. 기상 시간을 30분 단위로 맞춥니다."),
      coach("아침 밝게/저녁 어둡게만 챙겨도 스테이블해져요."),
      coach("듀티 전후 루틴을 하나만 고정해요. 샤워 → 조도↓ → 호흡 6회."),
    );
  }

  if (key === "stress") {
    pool.push(
      data("업무 스트레스 비중이 큽니다. 오늘은 처리량을 줄입니다."),
      data("실수 방지는 컨디션 관리가 반입니다. 체크리스트를 강화합니다."),
      coach("해야 할 일은 3개만 남기고 나머지는 내일로 넘겨요."),
      coach("60초 브레이크를 3번 넣으면 멘탈 배터리가 지켜져요."),
    );
  }

  if (key === "activity") {
    pool.push(
      data("활동량이 부족/과다로 흔들립니다. 강도보다 빈도로 보정합니다."),
      data("10~15분 가벼운 걷기만으로도 회복이 시작됩니다."),
      coach("운동 대신 순환이에요. 걷기/계단 1~2층 정도만 해요."),
      coach("퇴근 후 5분 스트레칭만 해도 몸이 가벼워져요."),
    );
  }

  if (key === "mood") {
    pool.push(
      data("기분 저하가 회복을 늦춥니다. 오늘은 난이도를 낮춥니다."),
      data("멘탈 배터리를 먼저 보호합니다. 작은 성공을 만듭니다."),
      coach("10분 산책/샤워/정리 중 하나만 해도 분위기가 바뀌어요."),
      coach("누구에게든 한 문장만 공유해봐요. 감정 정리가 빨라져요."),
    );
  }

  if (key === "menstrual") {
    pool.push(
      data("주기 영향이 포함됩니다. 회복 우선순위를 높입니다."),
      coach("오늘은 ‘버티기 루틴’만 유지해도 충분해요. 따뜻함/수분부터 챙겨요."),
    );
  }

  if (pool.length === 0) {
    pool.push(data("오늘은 회복을 우선합니다."), coach("한 가지 루틴만 고정해봐요."));
  }

  const line = pick(pool, `${seed}:one:${key}:${tone}:${nextDuty}`) ?? pool[0];
  return { title: t, line };
}

function dutyProtocol(next: Shift, tone: Tone, v: DailyVital | null, seed: string) {
  const s = compactSummary(v);

  const highDebt = s.debt >= 5;
  const lowCif = s.cif <= 0.75;
  const highRhythm = s.csi >= 0.6;
  const lowSleepRecv = s.sri <= 0.6;

  const cafCut = cutoffForNextDuty(next);

  const basePre = [
    `카페인 컷오프는 ${cafCut} 권장합니다.`,
    "물 300~500ml로 시작합니다.",
    "출근 전 3분 스트레칭(목/흉추/햄스트링) 합니다.",
  ];
  const baseOn = [
    "초반은 속도보다 실수 방지에 초점을 둡니다.",
    "식사는 과식보다 ‘가볍게 자주’가 스테이블합니다.",
    "2~3시간마다 60초 마이크로 브레이크(어깨/목) 합니다.",
  ];
  const basePost = [
    "퇴근 직후 10분만 정리(샤워/환기)로 ‘종료 신호’를 줍니다.",
    "취침 30분 전: 밝은 화면/강한 자극을 줄입니다.",
  ];

  const rotate = (arr: string[], salt: string) => {
    const k = hashToIndex(`${seed}:${salt}`, Math.max(1, arr.length));
    return [...arr.slice(k), ...arr.slice(0, k)];
  };

  const pre = rotate([...basePre], `pre:${next}:${tone}`);
  const on = rotate([...baseOn], `on:${next}:${tone}`);
  const post = rotate([...basePost], `post:${next}:${tone}`);

  if (next === "E") {
    pre.unshift(
      highDebt ? "출근 전 20분 낮잠 또는 60~90분 코어 수면을 고려합니다." : "출근 전 20분 낮잠은 컨디션 유지에 좋습니다."
    );
    if (highRhythm) pre.unshift("오전엔 자연광/밝은 조명을 충분히 받아 리듬(CSI)을 당깁니다.");
    else pre.unshift("아침 산책 10분이면 리듬 유지에 도움됩니다.");

    post.unshift(tone === "warning" ? "퇴근 후 바로 수면 모드로 전환합니다. 회복이 최우선입니다." : "퇴근 후 30분은 완전 휴식으로 비워둡니다.");
    post.unshift(lowSleepRecv ? "샤워→호흡→암실 루틴으로 수면회복(SRI)을 끌어올립니다." : "수면 전 루틴을 고정하면 회복이 안정적입니다.");
  } else if (next === "D") {
    pre.unshift(highDebt || lowSleepRecv ? "오늘은 15~25분 파워낮잠 1회가 효과적입니다." : "낮잠은 15~20분 이내로 짧게 가져갑니다.");
    pre.unshift(highRhythm ? "저녁 빛 노출을 줄이고, 아침엔 밝은 빛을 5~10분 받습니다." : "기상 시간을 고정하면 스테이블 유지에 유리합니다.");

    on.unshift("오전엔 루틴/정확도 높은 업무부터 처리합니다.");
    post.unshift(tone === "warning" ? "퇴근 후 약속은 최소화합니다. 오늘은 회복 우선입니다." : "퇴근 후엔 일정 1개만 남기고 여백을 확보합니다.");
    post.unshift(lowCif ? "오늘은 카페인 추가 섭취를 줄여 수면 퀄리티를 지킵니다." : "카페인은 늦게 추가하지 않습니다.");
  } else if (next === "N") {
    pre[0] = `카페인은 초반에만, 컷오프는 ${cafCut} 권장합니다.`;
    pre.unshift(highDebt ? "출근 전 90분 코어 수면(또는 20~30분 낮잠+20분 휴식)을 추천합니다." : "출근 전 20~30분 낮잠은 야간 집중력에 좋습니다.");
    pre.unshift(s.night >= 2 ? "연속 나이트 구간입니다. 오늘은 ‘업무 최소화 + 회복 극대화’로 갑니다." : "나이트는 리듬 소모가 커서 준비 루틴이 중요합니다.");

    on.unshift("00~03시는 코어 업무/체크리스트 위주로 운영합니다.");
    on.unshift("03시 이후는 ‘실수 방지 모드’로 더블체크를 한 번 더 합니다.");

    post.unshift("퇴근 후 햇빛 노출은 최소화하고, 집에서는 조도를 낮춥니다.");
    post.unshift(lowCif ? "오늘은 추가 카페인을 끊어 낮 수면을 지킵니다." : "카페인은 더 넣지 않습니다.");
  } else {
    // OFF/VAC
    pre.unshift("오프/휴가 듀티입니다. 회복을 ‘쌓는 날’로 잡습니다.");
    pre.unshift(highDebt ? "오늘은 7.5~9.0시간 수면 확보가 우선입니다." : "수면 시간을 30~60분만 늘려도 회복이 체감됩니다.");

    on.unshift("햇빛 10분 + 가벼운 걷기 15분이면 리듬이 스테이블해집니다.");
    post.unshift("내일을 위해 취침 시간을 ‘조금만’ 당깁니다.");
  }

  // 워닝이면 한 단계 더 단순화
  const cap = tone === "warning" ? 4 : tone === "noti" ? 5 : 6;
  return {
    pre: pre.slice(0, cap),
    on: on.slice(0, cap),
    post: post.slice(0, cap),
  };
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex w-fit min-w-max shrink-0 items-center justify-center rounded-full border border-ios-sep bg-white/80 px-3 py-1.5 text-[12.5px] font-semibold leading-none",
        "whitespace-nowrap",
        className
      )}
    >
      {children}
    </div>
  );
}

function Card({
  title,
  right,
  children,
  accent = "mint",
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  accent?: keyof typeof DETAIL_GRADIENTS;
}) {
  return (
    <div className="relative overflow-hidden rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
      <div className="pointer-events-none absolute inset-0 opacity-55" style={{ backgroundImage: DETAIL_GRADIENTS[accent] }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-bold tracking-[-0.01em] text-ios-text">{title}</div>
        </div>
        {right}
      </div>
      <div className="relative mt-3">{children}</div>
    </div>
  );
}

function Surface({
  children,
  accent = "mint",
  className,
}: {
  children: React.ReactNode;
  accent?: keyof typeof DETAIL_GRADIENTS;
  className?: string;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-apple border border-ios-sep bg-white/90 p-4 shadow-apple-sm", className)}
    >
      <div className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: DETAIL_GRADIENTS[accent] }} />
      <div className="relative">{children}</div>
    </div>
  );
}

export function useRecoveryPlanData(state: AppState, pivotISO?: ISODate, variant = 0) {
  const pivot = (pivotISO ?? todayISO()) as ISODate;
  const nextDuty = useMemo(() => getNextDuty(state, pivot), [state, pivot]);
  const sig = useMemo(() => scheduleSignature(state, pivot), [state, pivot]);

  const { todayVital, rangeVitals } = useMemo(() => {
    const start = toISODate(addDays(fromISODate(pivot), -3)) as ISODate;
    const end = toISODate(addDays(fromISODate(pivot), 7)) as ISODate;
    const vitals = computeVitalsRange({ state, start, end });
    const todayVital = vitals.find((x) => x.dateISO === pivot) ?? null;
    return { todayVital, rangeVitals: vitals };
  }, [state, pivot]);

  const tone = useMemo(() => calcTone(todayVital), [todayVital]);
  const s = useMemo(() => compactSummary(todayVital), [todayVital]);

  const userSeed = useMemo(() => getUserSeed(), []);

  const seed = useMemo(() => {
    const vSig = `${Math.round(s.vital)}|${Math.round(s.debt * 10)}|${Math.round(s.csi * 100)}|${Math.round(
      s.cif * 100
    )}|${Math.round(s.sri * 100)}|${s.night}`;
    return `${userSeed}|${pivot}|${nextDuty}|${tone}|${sig}|${vSig}|${variant}`;
  }, [userSeed, pivot, nextDuty, tone, sig, s, variant]);

  const factorSource = useMemo(() => {
    if (todayVital) return [todayVital];
    return rangeVitals;
  }, [todayVital, rangeVitals]);

  const top2 = useMemo(() => {
    if (!factorSource.length) return [] as Array<{ key: FactorKey; label: string; pct: number }>;
    const t = topFactors(factorSource, 2);
    return t.map((x) => ({ key: x.key as FactorKey, label: x.label, pct: x.pct }));
  }, [factorSource]);

  const top3 = useMemo(() => {
    if (!factorSource.length) return [] as Array<{ key: FactorKey; label: string; pct: number }>;
    const t = topFactors(factorSource, 3);
    return t.map((x) => ({ key: x.key as FactorKey, label: x.label, pct: x.pct }));
  }, [factorSource]);

  const orders = useMemo(() => {
    return top3.map((x, i) => {
      const lines = buildOrderLines({ nextDuty, key: x.key as FactorKey, tone, v: todayVital, seed: `${seed}:order:${i}` });
      return { ...x, rank: i + 1, lines };
    });
  }, [top3, nextDuty, tone, todayVital, seed]);

  const orderOneLiners = useMemo(() => {
    return top3.map((x, i) => {
      const res = oneLinerForDriver({ nextDuty, key: x.key as FactorKey, tone, v: todayVital, seed: `${seed}:ol:${i}` });
      return { ...x, ...res, rank: i + 1 };
    });
  }, [top3, nextDuty, tone, todayVital, seed]);

  const stablePlanByHorizon = useMemo(() => {
    const base72h = [
      "오늘 밤 수면을 +30~60분 확보합니다.",
      "카페인 컷오프를 지켜 간섭(CIF)을 낮춥니다.",
      "빛 노출 타이밍(밝게/어둡게)을 고정해 리듬(CSI)을 안정화합니다.",
      "2~3시간마다 60초 마이크로 브레이크로 멘탈 배터리를 보호합니다.",
      "식사는 가볍게 자주(단백질/수분 우선)로 혈당 변동을 줄입니다.",
      "가능하면 샤워/환기/조도↓로 ‘종료 신호’를 고정합니다.",
      "내일 듀티 전 15~25분 낮잠 1회로 안전 마진을 만듭니다.",
    ];
    const base7d = [
      "기상 시간을 30분 단위로 고정해 리듬을 만듭니다.",
      "주 3회, 10~15분 가벼운 걷기(과훈련 금지)로 회복을 돕습니다.",
      "카페인 섭취 시간을 10~20% 당겨 잔존을 줄입니다.",
      "수면 전 루틴(조도↓/샤워/호흡)을 7일 고정합니다.",
      "워닝이 잦으면 듀티 사이 ‘회복 블록’을 1개 확보합니다.",
      "야식/단 음식은 줄이고 단백질/수분을 우선합니다.",
      "연속 나이트 구간은 계획을 줄이고 회복을 늘립니다.",
    ];

    const rotate = (list: string[], key: string) => {
      const k = hashToIndex(`${seed}:stable:${key}`, list.length);
      const rotated = [...list.slice(k), ...list.slice(0, k)];
      return rotated.slice(0, 4);
    };

    return {
      "72h": rotate(base72h, "72h"),
      "7d": rotate(base7d, "7d"),
    } as const;
  }, [seed]);

  const extraDutyRoutine = useMemo(() => {
    const set = [
      "1분 루틴: 물 5모금 → 어깨 10회 롤링 → 심호흡 6회",
      "2분 루틴: 종아리 펌핑 20회 → 목/흉추 스트레칭 30초",
      "30초 루틴: 오늘 잘한 1개만 적고 끝내요(멘탈 리셋)",
      "90초 루틴: 눈 감고 호흡 6회 + 턱/어깨 힘 풀기",
      "2분 루틴: 손 씻는 동안 4-6 호흡(4초 들숨/6초 날숨)",
      "1분 루틴: 물 → 하품 1회 → 눈 스트레칭 10초",
      "2분 루틴: 벽 기대기 30초 + 햄스트링 늘리기 30초",
      "60초 루틴: 손목/손가락 스트레칭 + 어깨 내리기",
      "1분 루틴: ‘지금 할 1개’만 적고 나머지는 보류(인지 부하↓)",
      "90초 루틴: 복식호흡 5회 + 어깨/승모근 풀기",
    ];
    const k = hashToIndex(`${seed}:extra`, set.length);
    const a = set[k % set.length];
    const b = set[(k + 3) % set.length];
    return [a, b];
  }, [seed]);

  const toneHeadline = useMemo(() => {
    const head = {
      stable: [
        data("컨디션은 스테이블합니다."),
        data("바이탈은 안정 구간입니다."),
        data("오늘은 유지 전략이 유리합니다."),
        data("오늘은 안정 구간입니다. 큰 변화 없이 유지해요."),
        data("컨디션은 괜찮습니다. 루틴만 고정하면 됩니다."),
        data("스테이블 유지가 핵심입니다."),
        data("오늘은 무리하지 말고 유지에 집중해요."),
        data("리듬은 안정적입니다. 작은 조정만 하면 충분해요."),
      ],
      noti: [
        data("노티(Noti)입니다. 컨디션 보정이 필요합니다."),
        data("스테이블이지만 흔들림이 있습니다."),
        data("회복 입력이 필요한 구간입니다."),
        data("작은 흔들림이 있습니다. 가볍게 보정합니다."),
        data("컨디션이 흔들리는 구간입니다. 회복 입력이 필요해요."),
        data("아슬아슬 구간입니다. 회복에 조금 더 투자해요."),
        data("유지보다는 보정이 필요한 날입니다."),
      ],
      warning: [
        data("워닝(Warning)입니다. 회복 우선으로 갑니다."),
        data("리스크가 높습니다. 부담을 줄입니다."),
        data("오늘은 회복을 최우선으로 합니다."),
        data("위험 구간입니다. 회복 우선으로 전환합니다."),
        data("컨디션이 크게 흔들립니다. 난이도를 낮춥니다."),
        data("오늘은 안전 모드로 운영합니다."),
        data("과부하 신호입니다. 회복이 최우선입니다."),
      ],
    }[tone];

    const tail = {
      stable: [
        coach("내일 듀티를 위해 ‘작게 고정’만 해도 충분해요."),
        coach("오늘은 무리하지 말고, 유지 루틴으로 가요."),
        coach("작은 루틴만 지켜도 내일이 쉬워져요."),
        coach("가볍게 유지하면 다음 듀티가 편해집니다."),
        coach("한 가지 루틴만 고정해도 충분해요."),
      ],
      noti: [
        coach("조금만 조정해도 내일 듀티가 쉬워져요."),
        coach("어렵게 말고, 하나만 선택해요."),
        coach("작게 조정해도 체감이 큽니다."),
        coach("오늘은 회복 입력을 조금만 추가해요."),
        coach("하나만 고정해도 흔들림이 줄어요."),
      ],
      warning: [
        coach("오늘은 난이도를 낮추고, 실수 방지 모드로 가요."),
        coach("지금은 회복이 업무의 일부예요. 괜찮아요."),
        coach("최소 루틴만 지키면 충분합니다."),
        coach("오늘은 ‘안전하게 버티기’가 목표예요."),
        coach("회복이 먼저예요. 여백을 확보해요."),
      ],
    }[tone];

    const h = pick(head, `${seed}:head`) ?? head[0];
    const t = pick(tail, `${seed}:tail`) ?? tail[0];
    return { h, t };
  }, [tone, seed]);

  const mustWatch = useMemo(() => {
    const items: Array<{ label: string; value: string; kind: Tone | "info" }> = [];
    items.push({ label: "바이탈", value: String(s.vital), kind: tone });
    items.push({ label: "수면부채", value: `${fmt1(s.debt)}h`, kind: s.debt >= 5 ? "warning" : s.debt >= 3 ? "noti" : "info" });
    items.push({ label: "SRI", value: `${pct(s.sri)}%`, kind: s.sri <= 0.6 ? "noti" : "info" });
    items.push({ label: "CSI", value: `${pct(s.csi)}%`, kind: s.csi >= 0.6 ? "warning" : s.csi >= 0.45 ? "noti" : "info" });
    items.push({ label: "CIF", value: `${pct(s.cif)}%`, kind: s.cif <= 0.75 ? "noti" : "info" });
    items.push({ label: "내일 듀티", value: shiftKo(nextDuty), kind: "info" });
    if (s.night > 0) items.push({ label: "연속 나이트", value: `${s.night}회`, kind: s.night >= 2 ? "warning" : "noti" });
    return items;
  }, [s, tone, nextDuty]);

  return {
    pivot,
    nextDuty,
    todayVital,
    tone,
    s,
    seed,
    top2,
    top3,
    orders,
    orderOneLiners,
    stablePlanByHorizon,
    extraDutyRoutine,
    toneHeadline,
    mustWatch,
  };
}

function LineText({ l }: { l: Line }) {
  return (
    <span className={cn("text-[13px] leading-relaxed", l.kind === "data" ? "text-ios-text" : "text-ios-sub")}>
      {l.text}
    </span>
  );
}

function buildActionCard(key: FactorKey, nextDuty: Shift, tone: Tone, v: DailyVital | null, seed: string): { title: string; bullets: string[] } {
  const s = compactSummary(v);
  const cafCut = cutoffForNextDuty(nextDuty);

  const bullets: string[] = [];

  if (key === "sleep") {
    bullets.push(s.debt >= 5 ? "회복 우선: 수면 블록 1개 확보(코어 60~90분 또는 낮잠 20분)" : "짧게 보강: 낮잠 15~25분 1회");
    bullets.push(s.sri <= 0.6 ? "취침 전 루틴: 조도↓ → 샤워 → 호흡 6회" : "취침 전 루틴을 고정해 SRI 유지");
  } else if (key === "caffeine") {
    bullets.push(`컷오프 ${cafCut} 권장(CIF 유지)`);
    bullets.push("초반 소량 OK / 후반 물·가벼운 간식으로 스테이블 유지");
  } else if (key === "shift") {
    bullets.push(s.csi >= 0.6 ? "리듬 부담↑: 아침 밝게/저녁 어둡게를 강하게" : "기상 시간을 30분 단위로 고정");
    bullets.push("듀티 전후 루틴 1개만 고정(샤워→조도↓→호흡)");
  } else if (key === "stress") {
    bullets.push("업무 난이도 낮추기: 오늘 할 일 3개만 남기기");
    bullets.push("2~3시간마다 60초 마이크로 브레이크(어깨/목)");
  } else if (key === "activity") {
    bullets.push("강도 X / 빈도 O: 걷기 10~15분(과훈련 금지)");
    bullets.push("퇴근 후 스트레칭 3~5분(종아리/햄스트링)");
  } else if (key === "mood") {
    bullets.push("작은 성공 1개 만들기(난이도 낮추기)");
    bullets.push("10분 산책/샤워/정리 중 1개만 선택");
  } else if (key === "menstrual") {
    bullets.push("따뜻함/수분/가벼운 스트레칭");
    bullets.push("증상 신호가 있으면 회복 우선으로 일정 최소화");
  }

  // 문구 다양화: 불릿 순서를 seed로 회전
  const k = hashToIndex(`${seed}:ac:${key}:${tone}:${nextDuty}`, Math.max(1, bullets.length));
  const rotated = [...bullets.slice(k), ...bullets.slice(0, k)];

  // 워닝이면 더 단순
  const cap = tone === "warning" ? 2 : 2;

  return { title: FACTOR_LABEL_KO[key] ?? "요인", bullets: rotated.slice(0, cap) };
}

export function RecoveryPrescription({ state, pivotISO }: Props) {
  // ✅ 인사이트는 날짜 선택 없이 항상 '오늘' 기준으로 보여줍니다.
  const pivot = (pivotISO ?? todayISO()) as ISODate;

  // "멘트 다양화"를 위한 변형 인덱스(기본은 날짜별 1회 생성, 버튼으로 변경 가능)
  const [variant, setVariant] = useState(0);
  const variantKey = useMemo(() => `wnl.recovery.variant:${pivot}`, [pivot]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(variantKey);
      if (stored) {
        const n = parseInt(stored, 10);
        setVariant(Number.isFinite(n) ? n : 0);
        return;
      }
      const n = Math.floor(Math.random() * 10_000);
      localStorage.setItem(variantKey, String(n));
      setVariant(n);
    } catch {
      // ignore
    }
  }, [variantKey]);

  const [horizon, setHorizon] = useState<"72h" | "7d">("72h");

  const {
    nextDuty,
    todayVital,
    tone,
    seed,
    top2,
    stablePlanByHorizon,
    extraDutyRoutine,
    toneHeadline,
    mustWatch,
  } = useRecoveryPlanData(state, pivot, variant);

  const stablePlan = stablePlanByHorizon[horizon];

  return (
    <Card
      title="맞춤 회복 처방"
      right={<Chip className={cn("border", toneChipCls(tone))}>{toneLabel(tone)}</Chip>}
    >
      <div className="text-[12.5px] text-ios-muted">
        기준일 <b>{pivot}</b> · 내일 <b>{shiftKo(nextDuty)}</b> 듀티 중심으로 회복 플랜을 제시합니다.
      </div>

      <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {mustWatch.map((x) => {
          const cls =
            x.kind === "warning"
              ? "bg-[#E87485]/10 text-[#E87485]"
              : x.kind === "noti"
                ? "bg-[#1B2747]/10 text-[#1B2747]"
                : x.kind === "stable"
                  ? "bg-[#007AFF]/10 text-[#007AFF]"
                  : "bg-white/80 text-ios-text";
          return (
            <Chip key={`${x.label}:${x.value}`} className={cn("border-0", cls)}>
              {x.label} {x.value}
            </Chip>
          );
        })}

      </div>

      <Surface accent="mint" className="mt-4">
        <div className="text-[13px] font-semibold text-ios-text">한눈에 보기</div>
        <div className="mt-2 space-y-1">
          <div className="text-[13px] text-ios-text">
            <LineText l={toneHeadline.h} />
          </div>
          <div className="text-[13px] text-ios-sub">
            <LineText l={toneHeadline.t} />
          </div>
        </div>
      </Surface>

      <details className="group mt-5">
        <summary className="list-none">
          <Surface accent="mint" className="flex cursor-pointer items-center justify-between">
            <div className="text-[13px] font-semibold text-ios-text">
              자세히 보기
              <span className="ml-2 text-[12px] font-normal text-ios-muted">(액션/루틴/플랜)</span>
            </div>
            <span className="text-[18px] text-ios-muted transition-transform group-open:rotate-90">›</span>
          </Surface>
        </summary>

        <div className="mt-4 space-y-4">
          {(top2.length ? top2 : [{ key: "sleep" as FactorKey, label: FACTOR_LABEL_KO.sleep, pct: 0 }])
            .slice(0, 2)
            .map((x, i) => {
              const card = buildActionCard(x.key as FactorKey, nextDuty, tone, todayVital, seed);
              const accent = (i % 2 === 0 ? "mint" : "pink") as keyof typeof DETAIL_GRADIENTS;
              return (
                <Surface key={x.key} accent={accent}>
                  <div className="text-[12px] text-ios-muted">상위 요인</div>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                    <div className="text-[18px] font-bold tracking-[-0.01em] text-ios-text">{card.title}</div>
                    <div className="text-[16px] font-semibold text-ios-sub">{fmtPct01(x.pct)}</div>
                  </div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] text-ios-sub">
                    {card.bullets.map((b, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {b}
                      </li>
                    ))}
                  </ul>
                </Surface>
              );
            })}

          <Surface accent="navy">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-ios-text">추가 듀티 루틴</div>
                <div className="mt-1 text-[12.5px] text-ios-muted">짧고 반복 가능한 루틴만 남겼습니다.</div>
              </div>
              <Chip className="border-0 bg-white/80">옵션</Chip>
            </div>

            <ul className="mt-4 list-disc space-y-2 pl-5 text-[14px] font-semibold text-ios-sub">
              {extraDutyRoutine.map((x, i) => (
                <li key={i} className="leading-relaxed">
                  {x}
                </li>
              ))}
            </ul>

            <div className="mt-4 text-[12.5px] text-ios-muted">* 워닝일수록 “길게”보다 “짧게 여러 번”이 안정적입니다.</div>
          </Surface>

          <Surface accent="navy">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-ios-text">72시간 / 7일 스테이블 플랜</div>
                <div className="mt-1 text-[12.5px] text-ios-muted">핵심만 크게 보여드립니다.</div>
              </div>
              <div className="shrink-0">
                <Segmented
                  value={horizon}
                  onChange={(v) => setHorizon(v as any)}
                  className="w-auto min-w-[140px]"
                  options={[
                    { value: "72h", label: "72시간" },
                    { value: "7d", label: "7일" },
                  ]}
                />
              </div>
            </div>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-[14px] text-ios-sub">
              {stablePlan.map((x, i) => (
                <li key={i} className="leading-relaxed">
                  {x}
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      </details>
    </Card>
  );
}
