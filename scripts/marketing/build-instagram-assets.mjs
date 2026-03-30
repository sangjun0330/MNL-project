import fs from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE_URL = process.env.RNEST_MARKETING_BASE_URL ?? "http://127.0.0.1:3000";
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "marketing", "instagram");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const CAROUSEL_DIR = path.join(OUTPUT_DIR, "carousel");
const MOBILE_DEVICE = devices["iPhone 13"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayKstISO() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function buildMarketingState() {
  const today = todayKstISO();
  const schedule = {};
  const notes = {};
  const emotions = {};
  const bio = {};

  const entries = [
    { offset: -9, shift: "OFF", sleepHours: 8.4, napHours: 0.2, stress: 0, activity: 1, caffeineMg: 40, mood: 5, note: "오프날이라 산책하고 일찍 잤어요." },
    { offset: -8, shift: "D", sleepHours: 6.9, napHours: 0, stress: 1, activity: 2, caffeineMg: 90, mood: 4, note: "주간 근무. 물 1L 채우기 성공." },
    { offset: -7, shift: "E", sleepHours: 6.2, napHours: 0.3, stress: 2, activity: 2, caffeineMg: 120, mood: 4, note: "이브닝 근무 후 샤워 루틴으로 회복." },
    { offset: -6, shift: "N", sleepHours: 5.1, napHours: 0.6, stress: 2, activity: 3, caffeineMg: 180, mood: 3, note: "나이트 시작. 카페인은 01시 전에 마감." },
    { offset: -5, shift: "N", sleepHours: 4.8, napHours: 1.1, stress: 3, activity: 3, caffeineMg: 220, mood: 2, note: "두 번째 나이트. 퇴근 후 암막 + 수면 우선." },
    { offset: -4, shift: "OFF", sleepHours: 8.1, napHours: 0.4, stress: 1, activity: 1, caffeineMg: 60, mood: 4, note: "회복일. 낮잠은 짧게." },
    { offset: -3, shift: "D", sleepHours: 6.6, napHours: 0, stress: 1, activity: 2, caffeineMg: 100, mood: 4, note: "주간 근무. 컨디션 안정." },
    { offset: -2, shift: "E", sleepHours: 6.0, napHours: 0.2, stress: 2, activity: 2, caffeineMg: 140, mood: 3, note: "이브닝 전, 카페인 컷오프 지키기." },
    { offset: -1, shift: "N", sleepHours: 4.9, napHours: 0.9, stress: 3, activity: 3, caffeineMg: 210, mood: 2, note: "나이트 전날. 회복 오더가 특히 필요한 날." },
    { offset: 0, shift: "D", sleepHours: 6.3, napHours: 0.3, stress: 2, activity: 2, caffeineMg: 120, mood: 4, note: "오늘은 오전 근무. 물 500mL 먼저 채우기." },
  ];

  for (const entry of entries) {
    const iso = addDaysISO(today, entry.offset);
    schedule[iso] = entry.shift;
    notes[iso] = entry.note;
    emotions[iso] = { mood: entry.mood };
    bio[iso] = {
      sleepHours: entry.sleepHours,
      napHours: entry.napHours,
      stress: entry.stress,
      activity: entry.activity,
      caffeineMg: entry.caffeineMg,
      mood: entry.mood,
      symptomSeverity: entry.offset >= -1 ? 1 : 0,
      menstrualStatus: entry.offset >= -1 ? "period" : "none",
      menstrualFlow: entry.offset === 0 ? 1 : entry.offset === -1 ? 2 : 0,
    };
  }

  const futureShifts = [
    { offset: 1, shift: "E" },
    { offset: 2, shift: "N" },
    { offset: 3, shift: "OFF" },
    { offset: 4, shift: "D" },
    { offset: 5, shift: "D" },
    { offset: 6, shift: "OFF" },
  ];

  for (const item of futureShifts) {
    schedule[addDaysISO(today, item.offset)] = item.shift;
  }

  return {
    selected: today,
    schedule,
    shiftNames: {},
    notes,
    emotions,
    bio,
    memo: {
      folders: {},
      documents: {},
      recent: [],
      personalTemplates: [],
    },
    records: {
      templates: {},
      entries: {},
      recent: [],
    },
    settings: {
      schedulePatternEnabled: true,
      defaultSchedulePattern: "D2E2N2M2OFF2",
      schedulePatternAppliedFrom: null,
      emotionTagsPositive: [],
      emotionTagsNegative: [],
      menstrual: {
        enabled: true,
        lastPeriodStart: addDaysISO(today, -1),
        cycleLength: 28,
        periodLength: 5,
        lutealLength: 14,
        pmsDays: 4,
        sensitivity: 1,
      },
      profile: {
        chronotype: 0.58,
        caffeineSensitivity: 1.1,
      },
      language: "ko",
      hasSeenOnboarding: true,
    },
  };
}

async function ensureDirs() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(CAROUSEL_DIR, { recursive: true });
}

async function readAsDataUrl(filePath, mimeType) {
  const raw = await fs.readFile(filePath);
  return `data:${mimeType};base64,${raw.toString("base64")}`;
}

async function waitForDebugBridge(page) {
  await page.waitForFunction(
    () => Boolean(window.__RNEST_DEBUG__ && window.__RNEST_DEBUG__.store && window.__RNEST_DEBUG__.store.hydrateState),
    null,
    { timeout: 15_000 }
  );
}

async function applyMarketingState(page, marketingState) {
  await waitForDebugBridge(page);
  await page.evaluate((state) => {
    window.__RNEST_DEBUG__.store.hydrateState(state);
  }, marketingState);
  await page.waitForTimeout(700);
}

async function captureRoute(page, route, outputName, marketingState, options = {}) {
  const url = new URL(route, BASE_URL).toString();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
  await applyMarketingState(page, marketingState);
  if (options.scrollY) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), options.scrollY);
    await page.waitForTimeout(250);
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  const outputPath = path.join(RAW_DIR, outputName);
  await page.screenshot({ path: outputPath });
  return outputPath;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildSlideHtml({ title, body, eyebrow, screenshotDataUrl, logoDataUrl, accent, badge }) {
  const titleHtml = escapeHtml(title).replaceAll("\n", "<br />");
  const bodyHtml = escapeHtml(body).replaceAll("\n", "<br />");
  const badgeHtml = badge ? `<div class="badge">${escapeHtml(badge)}</div>` : "";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        --bg: #f7f3ea;
        --ink: #13233b;
        --sub: #5c6e83;
        --card: #fffdf9;
        --accent: ${accent};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: 1080px;
        height: 1350px;
        overflow: hidden;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.95), transparent 34%),
          radial-gradient(circle at 85% 18%, rgba(255,255,255,0.75), transparent 18%),
          linear-gradient(180deg, #f7f3ea 0%, #f1ece2 100%);
        color: var(--ink);
        font-family: "Pretendard", "SUIT", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      }
      .shell {
        position: relative;
        width: 100%;
        height: 100%;
        padding: 76px 72px 64px;
      }
      .orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(6px);
        opacity: 0.88;
      }
      .orb.one {
        top: 84px;
        right: 54px;
        width: 220px;
        height: 220px;
        background: color-mix(in srgb, var(--accent) 18%, white);
      }
      .orb.two {
        bottom: 120px;
        left: -24px;
        width: 180px;
        height: 180px;
        background: rgba(255,255,255,0.85);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
        position: relative;
        z-index: 2;
      }
      .brand img {
        width: 44px;
        height: 44px;
        object-fit: contain;
      }
      .brand .name {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        height: 34px;
        padding: 0 16px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        color: var(--accent);
        border: 1px solid rgba(19, 35, 59, 0.08);
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
        margin-top: 28px;
        position: relative;
        z-index: 2;
      }
      .eyebrow {
        margin-top: 34px;
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--accent);
        position: relative;
        z-index: 2;
      }
      h1 {
        margin: 18px 0 0;
        max-width: 520px;
        font-size: 62px;
        line-height: 1.05;
        letter-spacing: -0.045em;
        position: relative;
        z-index: 2;
      }
      p {
        margin: 24px 0 0;
        max-width: 470px;
        font-size: 26px;
        line-height: 1.5;
        letter-spacing: -0.02em;
        color: var(--sub);
        position: relative;
        z-index: 2;
      }
      .phone-wrap {
        position: absolute;
        right: 72px;
        bottom: 72px;
        width: 430px;
        padding: 18px;
        border-radius: 52px;
        background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.72));
        border: 1px solid rgba(19, 35, 59, 0.08);
        box-shadow:
          0 36px 90px rgba(17, 29, 46, 0.18),
          inset 0 1px 0 rgba(255,255,255,0.92);
        z-index: 2;
      }
      .phone {
        display: block;
        width: 100%;
        border-radius: 38px;
        box-shadow: 0 24px 54px rgba(17, 29, 46, 0.16);
      }
      .foot {
        position: absolute;
        left: 72px;
        bottom: 72px;
        display: flex;
        align-items: center;
        gap: 10px;
        color: rgba(19, 35, 59, 0.5);
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -0.01em;
        z-index: 2;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="orb one"></div>
      <div class="orb two"></div>
      <div class="brand">
        <img src="${logoDataUrl}" alt="RNest" />
        <div class="name">RNest</div>
      </div>
      ${badgeHtml}
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${titleHtml}</h1>
      <p>${bodyHtml}</p>
      <div class="phone-wrap">
        <img class="phone" src="${screenshotDataUrl}" alt="${escapeHtml(title)}" />
      </div>
      <div class="foot">교대근무 간호사를 위한 회복 · 임상 AI 앱</div>
    </div>
  </body>
</html>`;
}

async function buildCarouselSlides(browser, rawFiles) {
  const logoDataUrl = await readAsDataUrl(path.join(ROOT, "public", "rnest-mark.png"), "image/png");
  const slideSpecs = [
    {
      raw: rawFiles.home,
      output: "01-cover.png",
      accent: "#3e66a8",
      badge: "실제 앱 화면",
      eyebrow: "교대근무 회복 앱",
      title: "교대근무 간호사의 회복,\n이제 감으로 버티지 마세요",
      body: "RNest는 일정, 수면, 스트레스, 카페인, 생리 주기까지 함께 읽어 오늘 컨디션과 회복 포인트를 한눈에 보여줍니다.",
    },
    {
      raw: rawFiles.insights,
      output: "02-insights.png",
      accent: "#2b8a7e",
      badge: "기록 기반 인사이트",
      eyebrow: "회복 인사이트",
      title: "수면부채와 피로 흐름을\n숫자로 바로 확인",
      body: "최근 기록을 바탕으로 Body · Mental · 수면부채 · 회복 지수를 요약해서, 오늘 어디를 먼저 관리해야 할지 빠르게 판단할 수 있습니다.",
    },
    {
      raw: rawFiles.schedule,
      output: "03-schedule.png",
      accent: "#e37b4f",
      badge: "3교대 일정 + 건강기록",
      eyebrow: "기록 루틴",
      title: "3교대 일정과 건강 기록,\n한 화면에서 정리",
      body: "Day · Evening · Night · Off 흐름과 수면, 스트레스, 메모를 이어서 남기면 RNest가 패턴을 읽고 회복 방향을 잡아줍니다.",
    },
    {
      raw: rawFiles.tools,
      output: "04-tools.png",
      accent: "#6f5fb3",
      badge: "현장 실무 도구",
      eyebrow: "AI 임상 검색 · 계산기 · 메모",
      title: "근무 중 필요한 도구까지\n앱 하나로",
      body: "AI 임상 검색, 통합 간호 계산기, 메모 기능까지 모아서 회복 관리와 실무 확인을 한 곳에서 끝낼 수 있습니다.",
    },
  ];

  for (const spec of slideSpecs) {
    const screenshotDataUrl = await readAsDataUrl(spec.raw, "image/png");
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.setContent(
      buildSlideHtml({
        title: spec.title,
        body: spec.body,
        eyebrow: spec.eyebrow,
        screenshotDataUrl,
        logoDataUrl,
        accent: spec.accent,
        badge: spec.badge,
      }),
      { waitUntil: "load" }
    );
    await page.screenshot({ path: path.join(CAROUSEL_DIR, spec.output) });
    await page.close();
  }
}

async function main() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...MOBILE_DEVICE,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  const page = await context.newPage();
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  }).catch(() => {});

  const loginUrl = new URL("/api/dev/login?user=1&redirect=/", BASE_URL).toString();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const marketingState = buildMarketingState();

  const rawFiles = {
    home: await captureRoute(page, "/", "home.png", marketingState),
    insights: await captureRoute(page, "/insights", "insights.png", marketingState, { scrollY: 120 }),
    schedule: await captureRoute(page, "/schedule", "schedule.png", marketingState, { scrollY: 40 }),
    tools: await captureRoute(page, "/tools", "tools.png", marketingState, { scrollY: 0 }),
  };

  await buildCarouselSlides(browser, rawFiles);

  await context.close();
  await browser.close();

  const summaryPath = path.join(OUTPUT_DIR, "README.md");
  await fs.writeFile(
    summaryPath,
    [
      "# RNest Instagram Assets",
      "",
      `- Generated at: ${new Date().toISOString()}`,
      `- Base URL: ${BASE_URL}`,
      "- Raw screenshots: `marketing/instagram/raw`",
      "- Carousel slides: `marketing/instagram/carousel`",
      "",
      "Run again with:",
      "",
      "```bash",
      "npm run dev",
      "node scripts/marketing/build-instagram-assets.mjs",
      "```",
      "",
      "The script uses a development-only debug bridge to inject marketing sample data before each capture.",
      "",
    ].join("\n"),
    "utf8"
  );

  console.log(`Saved assets to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error("[marketing] failed_to_build_instagram_assets");
  console.error(error);
  process.exitCode = 1;
});
