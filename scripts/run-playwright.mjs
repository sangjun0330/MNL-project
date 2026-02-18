import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const binName = process.platform === "win32" ? "playwright.cmd" : "playwright";
const binPath = join(process.cwd(), "node_modules", ".bin", binName);
const args = process.argv.slice(2);

if (!existsSync(binPath)) {
  console.error(
    "[handoff-e2e] playwright is not installed.\n" +
      "Run: npm install -D playwright\n" +
      "Then: npm run test:e2e:handoff:install"
  );
  process.exit(1);
}

const child = spawn(binPath, args, {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error("[handoff-e2e] failed to launch playwright:", error);
  process.exit(1);
});
