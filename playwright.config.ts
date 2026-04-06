import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "src/lib/__tests__/e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,          // SQLite DB 공유 → 직렬 실행으로 테스트 간 간섭 방지
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    // Do NOT run headless when PLAYWRIGHT_HEADED=1
    headless: process.env.PLAYWRIGHT_HEADED !== "1",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
