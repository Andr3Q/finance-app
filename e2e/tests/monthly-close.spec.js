// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Balanço mensal (Nancy 2, tela 28) — /settings/fechamento, celular. Relógio fixado em 21/out/2026.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, plan: 'pro' }
const RECAP = { hasData: true, saved: 9500, totalIncome: 16800, totalExpenses: 7300 }
const HISTORY = [{ month: 9, year: 2026 }, { month: 8, year: 2026 }, { month: 7, year: 2026 }]

async function setup(page, user = USER) {
  const calls = []
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await page.addInitScript(() => { window.confirm = () => true })
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/monthly-recap**', r => r.fulfill(json(RECAP)))
  await page.route('**/api/reports/history', r => r.fulfill(json(HISTORY)))
  await page.route('**/api/reports/monthly-close', r => { calls.push(['POST close']); r.fulfill(json({ message: 'Mês fechado com sucesso! Relatório enviado para ana@x.com' })) })
  await page.route('**/api/reports/pdf**', r => { calls.push(['GET pdf', new URL(r.request().url()).search]); r.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4 fake' }) })
  await page.goto('/settings/fechamento')
  return calls
}

test.describe('Balanço mensal', () => {
  test('layout do design: cartão azul com resultado, entradas (verde) e saídas, botão branco e a lista de relatórios; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.fin-hero-sub')).toHaveText('Fechar o mês e gerar relatório')
    await expect(page.locator('.bm-label')).toHaveText('Outubro 2026')
    await expect(page.locator('.bm-value')).toHaveText('+R$ 9.500,00')
    await expect(page.locator('.bm-box-val')).toHaveText(['R$ 16.800,00', 'R$ 7.300,00'])
    await expect(page.locator('.bm-row-name')).toHaveText(['Setembro 2026', 'Agosto 2026', 'Julho 2026'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.bm-card').getBoundingClientRect().top * 10) / 10)).toBe(110)
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const cs = (s, i = 0) => getComputedStyle(document.querySelectorAll(s)[i])
      const box = (s, i = 0) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { top: rd(r.top), left: rd(r.left), w: rd(r.width), h: rd(r.height), bottom: rd(r.bottom) } }
      return {
        theme: document.documentElement.getAttribute('data-theme'), card: cs('.bm-card').backgroundColor, radius: cs('.bm-card').borderTopLeftRadius, closeBg: cs('.bm-close').backgroundColor, closeColor: cs('.bm-close').color,
        inColor: cs('.bm-box-val', 0).color, list: cs('.bm-list-card').backgroundColor,
        card0: box('.bm-card'), box0: box('.bm-box', 0), box1: box('.bm-box', 1), close: box('.bm-close'), listBox: box('.bm-list-card'), row0: box('.bm-row', 0), row1: box('.bm-row', 1),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(m.theme).toBe('light')
    expect(m.card).toBe('rgb(28, 72, 255)')
    expect(m.radius).toBe('28px')
    expect(m.closeBg).toBe('rgb(255, 255, 255)')
    expect(m.closeColor).toBe('rgb(28, 72, 255)')
    expect(m.inColor).toBe('rgb(61, 226, 159)')
    expect(m.list).toBe('rgb(255, 255, 255)')
    expect([m.card0.left, m.card0.w]).toEqual([18, 357])
    expect(m.close.h).toBe(54)
    expect(m.row1.top - m.row0.top).toBe(69)
    expect(m.listBox.top - m.card0.bottom).toBe(16)
    expect(m.box0.h).toBe(m.box1.h)
    expect(m.overflowX).toBe(0)
  })

  test('fechar o mês pede confirmação, avisa e recarrega', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: /Fechar mês e gerar PDF/ }).click()
    await expect(page.getByText('Mês fechado com sucesso! Relatório enviado para ana@x.com')).toBeVisible()
    expect(calls).toEqual([['POST close']])
  })

  test('baixar o relatório de um mês fechado entrega o PDF daquele mês', async ({ page }) => {
    const calls = await setup(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Baixar relatório de Agosto 2026' }).click()
    const d = await download
    expect(d.suggestedFilename()).toBe('nancy-balanco-2026-08.pdf')
    expect(calls).toEqual([['GET pdf', '?month=8&year=2026']])
  })

  test('plano grátis: fechar e baixar abrem o convite ao Pro e nada é enviado', async ({ page }) => {
    const calls = await setup(page, { ...USER, plan: 'free' })
    await page.getByRole('button', { name: /Fechar mês e gerar PDF/ }).click()
    await expect(page.getByText(/exclusivo do plano Pro/).first()).toBeVisible()
    await page.keyboard.press('Escape')
    expect(calls).toEqual([])
  })

  test('do Perfil: "Balanço mensal" abre a tela e voltar retorna', async ({ page }) => {
    await setup(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Balanço mensal', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\/fechamento$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
