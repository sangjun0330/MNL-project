import { expect, test } from "@playwright/test";

const SAMPLE_TRANSCRIPT = `701호 최OO 폐렴이고 ABx 10시에 들어갔고 6시에 한 번 더예요.
703호 박OO DM, 18시에 BST 280이라 sliding 했고 새벽 2시에 BST 다시 보라고 오더.
708호 정OO 엘리퀴스 쓰는데 흑변 같다고 하고 Hb 9.8, 어지럽다 하면 콜.
내일 오전 퇴원 2명, 신규 입원 1명 가능.`;

const HAS_FAST_LIVE_TIMERS =
  Boolean(process.env.NEXT_PUBLIC_HANDOFF_LIVE_ALIAS_REVEAL_MS) &&
  Boolean(process.env.NEXT_PUBLIC_HANDOFF_LIVE_AUTO_LOCK_MS) &&
  Boolean(process.env.NEXT_PUBLIC_HANDOFF_LIVE_MEMORY_PURGE_MS);

test("recommended 1-5: local-only live view, reveal, lock, memory purge", async ({ page }) => {
  test.skip(
    !HAS_FAST_LIVE_TIMERS,
    "이 테스트는 빠른 라이브 타이머 env(NEXT_PUBLIC_HANDOFF_LIVE_*_MS) 설정이 필요합니다."
  );

  await page.goto("/tools/handoff");
  const root = page.getByTestId("handoff-page-root");
  const blocked = page
    .getByTestId("handoff-auth-pending")
    .or(page.getByTestId("handoff-auth-blocked"))
    .or(page.getByTestId("handoff-admin-checking"))
    .or(page.getByTestId("handoff-admin-blocked"))
    .or(page.getByTestId("handoff-secure-context-blocked"))
    .first();

  await Promise.race([
    root.waitFor({ state: "visible", timeout: 20_000 }),
    blocked.waitFor({ state: "visible", timeout: 20_000 }),
  ]);

  if (await blocked.isVisible().catch(() => false)) {
    await expect(blocked).toBeVisible();
    return;
  }

  await expect(root).toBeVisible();

  await page.getByTestId("handoff-manual-input").fill(SAMPLE_TRANSCRIPT);
  await page.getByTestId("handoff-add-chunk").click();
  await page.getByTestId("handoff-run-pipeline").click();

  await expect(page.getByTestId("handoff-global-top-section")).toBeVisible();
  await expect(page.getByTestId("handoff-live-view")).toBeVisible();
  await expect(page.getByTestId("handoff-segment-stats")).not.toContainText("0 segments");

  const revealButton = page.getByTestId("handoff-live-reveal-0");
  const liveToken = page.getByTestId("handoff-live-token-0");
  await expect(liveToken).toContainText("식별 필드 숨김");

  await revealButton.dispatchEvent("pointerdown");
  await page.waitForTimeout(600);
  await revealButton.dispatchEvent("pointerup");

  await expect(liveToken).not.toContainText("식별 필드 숨김", { timeout: 2_000 });
  await expect(liveToken).toContainText("식별 필드 숨김", { timeout: 4_000 });

  await expect(page.getByTestId("handoff-live-lock-badge")).toContainText("잠금", { timeout: 9_000 });
  await expect(page.getByText("화면이 자동 잠금되었습니다.")).toBeVisible();

  await page.getByRole("button", { name: "잠금 해제" }).first().click();
  await expect(page.getByTestId("handoff-live-lock-badge")).toContainText("자동잠금");

  await page.waitForTimeout(5_200);
  await expect(page.getByTestId("handoff-segment-stats")).toContainText("0 segments");
});
