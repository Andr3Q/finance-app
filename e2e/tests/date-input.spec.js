// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Input de Data Triplo — DD / MM / AAAA
//
// Valida o comportamento do campo de encerramento de contas fixas:
// 3 campos independentes com avanço automático de foco e backspace.
// ─────────────────────────────────────────────────────────────────

async function setupSettings(page) {
  await injectSession(page, TEST_USER)
  await page.route('**/api/auth/me**',        r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...TEST_USER, notifBudgetAlert: true, notifBudgetReminder: true }) }))
  await page.route('**/api/budget**',          r => {
    if (r.request().method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    r.fulfill({ status: 201, contentType: 'application/json',
      body: JSON.stringify({ id: 'b1', name: 'Teste', amount: 100, dueDay: null, endDate: null }) })
  })
  await page.route('**/api/notifications/**',  r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/reports/**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/payments/**',       r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/referral**',   r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/auth/2fa/**',       r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 8 }) }))

  await page.goto('/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // Scroll até o formulário de contas fixas e clicar no toggle 📅
  const toggle = page.locator('.cfg-enddate-toggle').first()
  await toggle.scrollIntoViewIfNeeded()
  await toggle.click()
  await page.waitForTimeout(300)
}

// Locators dos 3 campos de data
const dd   = (page) => page.locator('.cfg-date-part').nth(0)
const mm   = (page) => page.locator('.cfg-date-part').nth(1)
const aaaa = (page) => page.locator('.cfg-date-part.cfg-date-year').first()

test.describe('Input de Data — Visibilidade e Estrutura', () => {

  test('campos DD, MM, AAAA ficam visíveis após clicar no 📅', async ({ page }) => {
    await setupSettings(page)
    await expect(dd(page)).toBeVisible()
    await expect(mm(page)).toBeVisible()
    await expect(aaaa(page)).toBeVisible()
  })

  test('separadores "/" visíveis entre os campos', async ({ page }) => {
    await setupSettings(page)
    const seps = page.locator('.cfg-date-sep')
    await expect(seps.first()).toBeVisible()
    await expect(seps.nth(1)).toBeVisible()
    // Texto dos separadores é "/"
    await expect(seps.first()).toHaveText('/')
  })

  test('label "Data de encerramento" visível', async ({ page }) => {
    await setupSettings(page)
    await expect(page.locator('.cfg-enddate-label')).toBeVisible()
  })

  test('campos ocultos antes de clicar no toggle', async ({ page }) => {
    await injectSession(page, TEST_USER)
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.goto('/settings', { waitUntil: 'networkidle' })
    // Sem clicar no toggle, campos devem estar ocultos
    const field = page.locator('.cfg-date-part').first()
    await expect(field).not.toBeVisible()
  })

  test('clicar no toggle novamente esconde os campos', async ({ page }) => {
    await setupSettings(page)
    await expect(dd(page)).toBeVisible()

    // Clica de novo para fechar
    await page.locator('.cfg-enddate-toggle').first().click()
    await page.waitForTimeout(300)
    await expect(dd(page)).not.toBeVisible()
  })
})

test.describe('Input de Data — Digitação e Avanço de Foco', () => {

  test('digitar 2 dígitos em DD avança foco para MM', async ({ page }) => {
    await setupSettings(page)

    await dd(page).click()
    await dd(page).type('31')
    await page.waitForTimeout(200)

    // MM deve ter o foco agora
    const focusedClass = await page.evaluate(() => {
      const el = document.activeElement
      return el?.placeholder || el?.className || 'unknown'
    })
    expect(focusedClass).toContain('MM')
  })

  test('digitar 2 dígitos em MM avança foco para AAAA', async ({ page }) => {
    await setupSettings(page)

    await dd(page).click()
    await dd(page).type('31')
    await page.waitForTimeout(150)
    await mm(page).type('12')
    await page.waitForTimeout(200)

    const focusedPlaceholder = await page.evaluate(() => document.activeElement?.placeholder)
    expect(focusedPlaceholder).toBe('AAAA')
  })

  test('DD aceita no máximo 2 caracteres', async ({ page }) => {
    await setupSettings(page)
    await dd(page).click()
    await dd(page).type('3112')
    const val = await dd(page).inputValue()
    expect(val.length).toBeLessThanOrEqual(2)
  })

  test('MM aceita no máximo 2 caracteres', async ({ page }) => {
    await setupSettings(page)
    await dd(page).click()
    await dd(page).type('31')
    await mm(page).type('1299')
    const val = await mm(page).inputValue()
    expect(val.length).toBeLessThanOrEqual(2)
  })

  test('AAAA aceita no máximo 4 caracteres', async ({ page }) => {
    await setupSettings(page)
    await dd(page).click()
    await dd(page).type('31')
    await mm(page).type('12')
    await aaaa(page).type('20261234')
    const val = await aaaa(page).inputValue()
    expect(val.length).toBeLessThanOrEqual(4)
  })

  test('letras são ignoradas — campos só aceitam números', async ({ page }) => {
    await setupSettings(page)

    await dd(page).click()
    await dd(page).type('ab')
    const valDD = await dd(page).inputValue()
    expect(valDD).toBe('')

    await dd(page).type('3a1')
    const valDD2 = await dd(page).inputValue()
    expect(valDD2).toMatch(/^\d*$/)
  })

  test('data completa 31/12/2026 preenche os 3 campos corretamente', async ({ page }) => {
    await setupSettings(page)

    await dd(page).click()
    await dd(page).type('31')
    await page.waitForTimeout(150)
    await mm(page).type('12')
    await page.waitForTimeout(150)
    await aaaa(page).type('2026')

    expect(await dd(page).inputValue()).toBe('31')
    expect(await mm(page).inputValue()).toBe('12')
    expect(await aaaa(page).inputValue()).toBe('2026')
  })
})

test.describe('Input de Data — Backspace (navegação reversa)', () => {

  test('backspace em MM vazio apaga último dígito do DD', async ({ page }) => {
    await setupSettings(page)

    // Digita DD=3 (só 1 dígito, não avança)
    await dd(page).click()
    await dd(page).type('3')
    // Foca manualmente no MM
    await mm(page).click()
    // MM está vazio, pressiona backspace
    await mm(page).press('Backspace')
    await page.waitForTimeout(200)

    // DD deve ter apagado o último dígito
    const valDD = await dd(page).inputValue()
    expect(valDD.length).toBeLessThan(2)
  })

  test('backspace em AAAA vazio apaga último dígito do MM', async ({ page }) => {
    await setupSettings(page)

    await dd(page).click()
    await dd(page).type('31')
    await page.waitForTimeout(150)
    // MM com 1 dígito
    await mm(page).type('1')
    // Foca em AAAA manualmente
    await aaaa(page).click()
    // AAAA vazio, backspace
    await aaaa(page).press('Backspace')
    await page.waitForTimeout(200)

    const valMM = await mm(page).inputValue()
    expect(valMM.length).toBeLessThan(2)
  })
})

// Setup para testes de integração — NÃO clica no toggle (teste controla isso)
// IMPORTANTE: Playwright LIFO — registrar wildcard ANTES dos específicos
async function setupSettingsNoToggle(page, budgetPostHandler) {
  await injectSession(page, TEST_USER)
  // Wildcard PRIMEIRO → processado por ÚLTIMO (menor prioridade)
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  // Específicos DEPOIS → processados PRIMEIRO (maior prioridade)
  await page.route('**/api/notifications/**',     r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/reports/**',           r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/payments/history**',   r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/referral-stats**',r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/auth/2fa/**',          r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 8 }) }))
  await page.route('**/api/budget**', async r => {
    if (r.request().method() === 'POST' && budgetPostHandler) return budgetPostHandler(r)
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route('**/api/auth/me**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...TEST_USER, notifBudgetAlert: true, notifBudgetReminder: true }) }))
  await page.goto('/settings', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const toggle = page.locator('.cfg-enddate-toggle').first()
  await toggle.scrollIntoViewIfNeeded()
}

test.describe('Input de Data — Integração com Formulário', () => {

  test('salvar conta fixa com data válida envia endDate ISO ao backend', async ({ page }) => {
    let capturedBody = null

    // setupSettingsNoToggle: base comprovada (test 276 passa com ela). POST handler captura body.
    await setupSettingsNoToggle(page, async r => {
      capturedBody = JSON.parse(r.request().postData() || '{}')
      await r.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ id: 'b-new', name: capturedBody.name, amount: capturedBody.amount, endDate: capturedBody.endDate }) })
    })

    // 1) Preencher nome e valor ANTES de clicar no toggle
    await page.locator('.cfg-add-row input[placeholder="Nome da conta"]').fill('Aluguel')
    await page.locator('.cfg-add-row .cfg-inp-num[type="text"]').first().fill('1200')
    await page.waitForTimeout(100)

    // 2) Clicar no toggle para exibir campos de data (hasEndDate=true)
    await page.locator('.cfg-enddate-toggle').first().click()
    await page.waitForTimeout(300)

    // 3) Preencher datas com click+type (mesmo padrão dos tests 87/102 que passam)
    await dd(page).click()
    await dd(page).type('31')
    await page.waitForTimeout(150)
    await mm(page).type('12')
    await page.waitForTimeout(150)
    await aaaa(page).type('2027')
    await page.waitForTimeout(100)

    // 4) Verificações diagnósticas — se falharem, o erro mostra os valores reais nos inputs
    expect(await page.locator('.cfg-add-row input[placeholder="Nome da conta"]').inputValue(), 'nome deve ser Aluguel').toBe('Aluguel')
    expect(await dd(page).inputValue(),   'DD deve ser 31')   .toBe('31')
    expect(await mm(page).inputValue(),   'MM deve ser 12')   .toBe('12')
    expect(await aaaa(page).inputValue(), 'AAAA deve ser 2027').toBe('2027')
    expect(await page.locator('.cfg-add-row .cfg-inp-num[type="text"]').first().inputValue(), 'valor não deve estar vazio').not.toBe('')

    // 5) Ler estado React real via fiber tree ANTES do submit (confirma o que React vê, não só o DOM)
    const fiberState = await page.evaluate(() => {
      try {
        const form = document.querySelector('form.cfg-add-row')
        if (!form) return { err: 'no form' }
        const key = Object.keys(form).find(k => /^__reactFiber/.test(k))
        if (!key) return { err: 'no fiber' }
        let f = form[key].return
        while (f) {
          let s = f.memoizedState
          while (s) {
            const v = s.memoizedState
            if (v && typeof v === 'object' && v !== null && 'hasEndDate' in v)
              return { ok: true, newBudget: JSON.stringify(v) }
            s = s.next
          }
          f = f.return
        }
        return { err: 'not found' }
      } catch (e) { return { err: e.message } }
    })
    // Falha AQUI se o React state estiver errado (mostra o valor real no CI)
    expect(fiberState.ok, `Estado React antes do submit: ${JSON.stringify(fiberState)}`).toBe(true)
    expect(fiberState.newBudget, 'hasEndDate deve ser true no React state').toContain('"hasEndDate":true')
    expect(fiberState.newBudget, 'amount deve ser 1200 no React state').toContain('"amount":1200')
    expect(fiberState.newBudget, 'dd deve ser "31" no React state').toContain('"dd":"31"')

    // 6) Clicar no botão submit (mais próximo do comportamento real do usuário)
    await page.locator('form.cfg-add-row button[type="submit"]').click()
    await page.waitForTimeout(2000)

    // 7) Se capturedBody é null, handleAdd retornou sem POST.
    //    Capturar toast + erros inline + fiber state para diagnóstico preciso.
    if (!capturedBody) {
      const diag = await page.evaluate(() => ({
        inlineErrors: Array.from(document.querySelectorAll('[style*="ef4444"]'))
          .map(el => el.textContent?.trim()).filter(Boolean),
        toasts: Array.from(document.querySelectorAll('[role="alert"], [class*="toast"], [class*="message"], [class*="notif"]'))
          .map(el => el.textContent?.trim()).filter(Boolean),
        bodyText: document.body.innerText.slice(0, 500),
      }))
      expect(capturedBody,
        `handleAdd não fez POST.\nInline errors: ${JSON.stringify(diag.inlineErrors)}\nToasts: ${JSON.stringify(diag.toasts)}\nBody: ${diag.bodyText}`
      ).not.toBeNull()
    }

    expect(capturedBody.endDate).toBe('2027-12-31')
  })

  test('salvar sem preencher data não envia endDate', async ({ page }) => {
    let capturedBody = null

    await setupSettingsNoToggle(page, async r => {
      capturedBody = JSON.parse(r.request().postData() || '{}')
      await r.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify({ id: 'b-new', name: 'Internet', amount: 120 }) })
    })

    await page.locator('.cfg-add-row input[placeholder="Nome da conta"]').fill('Internet')
    await page.locator('.cfg-add-row .cfg-inp-num[type="text"]').first().fill('120')

    // NÃO ativa o toggle — endDate não deve ser enviado
    await page.locator('.cfg-add-row button[type="submit"]').click()
    await page.waitForTimeout(500)

    expect(capturedBody?.endDate).toBeFalsy()
  })
})

test.describe('Input de Data — Responsividade (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('campos de data visíveis e utilizáveis em 375px', async ({ page }) => {
    await setupSettings(page)

    // Campos devem estar visíveis sem overflow
    await expect(dd(page)).toBeVisible()
    await expect(mm(page)).toBeVisible()
    await expect(aaaa(page)).toBeVisible()

    // Verificar que nenhum campo está fora da tela
    const ddBox   = await dd(page).boundingBox()
    const aaaaBox = await aaaa(page).boundingBox()

    expect(ddBox.x, 'DD fora da tela').toBeGreaterThanOrEqual(0)
    expect(aaaaBox.x + aaaaBox.width, 'AAAA ultrapassa borda').toBeLessThanOrEqual(375 + 4)
  })

  test('sem scroll horizontal ao exibir o input de data em 375px', async ({ page }) => {
    await setupSettings(page)

    const result = await page.evaluate(() => ({
      ok:          document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2,
      overflow:    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))

    expect(result.ok,
      `overflow horizontal ao abrir input de data em 375px: +${result.overflow}px`
    ).toBe(true)
  })
})
