// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Aba (ou PWA) aberta ANTES de um deploy: ao tocar numa tela que ainda não tinha sido baixada, o app pede o arquivo da versão
// antiga, que não existe mais (o servidor responde com o index.html). Antes: tela de erro. Agora: recarrega sozinho uma vez
// e cai na tela pedida, já na versão nova. (O E2E roda no servidor de desenvolvimento: o arquivo da tela é /src/pages/Goals.jsx.)
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, plan: 'elite' }

async function setup(page) {
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
}

test('arquivo da tela sumiu depois de um deploy: recarrega uma vez e abre a tela, sem tela de erro', async ({ page }) => {
  await setup(page)
  await page.goto('/dashboard')
  await expect(page.locator('.home-balance-val')).toBeVisible({ timeout: 20000 })

  // a partir daqui o arquivo da tela Metas "não existe mais": responde como o servidor faz (HTML no lugar do script)
  let blocked = 0
  await page.route('**/src/pages/Goals.jsx*', r => {
    blocked++
    return blocked === 1 ? r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }) : r.fallback()
  })
  const reloaded = page.waitForEvent('load', { timeout: 20000 })
  await page.locator('.dsb-mobile-nav').getByRole('button', { name: 'Metas' }).click()
  await reloaded // a página recarregou sozinha

  await expect(page).toHaveURL(/\/goals$/)
  await expect(page.getByRole('heading', { name: 'Metas' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(/algo deu errado|erro inesperado/i)).toHaveCount(0)
  expect(blocked).toBeGreaterThanOrEqual(1)
})

test('se a tela continua falhando depois do recarregamento, mostra o erro em vez de recarregar em laço', async ({ page }) => {
  await setup(page)
  // já recarregou há instantes (a trava nova de 1 min e a antiga do ErrorBoundary, que vale uma vez por aba)
  await page.addInitScript(() => { sessionStorage.setItem('nancy:chunk-reload-at', String(Date.now())); sessionStorage.setItem('errorboundary_chunk_reloaded', '1') })
  await page.goto('/dashboard')
  await expect(page.locator('.home-balance-val')).toBeVisible({ timeout: 20000 })
  let loads = 0
  page.on('load', () => { loads++ })
  await page.route('**/src/pages/Goals.jsx*', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }))
  await page.locator('.dsb-mobile-nav').getByRole('button', { name: 'Metas' }).click()
  await expect(page.getByText('Algo deu errado. Recarregue a página.')).toBeVisible({ timeout: 15000 }) // mostra o erro...
  await page.waitForTimeout(2000)
  expect(loads).toBe(0) // ...e não recarrega em laço
  await expect(page.getByRole('heading', { name: 'Metas' })).toHaveCount(0)
})
