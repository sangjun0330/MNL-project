export const LOCAL_TESSERACT_WORKER_OPTIONS = {
  // Avoid blob bootstrap workers so CSP can rely on explicit self-hosted assets.
  workerBlobURL: false,
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/core",
  langPath: "/tesseract/lang",
} as const;
