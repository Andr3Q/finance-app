// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')
const { touchTarget44 } = require('../helpers/touch')

// ─────────────────────────────────────────────────────────────────
// Meus dados (Nancy 2, tela 32) — /settings/dados, celular.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page) {
  const calls = { export: [], del: [] }
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/auth/export-data**', r => {
    const format = new URL(r.request().url()).searchParams.get('format')
    calls.export.push(format)
    const types = { csv: 'text/csv; charset=utf-8', pdf: 'application/pdf', json: 'application/json' }
    r.fulfill({ status: 200, contentType: types[format], body: format === 'json' ? '{}' : 'dados' })
  })
  await page.route('**/api/auth/account', r => {
    calls.del.push(JSON.parse(r.request().postData() || '{}'))
    const ok = calls.del.length > 1
    r.fulfill(json(ok ? { ok: true } : { error: 'Senha incorreta.' }, ok ? 200 : 401))
  })
  await page.goto('/settings/dados')
  return calls
}

test.describe('Meus dados', () => {
  test('layout do design: cartão de exportar com CSV e PDF lado a lado, cartão de excluir em vermelho; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.fin-hero-sub')).toHaveText('Exportar ou excluir')
    await expect(page.locator('.dd-title')).toHaveText(['Exportar meus dados', 'Excluir conta'])
    await expect(page.locator('.dd-sub')).toHaveText(['Todas as suas transações, metas e contas', 'Apaga tudo de forma permanente'])
    await expect(page.locator('.dd-fmt')).toHaveText(['CSV', 'PDF'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    const m = await page.evaluate(() => {
      const r = (s, i = 0) => { const b = document.querySelectorAll(s)[i].getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.height)] }
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { exp: r('.dd-export'), danger: r('.dd-danger'), csv: r('.dd-fmt', 0), pdf: r('.dd-fmt', 1), del: r('.dd-delete'),
        delBg: cs('.dd-delete').backgroundColor, fmtColor: cs('.dd-fmt').color, theme: document.documentElement.getAttribute('data-theme') }
    })
    // 393 − 2 × 18 de margem; alturas medidas no print (exportar 139,6 · excluir 141,4 · botões 52 e 49)
    expect(m.exp[0]).toBe(18); expect(m.exp[1]).toBe(357); expect(m.exp[2]).toBeGreaterThanOrEqual(138); expect(m.exp[2]).toBeLessThanOrEqual(142)
    expect(m.danger[1]).toBe(357); expect(m.danger[2]).toBeGreaterThanOrEqual(139); expect(m.danger[2]).toBeLessThanOrEqual(143)
    expect(m.csv[1]).toBe(m.pdf[1]); expect(m.csv[2]).toBe(52)
    expect(m.del[2]).toBe(49)
    expect(m.delBg).toBe('rgb(214, 51, 72)')
    expect(m.fmtColor).toBe('rgb(28, 72, 255)')
    expect(m.theme).toBe('light')
  })

  test('CSV, PDF e JSON baixam o arquivo do formato pedido', async ({ page }) => {
    const calls = await setup(page)
    const stamp = /^nancy-dados-\d{4}-\d{2}-\d{2}\./
    for (const [button, ext] of [[page.getByRole('button', { name: 'CSV' }), 'csv'], [page.getByRole('button', { name: 'PDF' }), 'pdf'], [page.getByRole('button', { name: /JSON/ }), 'json']]) {
      const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
      expect(download.suggestedFilename()).toMatch(stamp)
      expect(download.suggestedFilename().endsWith(`.${ext}`)).toBe(true)
    }
    expect(calls.export).toEqual(['csv', 'pdf', 'json'])
  })

  // achado N2-10 (aviso do limite de exportações): texto vermelho sobre fundo vermelho (contraste 1,6:1) e caixa encolhida
  // para metade da tela, com a frase quebrada em 3 linhas. Vale para TODOS os avisos do topo (classe .toast-top).
  test('o aviso de erro é legível (contraste ≥ 4,5), usa a largura do texto e não pula de lado ao aparecer', async ({ page }) => {
    await setup(page)
    await page.route('**/api/auth/export-data**', r => r.fulfill(json({ error: 'Limite' }, 429))) // a rota mais nova vence
    await page.getByRole('button', { name: 'CSV' }).click()
    const toast = page.getByRole('alert').filter({ hasText: 'Limite de exportações atingido' })
    await expect(toast).toBeVisible()
    const read = () => toast.evaluate(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
      return { center: r.left + r.width / 2, width: r.width, color: cs.color, bg: cs.backgroundColor }
    })
    const early = await read()                      // durante a animação de entrada
    await page.waitForTimeout(500)                  // depois dela (.3s)
    const late = await read()
    const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }); return .2126 * r + .7152 * g + .0722 * b }
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + .05) / (lo + .05) }
    expect(ratio(late.color, late.bg)).toBeGreaterThanOrEqual(4.5)
    expect(late.width).toBeGreaterThan(300)         // antes: 195px
    expect(late.width).toBeLessThanOrEqual(393 - 32)
    expect(Math.abs(late.center - 393 / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(early.center - late.center)).toBeLessThanOrEqual(1) // antes: entrava deslocado e pulava no fim da animação
  })

  test('excluir conta pede a senha; senha errada mostra o erro e a certa leva ao login', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: 'Excluir minha conta' }).click()
    await expect(page.getByText('Excluir conta permanentemente')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Excluir conta', exact: true })).toBeDisabled()
    await page.getByPlaceholder('Digite sua senha atual').fill('errada')
    await page.getByRole('button', { name: 'Excluir conta', exact: true }).click()
    await expect(page.getByText('Senha incorreta.')).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/dados$/)
    await page.getByPlaceholder('Digite sua senha atual').fill('Certa123')
    await page.getByRole('button', { name: 'Excluir conta', exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    expect(calls.del).toEqual([{ password: 'errada' }, { password: 'Certa123' }])
    // achado N2-10: a pessoa precisa ver que a conta foi mesmo excluída
    await expect(page.getByRole('status')).toHaveText('Conta excluída. Seus dados foram apagados.')
  })

  test('a confirmação de excluir é um diálogo e o link de JSON tem área de toque de 44px', async ({ page }) => {
    await setup(page)
    const json = await page.getByRole('button', { name: /JSON/ }).boundingBox()
    expect(json.height).toBeGreaterThanOrEqual(44)
    await page.getByRole('button', { name: 'Excluir minha conta' }).click()
    const dialog = page.getByRole('dialog', { name: 'Excluir conta permanentemente' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByPlaceholder('Digite sua senha atual')).toHaveAttribute('autocomplete', 'current-password')
  })

  // Achado N2-10: no diálogo de excluir a conta, Tab e Shift+Tab saíam para os botões atrás do véu, e ao fechar (Esc ou Cancelar)
  // o foco caía no <body>. Vale para todos os diálogos modais do app (gerenciador único: hooks/useDialogFocus.js).
  test('o diálogo de excluir prende o foco (Tab e Shift+Tab dão a volta) e devolve o foco a quem abriu ao fechar', async ({ page }) => {
    await setup(page)
    const opener = page.getByRole('button', { name: 'Excluir minha conta' })
    const dialog = page.getByRole('dialog', { name: 'Excluir conta permanentemente' })
    const insideDialog = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

    await opener.click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByPlaceholder('Digite sua senha atual')).toBeFocused() // o campo já tinha o foco: não é roubado
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab');       expect(await insideDialog()).toBe(true) }
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); expect(await insideDialog()).toBe(true) }

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()

    await opener.click()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('o botão Voltar tem área de toque de 44x44 (o visual de 42 não muda)', async ({ page }) => {
    await setup(page)
    expect(await touchTarget44(page, '.fin-back', 0)).toEqual([true, true, true, true])
  })

  test('voltar retorna ao Perfil', async ({ page }) => {
    await setup(page)
    await page.goto('/settings')
    await page.getByText('Meus dados').first().click()
    await expect(page).toHaveURL(/\/settings\/dados$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
