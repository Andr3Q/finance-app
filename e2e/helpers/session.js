// @ts-nocheck
/**
 * Injeta usuário autenticado no sessionStorage antes da página carregar.
 * Evita o fluxo de login em testes de funcionalidades autenticadas.
 */

const TEST_USER = {
  id:                 'e2e-user-001',
  name:               'Ana E2E',
  email:              'ana.e2e@test.com',
  plan:               'pro',
  salary:             5000,
  emailVerified:      true,
  onboardingComplete: true,
  isOnTrial:          false,
  trialEndsAt:        null,
  planExpiresAt:      null,
  twoFactorEnabled:   false,
  referralCode:       'ANA12345',
  reportEmail:        'ana.e2e@test.com',
}

const FREE_USER = {
  ...TEST_USER,
  id:        'e2e-user-002',
  plan:      'free',
  isOnTrial: false,
}

const TRIAL_USER = {
  ...TEST_USER,
  id:          'e2e-user-003',
  plan:        'pro',
  isOnTrial:   true,
  trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
}

/**
 * Injeta o usuário no sessionStorage antes de qualquer script da página.
 * Chamar antes de page.goto().
 */
async function injectSession(page, user = TEST_USER) {
  await page.addInitScript((u) => {
    sessionStorage.setItem('user', JSON.stringify(u))
    // Dispensa o banner de cookies para não bloquear elementos da UI nos testes
    localStorage.setItem('analytics-consent', 'accepted')
  }, user)
}

module.exports = { TEST_USER, FREE_USER, TRIAL_USER, injectSession }
