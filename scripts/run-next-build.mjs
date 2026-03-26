import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const isDesktopWorkspace = process.platform === "darwin" && projectRoot.includes(`${path.sep}Desktop${path.sep}`);
const isCiLike = Boolean(process.env.CI || process.env.VERCEL || process.env.CF_PAGES);
const resolvedDistDir = process.env.NEXT_DIST_DIR || (isDesktopWorkspace && !isCiLike ? ".tmp/next-build" : ".next");

console.log(
  `[build] next distDir=${resolvedDistDir} desktopWorkaround=${String(
    isDesktopWorkspace && !isCiLike
  )} ci=${String(Boolean(process.env.CI))} vercel=${String(Boolean(process.env.VERCEL))} cfPages=${String(Boolean(process.env.CF_PAGES))}`
);

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: resolvedDistDir,
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (resolvedDistDir !== ".next") {
  const sourceDir = path.resolve(resolvedDistDir);
  const targetDir = path.resolve(".next");

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`next_dist_missing:${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(sourceDir, sourcePath);
      if (!relative) return true;
      return relative !== "cache" && !relative.startsWith(`cache${path.sep}`);
    },
  });
}
