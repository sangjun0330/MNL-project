import { test, expect } from "@playwright/test";

const SAMPLE_TRANSCRIPT = `701호 최OO 폐렴이고 ABx 10시에 들어갔고 6시에 한 번 더예요.
703호 박OO DM, 18시에 BST 280이라 sliding 했고 새벽 2시에 BST 다시 보라고 오더.
708호 정OO 엘리퀴스 쓰는데 흑변 같다고 하고 Hb 9.8, 어지럽다 하면 콜.
내일 오전 퇴원 2명, 신규 입원 1명 가능.`;

test("manual handoff flow: input -> analyze -> review lock -> save -> detail", async ({ page }) => {
  await page.goto("/tools/handoff");

  await expect(page.getByTestId("handoff-page-root")).toBeVisible();
  await page.getByTestId("handoff-manual-input").fill(SAMPLE_TRANSCRIPT);
  await page.getByTestId("handoff-add-chunk").click();
  await page.getByTestId("handoff-run-pipeline").click();

  await expect(page.getByTestId("handoff-global-top-section")).toBeVisible();

  const reviewedSaveButton = page.getByTestId("handoff-save-reviewed");
  await expect(reviewedSaveButton).toBeDisabled();
  await expect(reviewedSaveButton).toBeEnabled({ timeout: 20_000 });

  await reviewedSaveButton.click();
  await expect(reviewedSaveButton).toContainText(/완료|저장/);

  const sessionLink = page.getByTestId("handoff-saved-session-link").first();
  await expect(sessionLink).toBeVisible();
  await sessionLink.click();

  await expect(page.getByTestId("handoff-detail-root")).toBeVisible();
  await expect(page.getByTestId("handoff-detail-global-top")).toBeVisible();
});
