import type { ISODate } from "@/lib/date";
import type { CustomShiftType } from "@/lib/model";
import type { Shift } from "@/lib/types";

type ShiftLookupValue = [Shift, string];

export type OcrProgressStage = "loading" | "recognizing" | "parsing";

export type OcrProgress = {
  stage: OcrProgressStage;
  pct: number;
  message: string;
};

export type OcrRecognizedShift = {
  semanticType: Shift;
  displayName: string;
};

export type OcrUnknownCode = {
  isoDate: ISODate;
  rawText: string;
};

export type OcrSuccessResult = {
  kind: "individual" | "multi_person_resolved";
  yearMonth: string;
  schedule: Record<ISODate, OcrRecognizedShift>;
  unknownCodes: OcrUnknownCode[];
  userName?: string;
};

export type OcrPendingResult = {
  kind: "multi_person_pending";
  yearMonth: string;
  persons: string[];
  rawGrid: string[][];
};

export type OcrErrorResult = {
  kind: "error";
  message: string;
  code: string;
};

export type OcrResult = OcrSuccessResult | OcrPendingResult | OcrErrorResult;

type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

const BASE_SHIFT_ALIASES: Record<string, ShiftLookupValue> = {
  D: ["D", "주간"],
  DAY: ["D", "주간"],
  DAYSHIFT: ["D", "주간"],
  주간: ["D", "주간"],
  데이: ["D", "주간"],
  데: ["D", "주간"],
  오전: ["D", "오전"],
  AM: ["D", "AM"],
  E: ["E", "이브닝"],
  EVE: ["E", "이브닝"],
  EVENING: ["E", "이브닝"],
  이브: ["E", "이브닝"],
  이브닝: ["E", "이브닝"],
  저녁: ["E", "저녁번"],
  저녁번: ["E", "저녁번"],
  PM: ["E", "PM"],
  P번: ["E", "P번"],
  "2교대": ["E", "2교대"],
  N: ["N", "나이트"],
  NIGHT: ["N", "나이트"],
  나이트: ["N", "나이트"],
  나: ["N", "나이트"],
  야간: ["N", "야간"],
  야: ["N", "야번"],
  야번: ["N", "야번"],
  밤: ["N", "밤번"],
  밤번: ["N", "밤번"],
  "3교대": ["N", "3교대"],
  M: ["M", "미들"],
  MID: ["M", "미들"],
  MIDDLE: ["M", "미들"],
  미들: ["M", "미들"],
  중간: ["M", "미들"],
  중간번: ["M", "미들"],
  OFF: ["OFF", "오프"],
  O: ["OFF", "오프"],
  "-": ["OFF", "오프"],
  _: ["OFF", "오프"],
  "/": ["OFF", "오프"],
  공: ["OFF", "공휴일"],
  공휴일: ["OFF", "공휴일"],
  쉬는날: ["OFF", "오프"],
  쉬는: ["OFF", "오프"],
  오프: ["OFF", "오프"],
  비번: ["OFF", "비번"],
  비: ["OFF", "비번"],
  VAC: ["VAC", "연차"],
  VA: ["VAC", "연차"],
  V: ["VAC", "연차"],
  연차: ["VAC", "연차"],
  휴가: ["VAC", "휴가"],
  연: ["VAC", "연차"],
  휴: ["VAC", "휴가"],
  반차: ["VAC", "반차"],
};

const EMPTY_SHIFT_TOKENS = new Set(["", " ", "　", "·", "•", "×", "x", "X"]);
const PERSON_NAME_RE = /^[가-힣]{2,4}$/;
const DAY_CELL_RE = /^(\d{1,2})(일)?$/;

function buildShiftLookup(customShiftTypes: CustomShiftType[]) {
  const lookup = new Map<string, ShiftLookupValue>();

  for (const [key, value] of Object.entries(BASE_SHIFT_ALIASES)) {
    lookup.set(key.toUpperCase(), value);
    lookup.set(key, value);
  }

  for (const shiftType of customShiftTypes) {
    const normalizedDisplayName = shiftType.displayName.replace(/\s+/g, " ").trim();
    if (!normalizedDisplayName) continue;

    const value: ShiftLookupValue = [shiftType.semanticType, normalizedDisplayName];
    lookup.set(normalizedDisplayName, value);
    lookup.set(normalizedDisplayName.toUpperCase(), value);

    for (const alias of shiftType.aliases ?? []) {
      const normalizedAlias = alias.replace(/\s+/g, " ").trim();
      if (!normalizedAlias) continue;
      lookup.set(normalizedAlias, value);
      lookup.set(normalizedAlias.toUpperCase(), value);
    }
  }

  return lookup;
}

function isLikelyPersonName(text: string) {
  const trimmed = text.trim();
  return Boolean(trimmed) && !BASE_SHIFT_ALIASES[trimmed] && !BASE_SHIFT_ALIASES[trimmed.toUpperCase()] && PERSON_NAME_RE.test(trimmed);
}

function normalizeYearMonthHint(hint?: string | null) {
  if (!hint) return "";
  const match = hint.trim().match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function guessYearMonth(text: string) {
  const yearMonthMatch = text.match(/(\d{4})[년\-\/]?\s*(\d{1,2})월?/);
  if (yearMonthMatch) {
    return `${yearMonthMatch[1]}-${yearMonthMatch[2].padStart(2, "0")}`;
  }

  const monthMatch = text.match(/(\d{1,2})월/);
  if (monthMatch) {
    const now = new Date();
    return `${now.getFullYear()}-${monthMatch[1].padStart(2, "0")}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function medianWordRowThreshold(words: OcrWord[]) {
  const heights = words.map((word) => Math.max(4, word.bbox.y1 - word.bbox.y0)).sort((a, b) => a - b);
  return Math.max(8, 0.65 * heights[Math.floor(heights.length / 2)]);
}

function buildColumnCenters(words: OcrWord[]) {
  if (words.length < 4) return [];

  const centers = words.map((word) => (word.bbox.x0 + word.bbox.x1) / 2).sort((a, b) => a - b);
  const widths = words
    .map((word) => word.bbox.x1 - word.bbox.x0)
    .filter((width) => width > 2)
    .sort((a, b) => a - b);

  const mergeThreshold = Math.max(6, 0.5 * (widths[Math.floor(widths.length * 0.1)] ?? 8));
  const clusters: number[][] = [[centers[0]]];

  for (let i = 1; i < centers.length; i += 1) {
    const current = clusters[clusters.length - 1];
    if (centers[i] - centers[i - 1] < mergeThreshold) current.push(centers[i]);
    else clusters.push([centers[i]]);
  }

  return clusters.map((cluster) => cluster.reduce((sum, center) => sum + center, 0) / cluster.length);
}

function nearestColumnIndex(centerX: number, columnCenters: number[]) {
  let closestIndex = 0;
  let closestDistance = Math.abs(centerX - columnCenters[0]);

  for (let i = 1; i < columnCenters.length; i += 1) {
    const distance = Math.abs(centerX - columnCenters[i]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

function wordsToGrid(words: OcrWord[]) {
  if (!words.length) return [];

  const sortedWords = [...words].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2
  );
  const rows: OcrWord[][] = [];
  const rowThreshold = medianWordRowThreshold(words);

  for (const word of sortedWords) {
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    const row = rows.find(
      (candidate) =>
        Math.abs(centerY - (candidate[0].bbox.y0 + candidate[0].bbox.y1) / 2) < rowThreshold
    );
    if (row) row.push(word);
    else rows.push([word]);
  }

  for (const row of rows) {
    row.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  const columnCenters = buildColumnCenters(words);
  return rows.map((row) => {
    if (!columnCenters.length) return row.map((word) => word.text);

    const cells = Array(columnCenters.length).fill("");
    for (const word of row) {
      const columnIndex = nearestColumnIndex((word.bbox.x0 + word.bbox.x1) / 2, columnCenters);
      cells[columnIndex] = cells[columnIndex] ? `${cells[columnIndex]} ${word.text}` : word.text;
    }
    return cells.map((cell) => cell.trim());
  });
}

function detectDayAxis(grid: string[][]) {
  const topRow = grid[0] ?? [];
  for (let col = 0; col < Math.min(3, topRow.length); col += 1) {
    const days: number[] = [];
    for (const row of grid) {
      const match = DAY_CELL_RE.exec((row[col] ?? "").trim());
      if (match) days.push(Number(match[1]));
    }
    if (days.length >= 20) return { axis: "col" as const, idx: col, days };
  }

  for (let row = 0; row < Math.min(3, grid.length); row += 1) {
    const days: number[] = [];
    for (const cell of grid[row] ?? []) {
      const match = DAY_CELL_RE.exec(cell.trim());
      if (match) days.push(Number(match[1]));
    }
    if (days.length >= 20) return { axis: "row" as const, idx: row, days };
  }

  return { axis: "none" as const, idx: -1, days: [] as number[] };
}

function classifyGrid(grid: string[][]) {
  if (!grid.length) return "individual" as const;

  const firstColumn = grid.map((row) => row[0] ?? "");
  const firstRow = grid[0] ?? [];
  const firstColumnNames = firstColumn.filter(isLikelyPersonName).length;
  const firstRowNames = firstRow.filter(isLikelyPersonName).length;
  if (firstColumnNames >= 2 || firstRowNames >= 2) return "multi_person" as const;

  const allCells = grid.flat();
  const nameCount = allCells.filter(isLikelyPersonName).length;
  return allCells.length > 0 && nameCount / allCells.length >= 0.05 ? "multi_person" : "individual";
}

function extractCandidatePersons(grid: string[][]) {
  const seen = new Set<string>();
  const persons: string[] = [];

  for (const row of grid) {
    const candidate = (row[0] ?? "").trim();
    if (!isLikelyPersonName(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    persons.push(candidate);
  }

  if (!persons.length && grid[0]) {
    for (const cell of grid[0]) {
      const candidate = cell.trim();
      if (!isLikelyPersonName(candidate) || seen.has(candidate)) continue;
      seen.add(candidate);
      persons.push(candidate);
    }
  }

  return persons;
}

function resolveShiftCode(
  rawText: string,
  lookup: Map<string, ShiftLookupValue>,
  customShiftTypes: CustomShiftType[]
) {
  const trimmed = rawText.trim();
  if (!trimmed || EMPTY_SHIFT_TOKENS.has(trimmed)) {
    return { semanticType: "OFF" as Shift, displayName: "오프", fromCustom: false };
  }

  const normalized = trimmed.toUpperCase();
  const directMatch = lookup.get(normalized) ?? lookup.get(trimmed);
  if (directMatch) {
    const matchedCustom = customShiftTypes.some(
      (customShift) =>
        customShift.displayName === trimmed ||
        customShift.displayName.toUpperCase() === normalized ||
        customShift.aliases.some((alias) => alias.toUpperCase() === normalized)
    );

    return {
      semanticType: directMatch[0],
      displayName: directMatch[1],
      fromCustom: matchedCustom,
    };
  }

  for (const [candidate, value] of lookup.entries()) {
    if (candidate.length >= 2 && trimmed.includes(candidate)) {
      return {
        semanticType: value[0],
        displayName: trimmed,
        fromCustom: false,
      };
    }
  }

  return null;
}

function upsertResolvedShift(
  rawText: string,
  isoDate: ISODate,
  lookup: Map<string, ShiftLookupValue>,
  customShiftTypes: CustomShiftType[],
  schedule: Record<ISODate, OcrRecognizedShift>,
  unknownCodes: OcrUnknownCode[]
) {
  const resolved = resolveShiftCode(rawText, lookup, customShiftTypes);
  if (resolved) {
    schedule[isoDate] = {
      semanticType: resolved.semanticType,
      displayName: resolved.displayName,
    };
    return;
  }

  unknownCodes.push({ isoDate, rawText });
}

function parseGridSchedule(
  grid: string[][],
  yearMonth: string,
  lookup: Map<string, ShiftLookupValue>,
  customShiftTypes: CustomShiftType[]
) {
  const schedule: Record<ISODate, OcrRecognizedShift> = {};
  const unknownCodes: OcrUnknownCode[] = [];
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (Number.isNaN(year) || Number.isNaN(month)) {
    return { schedule, unknownCodes };
  }

  const lastDay = new Date(year, month, 0).getDate();
  const dayAxis = detectDayAxis(grid);

  if (dayAxis.axis === "col") {
    const dayColumn = dayAxis.idx;
    const valueColumn = dayColumn + 1;

    for (const row of grid) {
      const dayCell = (row[dayColumn] ?? "").trim();
      const match = DAY_CELL_RE.exec(dayCell);
      if (!match) continue;

      const day = Number.parseInt(match[1], 10);
      if (day < 1 || day > lastDay) continue;

      const isoDate = `${yearRaw}-${monthRaw}-${String(day).padStart(2, "0")}` as ISODate;
      upsertResolvedShift((row[valueColumn] ?? "").trim(), isoDate, lookup, customShiftTypes, schedule, unknownCodes);
    }
  } else if (dayAxis.axis === "row") {
    const dayRow = grid[dayAxis.idx] ?? [];
    const valueRow = grid[dayAxis.idx + 1] ?? [];

    for (let columnIndex = 0; columnIndex < dayRow.length; columnIndex += 1) {
      const match = DAY_CELL_RE.exec((dayRow[columnIndex] ?? "").trim());
      if (!match) continue;

      const day = Number.parseInt(match[1], 10);
      if (day < 1 || day > lastDay) continue;

      const isoDate = `${yearRaw}-${monthRaw}-${String(day).padStart(2, "0")}` as ISODate;
      upsertResolvedShift((valueRow[columnIndex] ?? "").trim(), isoDate, lookup, customShiftTypes, schedule, unknownCodes);
    }
  }

  return { schedule, unknownCodes };
}

function resolveNamedSchedule(
  grid: string[][],
  persons: string[],
  userName: string,
  yearMonth: string,
  lookup: Map<string, ShiftLookupValue>,
  customShiftTypes: CustomShiftType[]
): OcrResult {
  const matchedUserName =
    persons.find((person) => person === userName) ??
    persons.find((person) => userName.includes(person) || person.includes(userName));

  if (!matchedUserName) {
    return {
      kind: "error",
      message: `"${userName}" 이름을 근무표에서 찾을 수 없습니다.`,
      code: "NO_TABLE",
    };
  }

  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const lastDay = new Date(year, month, 0).getDate();
  const schedule: Record<ISODate, OcrRecognizedShift> = {};
  const unknownCodes: OcrUnknownCode[] = [];
  const dayAxis = detectDayAxis(grid);

  if (dayAxis.axis === "row") {
    const dayRow = grid[dayAxis.idx] ?? [];
    const personRow = grid.find((row) => (row[0] ?? "").trim() === matchedUserName);
    if (!personRow) {
      return {
        kind: "error",
        message: "근무표에서 해당 행을 찾을 수 없습니다.",
        code: "NO_TABLE",
      };
    }

    for (let columnIndex = 0; columnIndex < dayRow.length; columnIndex += 1) {
      const match = DAY_CELL_RE.exec((dayRow[columnIndex] ?? "").trim());
      if (!match) continue;

      const day = Number.parseInt(match[1], 10);
      if (day < 1 || day > lastDay) continue;

      const isoDate = `${yearRaw}-${monthRaw}-${String(day).padStart(2, "0")}` as ISODate;
      upsertResolvedShift((personRow[columnIndex] ?? "").trim(), isoDate, lookup, customShiftTypes, schedule, unknownCodes);
    }
  } else if (dayAxis.axis === "col") {
    const headerRow = grid[0] ?? [];
    const personColumn = headerRow.findIndex((cell) => cell.trim() === matchedUserName);
    if (personColumn < 0) {
      return {
        kind: "error",
        message: "근무표에서 해당 열을 찾을 수 없습니다.",
        code: "NO_TABLE",
      };
    }

    for (const row of grid.slice(1)) {
      const match = DAY_CELL_RE.exec((row[dayAxis.idx] ?? "").trim());
      if (!match) continue;

      const day = Number.parseInt(match[1], 10);
      if (day < 1 || day > lastDay) continue;

      const isoDate = `${yearRaw}-${monthRaw}-${String(day).padStart(2, "0")}` as ISODate;
      upsertResolvedShift((row[personColumn] ?? "").trim(), isoDate, lookup, customShiftTypes, schedule, unknownCodes);
    }
  }

  return {
    kind: "multi_person_resolved",
    yearMonth,
    userName: matchedUserName,
    schedule,
    unknownCodes,
  };
}

export async function scanScheduleImage(
  file: File,
  customShiftTypes: CustomShiftType[],
  yearMonthHint?: string | null,
  preferredUserName?: string | null,
  onProgress?: (progress: OcrProgress) => void
): Promise<OcrResult> {
  const reportProgress = (stage: OcrProgressStage, pct: number, message: string) => {
    onProgress?.({ stage, pct, message });
  };

  if (
    !file.type.startsWith("image/") &&
    !file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|tiff?)$/i)
  ) {
    return {
      kind: "error",
      message: "이미지 파일만 지원합니다 (JPG, PNG, HEIC 등)",
      code: "UNSUPPORTED_FILE",
    };
  }

  try {
    reportProgress("loading", 5, "Tesseract.js 로딩 중...");
    const { createWorker, OEM } = await import("tesseract.js");

    reportProgress("loading", 20, "한국어 OCR 모델 준비 중... (첫 실행 시 ~5MB 다운로드)");
    const worker = await createWorker("kor+eng", OEM.LSTM_ONLY, {
      workerBlobURL: false,
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract/lang",
      logger: (event) => {
        if (event.status === "recognizing text") {
          reportProgress(
            "recognizing",
            20 + Math.round(60 * event.progress),
            "텍스트 인식 중..."
          );
        }
      },
    });

    reportProgress("recognizing", 25, "이미지 분석 중...");
    let recognitionResult: any;

    try {
      recognitionResult = await worker.recognize(file);
    } finally {
      await worker.terminate().catch(() => undefined);
    }

    reportProgress("parsing", 82, "테이블 구조 분석 중...");

    const data = recognitionResult?.data ?? {};
    const rawWords = (data.words ?? []).filter((word: any) => word.text?.trim());
    const filteredWords = rawWords.filter((word: any) => word.confidence > 20);
    const words = (filteredWords.length > 0 ? filteredWords : rawWords)
      .map(
        (word: any): OcrWord => ({
          text: word.text.trim(),
          bbox: word.bbox,
          confidence: word.confidence,
        })
      );

    if (!words.length) {
      return {
        kind: "error",
        message: "텍스트를 인식하지 못했습니다. 더 선명한 이미지를 사용해 주세요.",
        code: "NO_TEXT",
      };
    }

    const yearMonth = normalizeYearMonthHint(yearMonthHint) || guessYearMonth(data.text ?? "");
    const grid = wordsToGrid(words);

    if (grid.length < 2 || (grid[0]?.length ?? 0) < 2) {
      return {
        kind: "error",
        message: "근무표 형식을 찾지 못했습니다. 표 전체가 보이도록 다시 찍어주세요.",
        code: "NO_TABLE",
      };
    }

    reportProgress("parsing", 90, "근무 코드 분석 중...");
    const lookup = buildShiftLookup(customShiftTypes);

    if (classifyGrid(grid) === "multi_person") {
      const persons = extractCandidatePersons(grid);
      if (preferredUserName && persons.length > 0) {
        return resolveNamedSchedule(grid, persons, preferredUserName, yearMonth, lookup, customShiftTypes);
      }

      return {
        kind: "multi_person_pending",
        yearMonth,
        persons,
        rawGrid: grid,
      };
    }

    const { schedule, unknownCodes } = parseGridSchedule(grid, yearMonth, lookup, customShiftTypes);
    reportProgress("parsing", 100, "완료");

    return {
      kind: "individual",
      yearMonth,
      schedule,
      unknownCodes,
    };
  } catch (error) {
    console.error("[ocrSchedule] 오류:", error);
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "OCR 처리 중 오류가 발생했습니다.",
      code: "OCR_FAILED",
    };
  }
}

export function resolveMultiPersonSchedule(
  pending: OcrPendingResult,
  userName: string,
  customShiftTypes: CustomShiftType[]
): OcrResult {
  const lookup = buildShiftLookup(customShiftTypes);
  const persons = extractCandidatePersons(pending.rawGrid);
  return resolveNamedSchedule(
    pending.rawGrid,
    persons,
    userName,
    pending.yearMonth,
    lookup,
    customShiftTypes
  );
}
