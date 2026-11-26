import { defineConfig, devices } from '@playwright/test'

const base = process.env.ATHAN_TEST_BASE ?? '/'
const port = process.env.ATHAN_TEST_PORT ?? '4173'
const url = `http://127.0.0.1:${port}${base}`

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  use: {
    baseURL: url,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `vite preview --host 127.0.0.1 --port ${port} --strictPort --base ${base}`,
    url,
    reuseExistingServer: !process.env.CI,
  },
})
