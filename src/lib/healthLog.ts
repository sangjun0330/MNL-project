
import type { ISODate } from "@/lib/date";
import type { AppState } from "@/lib/model";
import { readRecordedMood } from "@/lib/mood";
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
    stress?: number | null;
    caffeineMg?: number | null;
    caffeineLastAt?: string | null;
    activity?: number | null;
    symptomSeverity?: number | null;
    menstrualStatus?: "none" | "pms" | "period" | null;
    menstrualFlow?: 0 | 1 | 2 | 3 | null;
    shiftOvertimeHours?: number | null;
    workEventTags?: string[] | null;
    workEventNote?: string | null;
  };

  // 기분은 bio.mood를 canonical source로 읽고, emotions.mood는 compatibility mirror로만 본다.
  mood?: number | null;
};

const DEVICE_KEY = "rnest_device_id_v1";

/**
 * 개발/테스트 환경: 브라우저마다 고유한 deviceId를 만들어 사용
 * (실서비스에서는 로그인 userId로 대체하는 게 정석)
 */
export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "server";
  const prev = window.localStorage.getItem(DEVICE_KEY);
  if (prev) return prev;
  const id = `dev-${Math.random().toString(16).slice(2)}-${Date.now()}`;
  window.localStorage.setItem(DEVICE_KEY, id);
  return id;
}

/**
 * ✅ 동일한 상태에서 매 렌더마다 updatedAt이 변해버리면
 * AutoHealthLogger가 변경으로 인식해서 POST를 계속 보냅니다.
 *
 * 로컬 저장 없이(메모리) 날짜별 "내용 해시"를 저장하고,
 * 내용이 바뀔 때만 updatedAt을 갱신합니다.
 */
type Meta = { createdAt: number; updatedAt: number; hash: string };
type MetaStore = Record<string, Meta>;
const MEMORY_META: MetaStore = {};

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
  metaStore?: MetaStore;
}): DailyHealthSnapshot {
  const { state, deviceId, dateISO } = opts;

  const schedule = (state as any)?.schedule ?? {};
  const notes = (state as any)?.notes ?? {};
  const bioMap = (state as any)?.bio ?? {};
  const emotions = (state as any)?.emotions ?? {};

  const shift: Shift = schedule?.[dateISO] ?? "OFF";
  const note: string | undefined = notes?.[dateISO] ?? undefined;

  const bioRaw = bioMap?.[dateISO] ?? undefined;
  const mood = readRecordedMood(bioRaw ?? null, (emotions?.[dateISO] as any) ?? null);

  const bio = bioRaw
    ? {
        sleepHours: bioRaw.sleepHours ?? null,
        napHours: (bioRaw as any).napHours ?? null,
        stress: bioRaw.stress ?? null,
        caffeineMg: bioRaw.caffeineMg ?? null,
        caffeineLastAt: (bioRaw as any).caffeineLastAt ?? null,
        activity: bioRaw.activity ?? null,
        symptomSeverity: (bioRaw as any).symptomSeverity ?? null,
        menstrualStatus:
          bioRaw.menstrualStatus === "none" || bioRaw.menstrualStatus === "pms" || bioRaw.menstrualStatus === "period"
            ? bioRaw.menstrualStatus
            : null,
        menstrualFlow:
          bioRaw.menstrualFlow == null
            ? null
            : (Math.max(0, Math.min(3, Math.round(Number(bioRaw.menstrualFlow)))) as 0 | 1 | 2 | 3),
        shiftOvertimeHours:
          (bioRaw as any).shiftOvertimeHours == null
            ? null
            : Math.max(0, Math.min(8, Math.round(Number((bioRaw as any).shiftOvertimeHours) * 2) / 2)),
        workEventTags: Array.isArray((bioRaw as any).workEventTags)
          ? ((bioRaw as any).workEventTags as unknown[])
              .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
              .filter(Boolean)
              .slice(0, 8)
          : null,
        workEventNote:
          typeof (bioRaw as any).workEventNote === "string"
            ? (bioRaw as any).workEventNote.replace(/\s+/g, " ").trim().slice(0, 280)
            : null,
      }
    : undefined;

  // ✅ 내용만으로 해시 생성(시간값 제외)
  const content = { dateISO, shift, note: note ?? null, bio: bio ?? null, mood };

  const now = Date.now();
  const all = opts.metaStore ?? MEMORY_META;
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
