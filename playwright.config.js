// @ts-check
const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir:        './e2e/tests',
  fullyParallel:  false,         // testes de negócio têm dependências de estado
  forbidOnly:     !!process.env.CI,
  retries:        process.env.CI ? 1 : 0,
  workers:        process.env.CI ? 2 : 1,
  reporter:       [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL:           'http://localhost:5173',
    actionTimeout:     15_000,
    navigationTimeout: 30_000,
    headless:          true,
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    trace:             'retain-on-failure',
    serviceWorkers:    'block',
    locale:            'pt-BR',
    timezoneId:        'America/Sao_Paulo',
    // Dispensa o banner de cookies em todos os testes
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://localhost:5173',
        localStorage: [{ name: 'analytics-consent', value: 'accepted' }],
      }],
    },
  },

  projects: [
    {
      name:  'chromium',
      use:   { ...devices['Desktop Chrome'] },
    },
  ],

  // Inicia o Vite dev server automaticamente
  webServer: {
    command:          'npm run dev:frontend',
    url:              'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout:          60_000,
    stdout:           'ignore',
    stderr:           'pipe',
  },
})
