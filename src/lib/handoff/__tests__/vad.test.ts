import test from "node:test";
import assert from "node:assert/strict";
import { analyzeVadPcm } from "../vad";

test("analyzeVadPcm returns no speech segments for silence", () => {
  const pcm = new Float32Array(16_000);
  const result = analyzeVadPcm(pcm, 16_000, {
    threshold: 0.01,
  });

  assert.equal(result.segments.length, 0);
  assert.equal(result.speechRatio, 0);
});

test("analyzeVadPcm detects voiced segments", () => {
  const sampleRate = 16_000;
  const seconds = 2;
  const pcm = new Float32Array(sampleRate * seconds);

  // 0.5s ~ 1.2s 구간에 440Hz 톤 삽입
  const start = Math.round(sampleRate * 0.5);
  const end = Math.round(sampleRate * 1.2);
  for (let i = start; i < end; i += 1) {
    pcm[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.16;
  }

  const result = analyzeVadPcm(pcm, sampleRate, {
    threshold: 0.015,
    minSpeechMs: 120,
  });

  assert.ok(result.segments.length >= 1);
  assert.ok(result.speechRatio > 0.2);
});
