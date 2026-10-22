// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Preferências (Nancy 2, tela 27) — /settings/notificacoes, celular.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, plan: 'elite', emailVerified: true }

async function setup(page, user = USER, goto = '/settings/notificacoes', { failSave = false } = {}) {
  const saved = []
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/auth/notifications', r => {
    saved.push(r.request().postDataJSON())
    return failSave ? r.fulfill(json({ error: 'x' }, 500)) : r.fulfill(json({ ok: true }))
  })
  await page.goto(goto)
  return saved
}
const sw = (page, name) => page.getByRole('switch', { name })

test.describe('Preferências', () => {
  test('layout do design: 6 linhas com nome, descrição e interruptor verde; só o relatório por e-mail desligado; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Preferências', exact: true })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Alertas e lembretes')
    await expect(page.locator('.pr-card').first().locator('.pr-name')).toHaveText([
      'Lembrete de salário', 'Vencimento de contas', 'Alerta de limite', 'Resumo mensal em stories', 'Dicas da Nancy IA', 'Relatório por e-mail',
    ])
    await expect(page.locator('.pr-card').first().locator('.pr-desc')).toHaveText([
      'No 5º dia útil do mês', '2 dias antes de cada conta fixa', 'Quando passar de 80% do teto', 'Todo dia 1º, com o mês anterior', 'Até 2 por semana', 'Toda segunda-feira',
    ])
    await expect(page.locator('.pr-card').first().getByRole('switch', { checked: true })).toHaveCount(5)
    await expect(sw(page, 'Relatório por e-mail')).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.pr-card').getBoundingClientRect().top * 10) / 10)).toBe(110)
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const cs = (s, i = 0) => getComputedStyle(document.querySelectorAll(s)[i])
      const box = (s, i = 0) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { top: rd(r.top), left: rd(r.left), w: rd(r.width), h: rd(r.height), bottom: rd(r.bottom) } }
      return {
        theme: document.documentElement.getAttribute('data-theme'), body: cs('.fin-body').backgroundColor, card: cs('.pr-card').backgroundColor,
        on: cs('.sb-switch.on').backgroundColor, off: cs('.sb-switch:not(.on)', 0).backgroundColor,
        card0: box('.pr-card', 0), row0: box('.pr-row', 0), row1: box('.pr-row', 1), row5: box('.pr-row', 5), sw0: box('.sb-switch', 0),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(m.theme).toBe('light')
    expect(m.body).toBe('rgb(242, 246, 255)')
    expect(m.card).toBe('rgb(255, 255, 255)')
    expect(m.on).toBe('rgb(25, 200, 132)')
    expect(m.off).toBe('rgb(213, 220, 235)')
    expect([m.card0.left, m.card0.w]).toEqual([18, 357])
    expect(m.row0.h).toBe(68)
    expect(m.row1.top - m.row0.top).toBe(68)
    expect(m.card0.h).toBe(439)          // 6 linhas de 68 + respiros, como no print
    expect([m.sw0.w, m.sw0.h]).toEqual([50, 30])
    expect(m.overflowX).toBe(0)
  })

  test('cada interruptor grava a sua preferência (só ela) e a escolha continua ao navegar', async ({ page }) => {
    const saved = await setup(page)
    for (const name of ['Lembrete de salário', 'Vencimento de contas', 'Alerta de limite', 'Resumo mensal em stories', 'Dicas da Nancy IA']) {
      await sw(page, name).click()
      await expect(sw(page, name)).toHaveAttribute('aria-checked', 'false')
      await expect(sw(page, name)).toBeEnabled()
    }
    await sw(page, 'Relatório por e-mail').click()
    await expect(sw(page, 'Relatório por e-mail')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => saved.length).toBe(6)
    expect(saved).toEqual([{ notifSalary: false }, { notifBudgetReminder: false }, { notifBudgetAlert: false }, { notifStories: false }, { notifTips: false }, { notifWeeklyEmail: true }])
    await page.getByRole('button', { name: 'Voltar' }).click()
    await page.getByRole('button', { name: 'Notificações', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\/notificacoes$/)
    await expect(sw(page, 'Dicas da Nancy IA')).toHaveAttribute('aria-checked', 'false')
    await expect(sw(page, 'Relatório por e-mail')).toHaveAttribute('aria-checked', 'true')
  })

  test('o que a conta já tem guardado aparece nos interruptores', async ({ page }) => {
    await setup(page, { ...USER, notifSalary: false, notifTips: false, notifWeeklyEmail: true })
    await expect(sw(page, 'Lembrete de salário')).toHaveAttribute('aria-checked', 'false')
    await expect(sw(page, 'Dicas da Nancy IA')).toHaveAttribute('aria-checked', 'false')
    await expect(sw(page, 'Relatório por e-mail')).toHaveAttribute('aria-checked', 'true')
    await expect(sw(page, 'Alerta de limite')).toHaveAttribute('aria-checked', 'true')
  })

  test('se o servidor recusar, o interruptor volta e aparece o aviso', async ({ page }) => {
    await setup(page, USER, '/settings/notificacoes', { failSave: true })
    await sw(page, 'Alerta de limite').click()
    await expect(page.getByText('Erro ao salvar preferência.')).toBeVisible()
    await expect(sw(page, 'Alerta de limite')).toHaveAttribute('aria-checked', 'true')
  })

  test('sem suporte a push no navegador: a linha dos avisos neste aparelho explica e não tem interruptor', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.pr-device')).toBeVisible()
    await expect(page.locator('.pr-device .pr-name')).toHaveText('Avisos neste aparelho')
    // no Chrome de teste o push existe: o interruptor aparece desligado, sem permissão concedida
    await expect(sw(page, 'Avisos neste aparelho')).toHaveAttribute('aria-checked', 'false')
  })

  test('desligar "Lembrete de salário" tira o aviso das Notificações (efeito na hora, sem recarregar)', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-07T15:00:00Z'))   // 5º dia útil: dia de salário
    await injectSession(page, USER)
    await page.route('**/api/**', r => r.fulfill(json([])))
    await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
    await page.route('**/api/auth/notifications', r => r.fulfill(json({ ok: true })))
    await page.route('**/api/transactions/dashboard**', r => r.fulfill(json({ summary: { totalExpenses: 0, totalIncome: 0, unpaidBudgetIds: [] }, transactions: [], limits: [], budgets: [] })))
    await page.goto('/notificacoes')
    await expect(page.getByRole('button', { name: /Lembrete de salário/ })).toBeVisible()
    await page.getByRole('button', { name: 'Preferências de notificação' }).click()
    await sw(page, 'Lembrete de salário').click()
    await expect(sw(page, 'Lembrete de salário')).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/notificacoes$/)
    await expect(page.getByText('Tudo em dia')).toBeVisible()
  })
})
