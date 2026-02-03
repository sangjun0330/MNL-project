
import type { ISODate } from "@/lib/date";
import type { AppState } from "@/lib/model";
import type { Shift } from "@/lib/types";

// ✅ 날짜별 로그 스냅샷(서버에 저장/동기화할 payload)
export type DailyHealthSnapshot = {
  version: 1;
  deviceId: string;
  dateISO: ISODate;
  createdAt: number;
  updatedAt: number;

  shift: Shift;
  note?: string;

  // 필수 4개 + 옵션(활동량/생리 증상 등)
  bio?: {
    sleepHours?: number | null;
    napHours?: number | null;
    sleepQuality?: number | null;
    sleepTiming?: "auto" | "night" | "day" | "mixed" | null;
    stress?: number | null;
    caffeineMg?: number | null;
    caffeineLastAt?: string | null;
    activity?: number | null;
    fatigueLevel?: number | null;
    symptomSeverity?: number | null;
    menstrualStatus?: "none" | "pms" | "period" | null;
    menstrualFlow?: number | null;
    shiftOvertimeHours?: number | null;
  };

  // 기분은 emotions에 저장되므로 따로 넣어도 됨(서버 분석 편의)
  mood?: number | null;
};

let cachedDeviceId: string | null = null;

/**
 * 개발/테스트 환경: 브라우저마다 고유한 deviceId를 만들어 사용
 * (실서비스에서는 로그인 userId로 대체하는 게 정석)
 */
export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "server";
  if (cachedDeviceId) return cachedDeviceId;
  cachedDeviceId = `dev-${Math.random().toString(16).slice(2)}-${Date.now()}`;
  return cachedDeviceId;
}

/**
 * ✅ 동일한 상태에서 매 렌더마다 updatedAt이 변해버리면
 * AutoHealthLogger가 변경으로 인식해서 POST를 계속 보냅니다.
 *
 * 그래서 날짜별로 "내용 해시"를 localStorage에 저장해두고,
 * 내용이 바뀔 때만 updatedAt을 갱신합니다.
 */
type Meta = { createdAt: number; updatedAt: number; hash: string };
let metaCache: Record<string, Meta> = {};

function readMeta(): Record<string, Meta> {
  return metaCache;
}
function writeMeta(next: Record<string, Meta>) {
  metaCache = next;
}

function stableHash(obj: any) {
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export function buildDailyHealthSnapshot(opts: {
  state: AppState;
  deviceId: string;
  dateISO: ISODate;
}): DailyHealthSnapshot {
  const { state, deviceId, dateISO } = opts;

  const schedule = (state as any)?.schedule ?? {};
  const notes = (state as any)?.notes ?? {};
  const bioMap = (state as any)?.bio ?? {};
  const emotions = (state as any)?.emotions ?? {};

  const shift: Shift = schedule?.[dateISO] ?? "OFF";
  const note: string | undefined = notes?.[dateISO] ?? undefined;

  const bioRaw = bioMap?.[dateISO] ?? undefined;
  const mood = (emotions?.[dateISO] as any)?.mood ?? null;

  const bio = bioRaw
    ? {
        sleepHours: bioRaw.sleepHours ?? null,
        napHours: (bioRaw as any).napHours ?? null,
        sleepQuality: (bioRaw as any).sleepQuality ?? null,
        sleepTiming: (bioRaw as any).sleepTiming ?? null,
        stress: bioRaw.stress ?? null,
        caffeineMg: bioRaw.caffeineMg ?? null,
        caffeineLastAt: (bioRaw as any).caffeineLastAt ?? null,
        activity: bioRaw.activity ?? null,
        fatigueLevel: (bioRaw as any).fatigueLevel ?? null,
        symptomSeverity: (bioRaw as any).symptomSeverity ?? null,
        menstrualStatus: (bioRaw as any).menstrualStatus ?? null,
        menstrualFlow: (bioRaw as any).menstrualFlow ?? null,
        shiftOvertimeHours: (bioRaw as any).shiftOvertimeHours ?? null,
      }
    : undefined;

  // ✅ 내용만으로 해시 생성(시간값 제외)
  const content = { dateISO, shift, note: note ?? null, bio: bio ?? null, mood };

  const now = Date.now();
  const all = readMeta();
  const prev = all[dateISO];
  const nextHash = stableHash(content);

  let createdAt = prev?.createdAt ?? now;
  let updatedAt = prev?.updatedAt ?? now;

  if (!prev) {
    updatedAt = now;
  } else if (prev.hash !== nextHash) {
    updatedAt = now;
  }

  all[dateISO] = { createdAt, updatedAt, hash: nextHash };
  writeMeta(all);

  return {
    version: 1,
    deviceId,
    dateISO,
    createdAt,
    updatedAt,
    shift,
    note,
    bio,
    mood,
  };
}
