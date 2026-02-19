#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const DEFAULT_DATASET_PATH = "datasets/handoff-eval/starter.ko.json";
const COMPILED_PIPELINE_PATH = ".tmp/handoff-tests/handoff/pipeline.js";

function fail(message) {
  console.error(`[handoff-eval] ${message}`);
  process.exit(1);
}

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function safeRegex(pattern, flags = "i") {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function matchAnyPattern(texts, patternSpec) {
  const regex = safeRegex(patternSpec.pattern, patternSpec.flags);
  if (!regex) return false;
  return texts.some((text) => regex.test(text));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function loadDataset(datasetPath) {
  if (!fs.existsSync(datasetPath)) {
    fail(`dataset not found: ${datasetPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  } catch (error) {
    fail(`failed to parse dataset JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || !Array.isArray(parsed.cases) || !parsed.cases.length) {
    fail("dataset.cases must be a non-empty array");
  }

  return parsed;
}

function buildRawSegments(caseSpec, transcriptToRawSegments) {
  if (Array.isArray(caseSpec.segments) && caseSpec.segments.length) {
    const durationMs = Number(caseSpec.segmentDurationMs ?? 4000);
    return caseSpec.segments.map((segment, index) => {
      const startMs = Number(segment.startMs ?? index * durationMs);
      const endMs = Number(segment.endMs ?? startMs + durationMs);
      return {
        segmentId: `${caseSpec.id}-seg-${String(index + 1).padStart(3, "0")}`,
        rawText: String(segment.text ?? ""),
        startMs,
        endMs,
      };
    });
  }

  if (typeof caseSpec.transcript === "string" && caseSpec.transcript.trim()) {
    return transcriptToRawSegments(caseSpec.transcript, {
      idPrefix: caseSpec.id,
      segmentDurationMs: Number(caseSpec.segmentDurationMs ?? 4000),
    });
  }

  fail(`case ${caseSpec.id}: either segments[] or transcript is required`);
}

function countMatrix(rows, predAliases, expectedLabels) {
  const matrix = predAliases.map(() => expectedLabels.map(() => 0));
  rows.forEach((row) => {
    if (!row.pred || !row.expected) return;
    const pIdx = predAliases.indexOf(row.pred);
    const eIdx = expectedLabels.indexOf(row.expected);
    if (pIdx < 0 || eIdx < 0) return;
    matrix[pIdx][eIdx] += 1;
  });
  return matrix;
}

function findBestAliasMapping(predAliases, expectedLabels, matrix) {
  const n = predAliases.length;
  const m = expectedLabels.length;
  const memo = new Map();

  function score(i, usedMask) {
    if (i >= n) return 0;
    const key = `${i}|${usedMask}`;
    if (memo.has(key)) return memo.get(key);

    let best = score(i + 1, usedMask);
    for (let j = 0; j < m; j += 1) {
      if ((usedMask & (1 << j)) !== 0) continue;
      const candidate = matrix[i][j] + score(i + 1, usedMask | (1 << j));
      if (candidate > best) best = candidate;
    }

    memo.set(key, best);
    return best;
  }

  function reconstruct(i, usedMask, out) {
    if (i >= n) return;
    const current = score(i, usedMask);
    const skip = score(i + 1, usedMask);
    if (skip === current) {
      reconstruct(i + 1, usedMask, out);
      return;
    }

    for (let j = 0; j < m; j += 1) {
      if ((usedMask & (1 << j)) !== 0) continue;
      const candidate = matrix[i][j] + score(i + 1, usedMask | (1 << j));
      if (candidate === current) {
        out[predAliases[i]] = expectedLabels[j];
        reconstruct(i + 1, usedMask | (1 << j), out);
        return;
      }
    }

    reconstruct(i + 1, usedMask, out);
  }

  const predToExpected = {};
  reconstruct(0, 0, predToExpected);

  const expectedToPred = {};
  Object.entries(predToExpected).forEach(([pred, expected]) => {
    expectedToPred[expected] = pred;
  });

  return {
    predToExpected,
    expectedToPred,
    matchedScore: score(0, 0),
  };
}

function evaluateSegmentAssignment(caseSpec, rawSegments, output) {
  const expectedSegments = (caseSpec.segments ?? []).filter((item) => Object.hasOwn(item, "expectedPatient"));
  if (!expectedSegments.length) return null;

  const segmentAlias = new Map(
    output.local.maskedSegments.map((segment) => [segment.segmentId, segment.patientAlias ?? null])
  );

  const rows = rawSegments.map((segment, index) => ({
    segmentId: segment.segmentId,
    expected: expectedSegments[index]?.expectedPatient ?? null,
    pred: segmentAlias.get(segment.segmentId) ?? null,
  }));

  const expectedLabels = [...new Set(rows.map((row) => row.expected).filter(Boolean))];
  const predAliases = [...new Set(rows.map((row) => row.pred).filter(Boolean))];
  const matrix = countMatrix(rows, predAliases, expectedLabels);
  const mapping = findBestAliasMapping(predAliases, expectedLabels, matrix);

  let correct = 0;
  rows.forEach((row) => {
    if (!row.expected) {
      if (!row.pred) correct += 1;
      return;
    }
    const mapped = row.pred ? mapping.predToExpected[row.pred] ?? null : null;
    if (mapped === row.expected) correct += 1;
  });

  return {
    rows,
    mapping,
    accuracy: rows.length ? correct / rows.length : 0,
  };
}

function evaluateTodoPatterns(caseSpec, output, segmentEval) {
  const patterns = caseSpec.expected?.todoPatterns ?? [];
  if (!patterns.length) return null;

  const patientTodoMap = new Map(output.result.patients.map((patient) => [patient.alias, patient.todos.map((item) => item.text)]));
  const allTodos = output.result.patients.flatMap((patient) => patient.todos.map((item) => item.text));
  const hasExplicitMapping = Boolean(segmentEval && Object.keys(segmentEval.mapping.expectedToPred).length);

  let hits = 0;
  const misses = [];
  patterns.forEach((patternSpec) => {
    const expectedLabel = patternSpec.patient ?? null;
    const mappedAlias =
      expectedLabel && segmentEval ? segmentEval.mapping.expectedToPred[expectedLabel] ?? null : null;
    const candidateTexts = expectedLabel
      ? mappedAlias
        ? patientTodoMap.get(mappedAlias) ?? []
        : hasExplicitMapping
          ? []
          : allTodos
      : allTodos;
    const matched = matchAnyPattern(candidateTexts, patternSpec);
    if (matched) {
      hits += 1;
    } else {
      misses.push({
        patient: expectedLabel,
        pattern: patternSpec.pattern,
      });
    }
  });

  return {
    recall: patterns.length ? hits / patterns.length : 0,
    hits,
    total: patterns.length,
    misses,
  };
}

function evaluateGlobalTopPatterns(caseSpec, output) {
  const patterns = caseSpec.expected?.globalTopPatterns ?? [];
  if (!patterns.length) return null;

  let hits = 0;
  const misses = [];
  patterns.forEach((patternSpec) => {
    const rankMax = Number(patternSpec.rankMax ?? 5);
    const targetTexts = output.result.globalTop.slice(0, rankMax).map((item) => item.text);
    const matched = matchAnyPattern(targetTexts, patternSpec);
    if (matched) {
      hits += 1;
    } else {
      misses.push({
        pattern: patternSpec.pattern,
        rankMax,
      });
    }
  });

  return {
    recall: patterns.length ? hits / patterns.length : 0,
    hits,
    total: patterns.length,
    misses,
  };
}

function evaluateUncertainty(caseSpec, output) {
  const mustInclude = caseSpec.expected?.uncertaintyKindsMustInclude ?? [];
  const mustNotInclude = caseSpec.expected?.uncertaintyKindsMustNotInclude ?? [];
  if (!mustInclude.length && !mustNotInclude.length) return null;

  const present = new Set(output.result.uncertainties.map((item) => item.kind));
  const includeHits = mustInclude.filter((kind) => present.has(kind)).length;
  const includeRecall = mustInclude.length ? includeHits / mustInclude.length : null;
  const violated = mustNotInclude.filter((kind) => present.has(kind));

  return {
    includeRecall,
    includeHits,
    includeTotal: mustInclude.length,
    mustNotTotal: mustNotInclude.length,
    mustNotPass: violated.length === 0,
    violated,
  };
}

function evaluatePatientCount(caseSpec, output) {
  const expectedCount = caseSpec.expected?.patientCount;
  const expectedMin = caseSpec.expected?.patientCountMin;
  if (expectedCount == null && expectedMin == null) return null;

  const predicted = output.result.patients.length;
  const eqPass = expectedCount == null ? null : predicted === Number(expectedCount);
  const minPass = expectedMin == null ? null : predicted >= Number(expectedMin);

  return {
    predicted,
    expectedCount: expectedCount == null ? null : Number(expectedCount),
    expectedMin: expectedMin == null ? null : Number(expectedMin),
    pass: (eqPass ?? true) && (minPass ?? true),
  };
}

function computeCaseScore(parts) {
  const weighted = [];
  if (parts.segment != null) weighted.push({ weight: 0.45, value: parts.segment });
  if (parts.todo != null) weighted.push({ weight: 0.2, value: parts.todo });
  if (parts.top != null) weighted.push({ weight: 0.15, value: parts.top });
  if (parts.uncertaintyInclude != null) weighted.push({ weight: 0.1, value: parts.uncertaintyInclude });
  if (parts.patientCountPass != null) weighted.push({ weight: 0.1, value: parts.patientCountPass ? 1 : 0 });

  if (!weighted.length) return 0;
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const base = weighted.reduce((sum, item) => sum + item.weight * item.value, 0) / totalWeight;
  const excludePenalty = parts.uncertaintyExcludePass === false ? 0.15 : 0;
  return Math.max(0, base - excludePenalty);
}

function printCaseReport(result) {
  const fields = [
    `${result.id}`,
    `score=${toPercent(result.score)}`,
    result.segmentAccuracy == null ? null : `split=${toPercent(result.segmentAccuracy)}`,
    result.todoRecall == null ? null : `todo=${toPercent(result.todoRecall)}`,
    result.globalTopRecall == null ? null : `top=${toPercent(result.globalTopRecall)}`,
    result.patientCountPass == null ? null : `pcount=${result.patientCountPass ? "pass" : "fail"}`,
    `runtime=${result.runtimeMs.toFixed(1)}ms`,
  ].filter(Boolean);
  console.log(`- ${fields.join(" | ")}`);

  if (result.todoMisses.length) {
    console.log(`  todo misses: ${result.todoMisses.map((item) => `${item.patient ?? "any"}:${item.pattern}`).join(", ")}`);
  }
  if (result.topMisses.length) {
    console.log(`  top misses: ${result.topMisses.map((item) => `${item.pattern}@${item.rankMax}`).join(", ")}`);
  }
  if (result.uncertaintyViolated.length) {
    console.log(`  uncertainty violated: ${result.uncertaintyViolated.join(", ")}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const datasetArg = args.find((arg) => !arg.startsWith("--"));
  const datasetPath = path.resolve(datasetArg ?? DEFAULT_DATASET_PATH);

  const dataset = loadDataset(datasetPath);
  const compiledPath = path.resolve(COMPILED_PIPELINE_PATH);
  if (!fs.existsSync(compiledPath)) {
    fail(
      `compiled pipeline not found: ${compiledPath}. run 'npm run test:handoff' or compile tsconfig.handoff-tests.json first.`
    );
  }

  const pipelineModule = await import(pathToFileURL(compiledPath).href);
  const runHandoffPipeline = pipelineModule.runHandoffPipeline;
  const transcriptToRawSegments = pipelineModule.transcriptToRawSegments;
  if (typeof runHandoffPipeline !== "function" || typeof transcriptToRawSegments !== "function") {
    fail("failed to load pipeline functions from compiled module");
  }

  const caseResults = [];

  for (const caseSpec of dataset.cases) {
    const caseId = String(caseSpec.id ?? "");
    if (!caseId) fail("every case requires a non-empty id");

    const rawSegments = buildRawSegments(caseSpec, transcriptToRawSegments);
    const t0 = performance.now();
    const output = runHandoffPipeline({
      sessionId: `eval_${caseId}`,
      dutyType: caseSpec.dutyType ?? "night",
      rawSegments,
    });
    const t1 = performance.now();

    const segmentEval = evaluateSegmentAssignment(caseSpec, rawSegments, output);
    const todoEval = evaluateTodoPatterns(caseSpec, output, segmentEval);
    const topEval = evaluateGlobalTopPatterns(caseSpec, output);
    const uncertaintyEval = evaluateUncertainty(caseSpec, output);
    const countEval = evaluatePatientCount(caseSpec, output);

    const score = computeCaseScore({
      segment: segmentEval?.accuracy ?? null,
      todo: todoEval?.recall ?? null,
      top: topEval?.recall ?? null,
      uncertaintyInclude: uncertaintyEval?.includeRecall ?? null,
      uncertaintyExcludePass: uncertaintyEval?.mustNotPass ?? null,
      patientCountPass: countEval?.pass ?? null,
    });

    caseResults.push({
      id: caseId,
      score,
      runtimeMs: t1 - t0,
      segmentAccuracy: segmentEval?.accuracy ?? null,
      todoRecall: todoEval?.recall ?? null,
      globalTopRecall: topEval?.recall ?? null,
      uncertaintyIncludeRecall: uncertaintyEval?.includeRecall ?? null,
      uncertaintyExcludePass: uncertaintyEval?.mustNotPass ?? null,
      patientCountPass: countEval?.pass ?? null,
      todoMisses: todoEval?.misses ?? [],
      topMisses: topEval?.misses ?? [],
      uncertaintyViolated: uncertaintyEval?.violated ?? [],
      todoPreview: output.result.patients.flatMap((patient) => patient.todos.map((item) => `${patient.alias}:${item.text}`)).slice(0, 8),
      globalTopPreview: output.result.globalTop.map((item) => `${item.alias}:${item.text}`).slice(0, 8),
    });
  }

  const avg = (arr) => (arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : null);
  const scores = caseResults.map((item) => item.score);
  const runtimes = caseResults.map((item) => item.runtimeMs);
  const splitScores = caseResults.map((item) => item.segmentAccuracy).filter((value) => value != null);
  const todoScores = caseResults.map((item) => item.todoRecall).filter((value) => value != null);
  const topScores = caseResults.map((item) => item.globalTopRecall).filter((value) => value != null);
  const includeScores = caseResults.map((item) => item.uncertaintyIncludeRecall).filter((value) => value != null);
  const patientCountPassRate = caseResults
    .map((item) => item.patientCountPass)
    .filter((value) => value != null);

  const summary = {
    dataset: dataset.name ?? path.basename(datasetPath),
    totalCases: caseResults.length,
    avgScore: avg(scores) ?? 0,
    avgRuntimeMs: avg(runtimes) ?? 0,
    p50RuntimeMs: percentile(runtimes, 50),
    p95RuntimeMs: percentile(runtimes, 95),
    splitAccuracyAvg: avg(splitScores) ?? null,
    todoRecallAvg: avg(todoScores) ?? null,
    globalTopRecallAvg: avg(topScores) ?? null,
    uncertaintyIncludeRecallAvg: avg(includeScores) ?? null,
    patientCountPassRate:
      patientCountPassRate.length ? patientCountPassRate.filter(Boolean).length / patientCountPassRate.length : null,
    passRateAt80: caseResults.filter((item) => item.score >= 0.8).length / caseResults.length,
  };

  if (jsonMode) {
    console.log(JSON.stringify({ summary, cases: caseResults }, null, 2));
    return;
  }

  console.log(`[handoff-eval] dataset=${summary.dataset} cases=${summary.totalCases}`);
  console.log("[handoff-eval] per-case");
  caseResults.forEach(printCaseReport);
  console.log("[handoff-eval] summary");
  console.log(`- avg score: ${toPercent(summary.avgScore)}`);
  console.log(`- pass@80: ${toPercent(summary.passRateAt80)}`);
  console.log(
    `- runtime avg/p50/p95: ${summary.avgRuntimeMs.toFixed(1)}ms / ${summary.p50RuntimeMs.toFixed(1)}ms / ${summary.p95RuntimeMs.toFixed(1)}ms`
  );
  if (summary.splitAccuracyAvg != null) console.log(`- split accuracy avg: ${toPercent(summary.splitAccuracyAvg)}`);
  if (summary.todoRecallAvg != null) console.log(`- todo recall avg: ${toPercent(summary.todoRecallAvg)}`);
  if (summary.globalTopRecallAvg != null) console.log(`- globalTop recall avg: ${toPercent(summary.globalTopRecallAvg)}`);
  if (summary.uncertaintyIncludeRecallAvg != null) {
    console.log(`- uncertainty include recall avg: ${toPercent(summary.uncertaintyIncludeRecallAvg)}`);
  }
  if (summary.patientCountPassRate != null) {
    console.log(`- patient count pass rate: ${toPercent(summary.patientCountPassRate)}`);
  }
}

void main();
