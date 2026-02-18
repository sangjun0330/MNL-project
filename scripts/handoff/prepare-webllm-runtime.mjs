#!/usr/bin/env node

import { mkdir, copyFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function ensureWebLlmRuntime() {
  const root = process.cwd();
  const source = path.join(root, "node_modules", "@mlc-ai", "web-llm", "lib", "index.js");
  const target = path.join(root, "public", "runtime", "vendor", "web-llm", "index.js");

  await access(source);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  console.log(`[handoff] prepared WebLLM runtime: ${path.relative(root, target)}`);
}

ensureWebLlmRuntime().catch((error) => {
  console.error("[handoff] failed to prepare WebLLM runtime");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
