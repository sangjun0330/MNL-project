#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUTPUT_PATH = path.resolve("src/lib/handoff/medicalPronunciationLexicon.ts");
const SOURCE_INDEX_PATH = path.resolve(".tmp/handoff-lexicon-sources.json");

function fail(message) {
  console.error(`[build-medical-lexicon] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[build-medical-lexicon] ${message}`);
}

function unique(values) {
  return [...new Set(values)];
}

function fold(value) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[()\[\]{}'"`]/g, "")
    .replace(/[.;:]/g, "")
    .replace(/[\s_\-/]+/g, "")
    .replace(/&/g, "and")
    .trim();
}

function normalizePrintable(value) {
  return value.replace(/\s+/g, " ").trim();
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => normalizePrintable(item))
    .filter(Boolean);
}

function extractPdfTextViaSwift(pdfPath) {
  const escapedPath = pdfPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const swiftCode = `
import Foundation
import PDFKit

let path = "${escapedPath}"
let url = URL(fileURLWithPath: path)
guard let doc = PDFDocument(url: url) else {
  fputs("FAILED_TO_OPEN\\n", stderr)
  exit(1)
}
var pages: [String] = []
for i in 0..<doc.pageCount {
  pages.append("--- PAGE \\(i + 1) ---")
  if let text = doc.page(at: i)?.string {
    pages.append(text)
  }
}
print(pages.joined(separator: "\\n"))
`;

  try {
    return execFileSync("swift", ["-e", swiftCode], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    fail(`swift PDF extraction failed for ${pdfPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseEntriesFromPdfText(pdfText) {
  const flattened = pdfText
    .replace(/---\s*PAGE\s*\d+\s*---/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chunked = flattened.replace(/(\d{4}\.\s*\[)/g, "\n$1");
  const chunks = chunked
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => /^\d{4}\.\s*\[/.test(part));

  const entries = [];
  for (const chunk of chunks) {
    const match = chunk.match(
      /^\d{4}\.\s*\[([^\]]+)\]\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*발음:\s*([^|]+?)(?:\s*\|\s*동의어(?:\(있으면\))?:\s*(.+))?$/i
    );
    if (!match) continue;

    const term = normalizePrintable(match[1] ?? "");
    const full = normalizePrintable(match[2] ?? "");
    const meaning = normalizePrintable(match[3] ?? "");
    const pronunciations = splitList(match[4] ?? "");
    const synonyms = splitList(match[5] ?? "");

    if (!term || !full || !meaning) continue;

    entries.push({
      term,
      full,
      meaning,
      pronunciations,
      synonyms,
    });
  }

  return entries;
}

function parseConfusionPairsFromText(pdfText) {
  const pairs = [];
  const regex = /[•·]\s*([A-Za-z][A-Za-z0-9/&.\-\s]{0,32})\s*↔\s*([A-Za-z][A-Za-z0-9/&.\-\s]{0,32})/g;
  let match = regex.exec(pdfText);
  while (match) {
    const left = normalizePrintable(match[1] ?? "");
    const right = normalizePrintable(match[2] ?? "");
    if (left && right) pairs.push([left, right]);
    match = regex.exec(pdfText);
  }
  return pairs;
}

function walkPdfFiles(rootPath) {
  const files = [];
  const queue = [rootPath];
  while (queue.length) {
    const current = queue.pop();
    if (!current) continue;
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      if (/\.pdf$/i.test(current)) files.push(current);
      continue;
    }
    if (!stat.isDirectory()) continue;

    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      if (entry.name.startsWith(".")) return;
      queue.push(path.join(current, entry.name));
    });
  }
  return files;
}

function resolveSourcePaths(inputs) {
  const files = [];
  inputs.forEach((input) => {
    const absolute = path.resolve(input);
    if (!fs.existsSync(absolute)) {
      warn(`source path missing and skipped: ${absolute}`);
      return;
    }
    files.push(...walkPdfFiles(absolute));
  });
  return unique(files.map((item) => path.resolve(item))).sort((a, b) => a.localeCompare(b, "en"));
}

function loadSourceIndex() {
  if (!fs.existsSync(SOURCE_INDEX_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(SOURCE_INDEX_PATH, "utf8"));
    const list = Array.isArray(parsed?.sources) ? parsed.sources : [];
    return list.filter((item) => typeof item === "string").map((item) => path.resolve(item));
  } catch (error) {
    warn(
      `failed to parse source index, ignoring: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

function saveSourceIndex(sources) {
  const payload = {
    updatedAt: new Date().toISOString(),
    sources: unique(sources.map((item) => path.resolve(item))).sort((a, b) => a.localeCompare(b, "en")),
  };
  fs.mkdirSync(path.dirname(SOURCE_INDEX_PATH), { recursive: true });
  fs.writeFileSync(SOURCE_INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseJsonArrayBlock(fileText, startMarker, endMarker) {
  const start = fileText.indexOf(startMarker);
  if (start < 0) return null;
  const fromStart = fileText.slice(start + startMarker.length);
  const end = fromStart.indexOf(endMarker);
  if (end < 0) return null;
  const block = fromStart.slice(0, end).trim();
  try {
    return JSON.parse(block);
  } catch (error) {
    warn(
      `failed to parse existing generated array block: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

function parseExistingSourcePdfs(fileText) {
  const sourcePdfsMarker = "sourcePdfs:";
  const sourcePdfMarker = "sourcePdf:";
  if (fileText.includes(sourcePdfsMarker)) {
    const after = fileText.slice(fileText.indexOf(sourcePdfsMarker) + sourcePdfsMarker.length);
    const firstBracket = after.indexOf("[");
    if (firstBracket >= 0) {
      let depth = 0;
      let endIndex = -1;
      for (let i = firstBracket; i < after.length; i += 1) {
        const ch = after[i];
        if (ch === "[") depth += 1;
        if (ch === "]") depth -= 1;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
      if (endIndex >= 0) {
        const block = after.slice(firstBracket, endIndex + 1);
        try {
          const parsed = JSON.parse(block);
          if (Array.isArray(parsed)) {
            return parsed.filter((item) => typeof item === "string");
          }
        } catch {
          // ignore
        }
      }
    }
  }

  const sourcePdfMatch = fileText.match(/sourcePdf:\s*"([^"]+)"/);
  if (sourcePdfMatch?.[1]) {
    return [sourcePdfMatch[1]];
  }

  return [];
}

function loadExistingSeed() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return {
      entries: [],
      confusionPairs: [],
      sourcePdfs: [],
    };
  }

  const fileText = fs.readFileSync(OUTPUT_PATH, "utf8");
  const entries =
    parseJsonArrayBlock(
      fileText,
      "export const MEDICAL_PRONUNCIATION_ENTRIES: MedicalPronunciationEntry[] =",
      ";\n\nexport const MEDICAL_CONFUSION_PAIRS"
    ) ?? [];
  const confusionPairs =
    parseJsonArrayBlock(
      fileText,
      "export const MEDICAL_CONFUSION_PAIRS: ReadonlyArray<readonly [string, string]> =",
      ";\n"
    ) ?? [];

  return {
    entries: Array.isArray(entries) ? entries : [],
    confusionPairs: Array.isArray(confusionPairs) ? confusionPairs : [],
    sourcePdfs: parseExistingSourcePdfs(fileText),
  };
}

function selectPrimaryTerm(terms) {
  const ordered = [...terms].sort((a, b) => {
    const aUpper = /^[A-Z0-9/&.\- ]+$/.test(a);
    const bUpper = /^[A-Z0-9/&.\- ]+$/.test(b);
    if (aUpper !== bUpper) return aUpper ? -1 : 1;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b, "en");
  });
  return ordered[0] ?? "";
}

function mergeEntries(entries) {
  const bucket = new Map();

  for (const entry of entries) {
    const key = `${fold(entry.meaning)}|${fold(entry.full)}`;
    if (!bucket.has(key)) {
      bucket.set(key, {
        full: entry.full,
        meaning: entry.meaning,
        terms: new Set(),
        pronunciations: new Set(),
      });
    }

    const target = bucket.get(key);
    target.terms.add(entry.term);
    entry.synonyms.forEach((value) => target.terms.add(value));
    entry.pronunciations.forEach((value) => target.pronunciations.add(value));
  }

  const merged = [];
  for (const value of bucket.values()) {
    const allTerms = unique([...value.terms].map(normalizePrintable).filter(Boolean));
    const primary = selectPrimaryTerm(allTerms);
    const synonyms = allTerms.filter((term) => term !== primary);
    const pronunciations = unique([...value.pronunciations].map(normalizePrintable).filter(Boolean));

    merged.push({
      term: primary,
      full: value.full,
      meaning: value.meaning,
      pronunciations: pronunciations.sort((a, b) => a.localeCompare(b, "ko")),
      synonyms: synonyms.sort((a, b) => a.localeCompare(b, "ko")),
    });
  }

  return merged.sort((a, b) => {
    const byMeaning = a.meaning.localeCompare(b.meaning, "ko");
    if (byMeaning !== 0) return byMeaning;
    const byFull = a.full.localeCompare(b.full, "en");
    if (byFull !== 0) return byFull;
    return a.term.localeCompare(b.term, "en");
  });
}

function mergeConfusionPairs(pairs) {
  const merged = new Map();

  for (const [leftRaw, rightRaw] of pairs) {
    const left = normalizePrintable(leftRaw);
    const right = normalizePrintable(rightRaw);
    if (!left || !right) continue;

    const normalizedPair = [left, right].sort((a, b) => a.localeCompare(b, "en"));
    const key = normalizedPair.map((item) => fold(item)).join("|");
    if (!merged.has(key)) merged.set(key, [normalizedPair[0], normalizedPair[1]]);
  }

  return [...merged.values()].sort((a, b) => {
    const leftCompare = a[0].localeCompare(b[0], "en");
    if (leftCompare !== 0) return leftCompare;
    return a[1].localeCompare(b[1], "en");
  });
}

function generateModule({
  sourcePdfs,
  seedEntryCount,
  seedConfusionPairCount,
  extractedEntryCount,
  extractedConfusionPairCount,
  mergedEntries,
  confusionPairs,
}) {
  return `// Auto-generated by scripts/handoff/build-medical-lexicon.mjs
// Sources: ${sourcePdfs.join(", ")}
// Do not edit manually.

export type MedicalPronunciationEntry = {
  term: string;
  full: string;
  meaning: string;
  pronunciations: string[];
  synonyms: string[];
};

export const MEDICAL_PRONUNCIATION_LEXICON_META = {
  sourcePdfs: ${JSON.stringify(sourcePdfs, null, 2)},
  seedEntryCount: ${seedEntryCount},
  seedConfusionPairCount: ${seedConfusionPairCount},
  extractedEntryCount: ${extractedEntryCount},
  extractedConfusionPairCount: ${extractedConfusionPairCount},
  mergedEntryCount: ${mergedEntries.length},
  mergedConfusionPairCount: ${confusionPairs.length},
  generatedAt: "${new Date().toISOString()}",
};

export const MEDICAL_PRONUNCIATION_ENTRIES: MedicalPronunciationEntry[] = ${JSON.stringify(mergedEntries, null, 2)};

export const MEDICAL_CONFUSION_PAIRS: ReadonlyArray<readonly [string, string]> = ${JSON.stringify(
    confusionPairs,
    null,
    2
  )};
`;
}

function main() {
  const argv = process.argv.slice(2).filter(Boolean);
  const reset = argv.includes("--reset");
  const noSeed = argv.includes("--no-seed");
  const noIndex = argv.includes("--no-index");
  const inputs = argv.filter((arg) => !arg.startsWith("--"));

  const inputSources = resolveSourcePaths(inputs);
  const indexedSources = noIndex || reset ? [] : loadSourceIndex();
  const seed = noSeed || reset ? { entries: [], confusionPairs: [], sourcePdfs: [] } : loadExistingSeed();

  const mergedSourceCandidates = unique(
    [...indexedSources, ...seed.sourcePdfs, ...inputSources].map((item) => path.resolve(item))
  );
  const sourcePdfs = mergedSourceCandidates.filter((item) => fs.existsSync(item));
  const missingSources = mergedSourceCandidates.filter((item) => !fs.existsSync(item));
  missingSources.forEach((item) => warn(`missing source omitted: ${item}`));

  if (!sourcePdfs.length) {
    fail(
      "No PDF sources found. Provide PDF path(s) or keep .tmp/handoff-lexicon-sources.json populated."
    );
  }

  const pdfEntries = [];
  const pdfPairs = [];

  for (const sourcePath of sourcePdfs) {
    const pdfText = extractPdfTextViaSwift(sourcePath);
    const entries = parseEntriesFromPdfText(pdfText);
    const pairs = parseConfusionPairsFromText(pdfText);

    pdfEntries.push(...entries);
    pdfPairs.push(...pairs);

    console.log(
      `[build-medical-lexicon] ${path.basename(sourcePath)} -> entries=${entries.length}, confusionPairs=${pairs.length}`
    );
  }

  const mergedEntries = mergeEntries([...seed.entries, ...pdfEntries]);
  const confusionPairs = mergeConfusionPairs([...seed.confusionPairs, ...pdfPairs]);
  const moduleCode = generateModule({
    sourcePdfs,
    seedEntryCount: seed.entries.length,
    seedConfusionPairCount: seed.confusionPairs.length,
    extractedEntryCount: pdfEntries.length,
    extractedConfusionPairCount: pdfPairs.length,
    mergedEntries,
    confusionPairs,
  });

  fs.writeFileSync(OUTPUT_PATH, moduleCode, "utf8");
  saveSourceIndex(sourcePdfs);

  console.log(
    `[build-medical-lexicon] wrote ${OUTPUT_PATH} (seedEntries=${seed.entries.length}, extractedEntries=${pdfEntries.length}, mergedEntries=${mergedEntries.length}, confusionPairs=${confusionPairs.length})`
  );
}

main();
