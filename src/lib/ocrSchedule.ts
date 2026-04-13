/**
 * ocrSchedule.ts
 *
 * 브라우저 내장 OCR 파이프라인 — Tesseract.js v7 (WASM, Apache 2.0)
 * 별도 서버 없이 클라이언트에서 직접 실행됩니다.
 *
 * 흐름:
 *   File → Tesseract.js 인식 → 단어 바운딩박스 → 테이블 재구성
 *   → 개인/다인 판별 → 근무 정규화 → OcrResult 반환
 */

"use client";

import type { ISODate } from "@/lib/date";
import type { CoreShift, CustomShiftDef } from "@/lib/model";
import {
  buildAliasMap,
  isLikelyKoreanName,
  normalizeShiftText,
} from "@/lib/shiftAliasMap";
import { LOCAL_TESSERACT_WORKER_OPTIONS } from "@/lib/tesseractAssetPaths";

// ────────────────────────────────────────────────────────────
// 공개 타입
// ────────────────────────────────────────────────────────────

export type OcrScheduleEntry = {
  semanticType: CoreShift;
  displayName: string;
};

/** 매칭 실패한 근무 — UI에서 사용자가 직접 지정 */
export type OcrUnknownCode = {
  isoDate: ISODate;
  rawText: string;
};

export type OcrResultIndividual = {
  kind: "individual";
  yearMonth: string; // "2026-04"
  schedule: Record<ISODate, OcrScheduleEntry>;
  unknownCodes: OcrUnknownCode[];
};

export type OcrResultMultiPersonPending = {
  kind: "multi_person_pending";
  yearMonth: string;
  /** 근무표에서 감지된 이름 목록 */
  persons: string[];
  /** 테이블 raw 데이터 — 이름 선택 후 재파싱에 사용 */
  rawGrid: string[][];
};

export type OcrResultMultiPersonResolved = {
  kind: "multi_person_resolved";
  yearMonth: string;
  userName: string;
  schedule: Record<ISODate, OcrScheduleEntry>;
  unknownCodes: OcrUnknownCode[];
};

export type OcrError = {
  kind: "error";
  message: string;
  code: "NO_TEXT" | "NO_TABLE" | "OCR_FAILED" | "UNSUPPORTED_FILE";
};

export type OcrResult =
  | OcrResultIndividual
  | OcrResultMultiPersonPending
  | OcrResultMultiPersonResolved
  | OcrError;

export type OcrProgress = {
  stage: "loading" | "recognizing" | "parsing";
  /** 0~100 */
  pct: number;
  message: string;
};

// ────────────────────────────────────────────────────────────
// 내부 타입
// ────────────────────────────────────────────────────────────

type BBox = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; bbox: BBox; confidence: number };

// ────────────────────────────────────────────────────────────
// 메인 OCR 함수
// ────────────────────────────────────────────────────────────

/**
 * @param file          이미지 파일 (JPG, PNG, HEIC 등)
 * @param customDefs    저장된 커스텀 근무 정의 (alias 매핑에 사용)
 * @param yearMonthHint "2026-04" 형식 힌트 — 없으면 이미지에서 추론
 * @param userName      다인 근무표에서 필터링할 이름 (없으면 감지 후 pending 반환)
 * @param onProgress    진행 콜백
 */
export async function parseScheduleImage(
  file: File,
  customDefs: CustomShiftDef[],
  yearMonthHint: string,
  userName: string,
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  const report = (stage: OcrProgress["stage"], pct: number, message: string) =>
    onProgress?.({ stage, pct, message });

  // 지원 형식 검사
  if (!file.type.startsWith("image/") && !file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff?)$/i)) {
    return { kind: "error", message: "이미지 파일만 지원합니다 (JPG, PNG, HEIC 등)", code: "UNSUPPORTED_FILE" };
  }

  try {
    report("loading", 5, "Tesseract.js 로딩 중...");

    // 동적 임포트 — 초기 번들에서 제외
    const { createWorker } = await import("tesseract.js");

    report("loading", 20, "한국어 OCR 모델 준비 중... (첫 실행 시 ~12MB 다운로드)");

    const worker = await createWorker("kor+eng", 1, {
      ...LOCAL_TESSERACT_WORKER_OPTIONS,
      logger: (m) => {
        if (m.status === "recognizing text") {
          report("recognizing", 20 + Math.round(m.progress * 60), "텍스트 인식 중...");
        }
      },
    });

    report("recognizing", 25, "이미지 분석 중...");

    let result;
    try {
      result = await worker.recognize(file);
    } finally {
      await worker.terminate();
    }

    report("parsing", 82, "테이블 구조 분석 중...");

    // Tesseract.js v7: result.data는 Page 타입 — words 배열로 캐스팅
    type TesseractWord = {
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      confidence: number;
    };
    const rawData = result.data as { words?: TesseractWord[]; text?: string };
    const rawWords: TesseractWord[] = rawData.words ?? [];
    const fullText: string = rawData.text ?? "";

    const filteredWords = rawWords.filter((w) => w.confidence > 20 && w.text.trim());
    const words: OcrWord[] = (filteredWords.length > 0 ? filteredWords : rawWords.filter((w) => w.text.trim()))
      .map((w) => ({
        text: w.text.trim(),
        bbox: w.bbox,
        confidence: w.confidence,
      }));

    if (!words.length) {
      return { kind: "error", message: "텍스트를 인식하지 못했습니다. 더 선명한 이미지를 사용해 주세요.", code: "NO_TEXT" };
    }

    // 연월 추론
    const yearMonth = yearMonthHint || inferYearMonth(fullText);

    // 테이블 재구성
    const grid = wordsToGrid(words);
    if (grid.length < 2 || grid[0].length < 2) {
      return { kind: "error", message: "근무표 형식을 찾지 못했습니다. 표 전체가 보이도록 다시 찍어주세요.", code: "NO_TABLE" };
    }

    report("parsing", 90, "근무 코드 분석 중...");

    const aliasMap = buildAliasMap(customDefs);
    const scheduleType = detectScheduleType(grid);

    if (scheduleType === "multi_person") {
      const persons = extractPersonNames(grid);
      if (userName && persons.length > 0) {
        return resolveMultiPerson(grid, persons, userName, yearMonth, aliasMap, customDefs);
      }
      return {
        kind: "multi_person_pending",
        yearMonth,
        persons,
        rawGrid: grid,
      };
    }

    // 개인 근무표
    const { schedule, unknownCodes } = extractScheduleFromGrid(grid, yearMonth, aliasMap, customDefs);
    report("parsing", 100, "완료");
    return { kind: "individual", yearMonth, schedule, unknownCodes };

  } catch (err) {
    console.error("[ocrSchedule] 오류:", err);
    const message =
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "OCR 처리 중 오류가 발생했습니다.";
    return {
      kind: "error",
      message,
      code: "OCR_FAILED",
    };
  }
}

/**
 * 다인 근무표에서 이름 선택 후 해당 인물의 근무만 추출
 * (multi_person_pending 상태에서 이름 선택 후 호출)
 */
export function resolvePersonFromGrid(
  pending: OcrResultMultiPersonPending,
  userName: string,
  customDefs: CustomShiftDef[]
): OcrResultMultiPersonResolved | OcrError {
  const aliasMap = buildAliasMap(customDefs);
  const persons = extractPersonNames(pending.rawGrid);
  return resolveMultiPerson(
    pending.rawGrid,
    persons,
    userName,
    pending.yearMonth,
    aliasMap,
    customDefs
  );
}

// ────────────────────────────────────────────────────────────
// 테이블 재구성: 단어 바운딩박스 → 2D 문자열 배열
// ────────────────────────────────────────────────────────────

function wordsToGrid(words: OcrWord[]): string[][] {
  if (!words.length) return [];

  // Y 중심값으로 정렬
  const sorted = [...words].sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2);

  // 행 그룹화: 같은 Y 범위 내 단어들을 한 행으로
  const rowGroups: OcrWord[][] = [];
  const ROW_THRESHOLD = computeRowThreshold(words);

  for (const word of sorted) {
    const cy = (word.bbox.y0 + word.bbox.y1) / 2;
    const existingRow = rowGroups.find((row) => {
      const rowCy = (row[0].bbox.y0 + row[0].bbox.y1) / 2;
      return Math.abs(cy - rowCy) < ROW_THRESHOLD;
    });
    if (existingRow) {
      existingRow.push(word);
    } else {
      rowGroups.push([word]);
    }
  }

  // 각 행 내부를 X 기준으로 정렬
  for (const row of rowGroups) {
    row.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  // 열 경계 감지 (X 군집화)
  const colBoundaries = detectColumnBoundaries(words);

  // 각 단어를 열에 배정 → 2D 배열
  return rowGroups.map((row) => {
    if (!colBoundaries.length) {
      return row.map((w) => w.text);
    }
    const cells: string[] = Array(colBoundaries.length).fill("");
    for (const word of row) {
      const cx = (word.bbox.x0 + word.bbox.x1) / 2;
      const colIdx = findNearestColumn(cx, colBoundaries);
      if (cells[colIdx]) {
        cells[colIdx] += " " + word.text;
      } else {
        cells[colIdx] = word.text;
      }
    }
    return cells.map((c) => c.trim());
  });
}

/** 중앙값 기반 행 높이 임계값 */
function computeRowThreshold(words: OcrWord[]): number {
  const heights = words.map((w) => Math.max(4, w.bbox.y1 - w.bbox.y0));
  heights.sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  return Math.max(8, median * 0.65);
}

/** X 좌표 히스토그램으로 열 중심 위치 감지 */
function detectColumnBoundaries(words: OcrWord[]): number[] {
  if (words.length < 4) return [];

  const xCenters = words.map((w) => (w.bbox.x0 + w.bbox.x1) / 2);
  xCenters.sort((a, b) => a - b);

  // 가장 좁은 단어 너비 기반 갭 임계값
  const widths = words.map((w) => w.bbox.x1 - w.bbox.x0).filter((w) => w > 2);
  widths.sort((a, b) => a - b);
  const minWidth = widths[Math.floor(widths.length * 0.1)] ?? 8;
  const gapThreshold = Math.max(6, minWidth * 0.5);

  // 연속된 X 중심값들을 군집으로 묶음
  const clusters: number[][] = [[xCenters[0]]];
  for (let i = 1; i < xCenters.length; i++) {
    const last = clusters[clusters.length - 1];
    if (xCenters[i] - xCenters[i - 1] < gapThreshold) {
      last.push(xCenters[i]);
    } else {
      clusters.push([xCenters[i]]);
    }
  }

  // 각 군집의 평균을 열 중심으로 사용
  return clusters.map((cluster) => cluster.reduce((s, v) => s + v, 0) / cluster.length);
}

function findNearestColumn(x: number, colBoundaries: number[]): number {
  let best = 0;
  let bestDist = Math.abs(x - colBoundaries[0]);
  for (let i = 1; i < colBoundaries.length; i++) {
    const dist = Math.abs(x - colBoundaries[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────
// 개인/다인 근무표 판별
// ────────────────────────────────────────────────────────────

type ScheduleKind = "individual" | "multi_person";

function detectScheduleType(grid: string[][]): ScheduleKind {
  if (!grid.length) return "individual";

  // 첫 번째 열 또는 첫 번째 행에서 이름 패턴 탐지
  const firstCol = grid.map((row) => row[0] ?? "");
  const firstRow = grid[0] ?? [];

  const namesInFirstCol = firstCol.filter(isLikelyKoreanName).length;
  const namesInFirstRow = firstRow.filter(isLikelyKoreanName).length;

  // 첫 열/행에 이름이 2개 이상 → 다인 근무표
  if (namesInFirstCol >= 2 || namesInFirstRow >= 2) return "multi_person";

  // 전체 셀 이름 비율 보조 신호 (5% 이상이면 다인)
  const allCells = grid.flat();
  const nameCount = allCells.filter(isLikelyKoreanName).length;
  if (allCells.length > 0 && nameCount / allCells.length >= 0.05) {
    return "multi_person";
  }

  return "individual";
}

function extractPersonNames(grid: string[][]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  // 첫 열 우선
  for (const row of grid) {
    const cell = (row[0] ?? "").trim();
    if (isLikelyKoreanName(cell) && !seen.has(cell)) {
      seen.add(cell);
      names.push(cell);
    }
  }

  // 첫 열에서 못 찾으면 첫 행
  if (!names.length && grid[0]) {
    for (const cell of grid[0]) {
      const t = cell.trim();
      if (isLikelyKoreanName(t) && !seen.has(t)) {
        seen.add(t);
        names.push(t);
      }
    }
  }

  return names;
}

// ────────────────────────────────────────────────────────────
// 날짜 감지
// ────────────────────────────────────────────────────────────

const DAY_RE = /^(\d{1,2})(일)?$/;

function findDateAxis(grid: string[][]): { axis: "col" | "row" | "none"; idx: number; days: number[] } {
  // 열 방향 날짜 (일반적인 병원 세로형 근무표)
  for (let colIdx = 0; colIdx < Math.min(3, (grid[0] ?? []).length); colIdx++) {
    const days: number[] = [];
    for (const row of grid) {
      const m = DAY_RE.exec((row[colIdx] ?? "").trim());
      if (m) days.push(parseInt(m[1], 10));
    }
    if (days.length >= 20) return { axis: "col", idx: colIdx, days };
  }

  // 행 방향 날짜 (가로형 근무표)
  for (let rowIdx = 0; rowIdx < Math.min(3, grid.length); rowIdx++) {
    const days: number[] = [];
    for (const cell of grid[rowIdx] ?? []) {
      const m = DAY_RE.exec(cell.trim());
      if (m) days.push(parseInt(m[1], 10));
    }
    if (days.length >= 20) return { axis: "row", idx: rowIdx, days };
  }

  return { axis: "none", idx: -1, days: [] };
}

// ────────────────────────────────────────────────────────────
// 연월 추론 (이미지 텍스트에서)
// ────────────────────────────────────────────────────────────

function inferYearMonth(fullText: string): string {
  // "2026년 4월", "2026-04", "4월 근무표" 패턴
  const withYear = fullText.match(/(\d{4})[년\-\/]?\s*(\d{1,2})월?/);
  if (withYear) {
    const y = withYear[1];
    const m = withYear[2].padStart(2, "0");
    return `${y}-${m}`;
  }
  const monthOnly = fullText.match(/(\d{1,2})월/);
  if (monthOnly) {
    const now = new Date();
    const m = monthOnly[1].padStart(2, "0");
    return `${now.getFullYear()}-${m}`;
  }
  // 추론 실패 → 오늘 기준 이번 달
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────
// 그리드 → 근무 스케줄 추출 (개인 근무표)
// ────────────────────────────────────────────────────────────

function extractScheduleFromGrid(
  grid: string[][],
  yearMonth: string,
  aliasMap: Map<string, [import("@/lib/model").CoreShift, string]>,
  customDefs: CustomShiftDef[]
): { schedule: Record<ISODate, OcrScheduleEntry>; unknownCodes: OcrUnknownCode[] } {
  const schedule: Record<ISODate, OcrScheduleEntry> = {};
  const unknownCodes: OcrUnknownCode[] = [];

  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month)) return { schedule, unknownCodes };

  const maxDay = new Date(year, month, 0).getDate();
  const dateAxis = findDateAxis(grid);

  if (dateAxis.axis === "col") {
    // 세로형: 날짜 컬럼 오른쪽에 근무
    const dateColIdx = dateAxis.idx;
    const shiftColIdx = dateColIdx + 1;
    for (const row of grid) {
      const dayStr = (row[dateColIdx] ?? "").trim();
      const m = DAY_RE.exec(dayStr);
      if (!m) continue;
      const day = parseInt(m[1], 10);
      if (day < 1 || day > maxDay) continue;

      const shiftRaw = (row[shiftColIdx] ?? "").trim();
      const iso = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}` as ISODate;
      processShiftCell(shiftRaw, iso, aliasMap, customDefs, schedule, unknownCodes);
    }
  } else if (dateAxis.axis === "row") {
    // 가로형: 날짜 행 아래에 근무
    const dateRowIdx = dateAxis.idx;
    const shiftRowIdx = dateRowIdx + 1;
    const dateRow = grid[dateRowIdx] ?? [];
    const shiftRow = grid[shiftRowIdx] ?? [];

    for (let colIdx = 0; colIdx < dateRow.length; colIdx++) {
      const dayStr = (dateRow[colIdx] ?? "").trim();
      const m = DAY_RE.exec(dayStr);
      if (!m) continue;
      const day = parseInt(m[1], 10);
      if (day < 1 || day > maxDay) continue;

      const shiftRaw = (shiftRow[colIdx] ?? "").trim();
      const iso = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}` as ISODate;
      processShiftCell(shiftRaw, iso, aliasMap, customDefs, schedule, unknownCodes);
    }
  }

  return { schedule, unknownCodes };
}

// ────────────────────────────────────────────────────────────
// 다인 근무표: 특정 인물 추출
// ────────────────────────────────────────────────────────────

function resolveMultiPerson(
  grid: string[][],
  persons: string[],
  userName: string,
  yearMonth: string,
  aliasMap: Map<string, [import("@/lib/model").CoreShift, string]>,
  customDefs: CustomShiftDef[]
): OcrResultMultiPersonResolved | OcrError {
  // 이름 유사도 매칭 (정확 일치 → 포함 관계)
  const matchedName =
    persons.find((n) => n === userName) ??
    persons.find((n) => userName.includes(n) || n.includes(userName));

  if (!matchedName) {
    return {
      kind: "error",
      message: `"${userName}" 이름을 근무표에서 찾을 수 없습니다.`,
      code: "NO_TABLE",
    };
  }

  const [yearStr, monthStr] = yearMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const maxDay = new Date(year, month, 0).getDate();

  const schedule: Record<ISODate, OcrScheduleEntry> = {};
  const unknownCodes: OcrUnknownCode[] = [];
  const dateAxis = findDateAxis(grid);

  if (dateAxis.axis === "row") {
    // 가로형: 이름이 첫 열, 날짜가 첫 행
    const dateRow = grid[dateAxis.idx] ?? [];
    const personRow = grid.find((row) => (row[0] ?? "").trim() === matchedName);
    if (!personRow) {
      return { kind: "error", message: "근무표에서 해당 행을 찾을 수 없습니다.", code: "NO_TABLE" };
    }

    for (let colIdx = 0; colIdx < dateRow.length; colIdx++) {
      const m = DAY_RE.exec((dateRow[colIdx] ?? "").trim());
      if (!m) continue;
      const day = parseInt(m[1], 10);
      if (day < 1 || day > maxDay) continue;

      const shiftRaw = (personRow[colIdx] ?? "").trim();
      const iso = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}` as ISODate;
      processShiftCell(shiftRaw, iso, aliasMap, customDefs, schedule, unknownCodes);
    }
  } else if (dateAxis.axis === "col") {
    // 세로형: 이름이 첫 행, 날짜가 첫 열
    const headerRow = grid[0] ?? [];
    const personColIdx = headerRow.findIndex((cell) => cell.trim() === matchedName);
    if (personColIdx < 0) {
      return { kind: "error", message: "근무표에서 해당 열을 찾을 수 없습니다.", code: "NO_TABLE" };
    }

    for (const row of grid.slice(1)) {
      const m = DAY_RE.exec((row[dateAxis.idx] ?? "").trim());
      if (!m) continue;
      const day = parseInt(m[1], 10);
      if (day < 1 || day > maxDay) continue;

      const shiftRaw = (row[personColIdx] ?? "").trim();
      const iso = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}` as ISODate;
      processShiftCell(shiftRaw, iso, aliasMap, customDefs, schedule, unknownCodes);
    }
  }

  return {
    kind: "multi_person_resolved",
    yearMonth,
    userName: matchedName,
    schedule,
    unknownCodes,
  };
}

// ────────────────────────────────────────────────────────────
// 셀 처리 공통 헬퍼
// ────────────────────────────────────────────────────────────

function processShiftCell(
  raw: string,
  iso: ISODate,
  aliasMap: Map<string, [import("@/lib/model").CoreShift, string]>,
  customDefs: CustomShiftDef[],
  schedule: Record<ISODate, OcrScheduleEntry>,
  unknownCodes: OcrUnknownCode[]
) {
  if (!raw || raw === "-" || raw === "/") {
    schedule[iso] = { semanticType: "OFF", displayName: "오프" };
    return;
  }

  const normalized = normalizeShiftText(raw, aliasMap, customDefs);
  if (normalized) {
    schedule[iso] = {
      semanticType: normalized.semanticType,
      displayName: normalized.displayName,
    };
  } else {
    unknownCodes.push({ isoDate: iso, rawText: raw });
  }
}
