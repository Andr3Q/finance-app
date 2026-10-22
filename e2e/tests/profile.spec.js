// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Perfil (Nancy 2, tela 24) — hub "/settings". Celular e desktop.
// ─────────────────────────────────────────────────────────────────

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }

async function setup(page, user = USER, goto = '/settings') {
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/auth/logout**', r => r.fulfill(json({ ok: true })))
  await page.goto(goto)
}

test.describe('Perfil — celular', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('fundo azul, avatar branco com iniciais, selo mint do plano, cartão de resumos e lista branca; Perfil aceso na barra', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'André Pereira' })).toBeVisible()
    await expect(page.locator('.pf-av')).toHaveText('AP')
    await expect(page.locator('.pf-plan')).toHaveText('Plano Elite')
    await expect(page.locator('.pf-stories-title')).toHaveText('Resumos mensais')
    await expect(page.locator('.pf-stories-sub')).toHaveText('Reveja seus meses em stories')
    await expect(page.locator('.pf-row-label').first()).toHaveText('Dados pessoais')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect(page.locator('.dsb-mn-item.active')).toHaveCount(1)
    // a tela entra com um fade/deslocamento; só mede depois que o avatar parou no lugar
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.pf-av').getBoundingClientRect().top * 10) / 10)).toBe(35)
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const cs = (s) => getComputedStyle(document.querySelector(s))
      const box = (s, i = 0) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { top: rd(r.top), bottom: rd(r.bottom), left: rd(r.left), w: rd(r.width), h: rd(r.height) } }
      return {
        page: cs('.pf-page').backgroundColor, av: cs('.pf-av').backgroundColor, avColor: cs('.pf-av').color, plan: cs('.pf-plan').backgroundColor,
        list: cs('.pf-list').backgroundColor, radius: cs('.pf-list').borderTopLeftRadius, theme: document.documentElement.getAttribute('data-theme'),
        avBox: box('.pf-av'), stories: box('.pf-stories'), listBox: box('.pf-list'), row0: box('.pf-row', 0), row1: box('.pf-row', 1), planBox: box('.pf-plan'),
        gradient: cs('.pf-stories').backgroundImage.startsWith('linear-gradient'),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(m.theme).toBe('light')
    expect(m.page).toBe('rgb(28, 72, 255)')
    expect(m.av).toBe('rgb(255, 255, 255)')
    expect(m.avColor).toBe('rgb(28, 72, 255)')
    expect(m.plan).toBe('rgb(61, 226, 159)')
    expect(m.list).toBe('rgb(255, 255, 255)')
    expect(m.radius).toBe('24px')
    expect(m.gradient).toBe(true)
    expect([m.avBox.w, m.avBox.h]).toEqual([88, 88])
    expect(m.avBox.top).toBe(35)
    expect([m.stories.left, m.stories.w]).toEqual([20, 353])
    expect(m.row0.h).toBe(54)
    expect(m.row1.top - m.row0.top).toBe(54)
    expect(m.listBox.top - m.stories.bottom).toBe(16)
    expect(m.overflowX).toBe(0)
  })

  test('cada linha leva à tela de antes', async ({ page }) => {
    const casos = [
      ['Dados pessoais', /\/settings\/perfil$/], ['Finanças', /\/financas$/], ['Calendário', /\/calendar$/], ['Balanço mensal', /\/settings\/fechamento$/],
      ['Segurança', /\/settings\/seguranca$/], ['Notificações', /\/settings\/notificacoes$/], ['Planos', /\/planos$/], ['Pagamentos', /\/settings\/pagamentos$/],
    ]
    await setup(page)
    for (const [label, url] of casos) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(page).toHaveURL(url)
      await page.goBack()
      await expect(page).toHaveURL(/\/settings$/)
    }
  })

  test('as linhas de baixo (indique, meus dados, instalar, termos, privacidade) continuam acessíveis', async ({ page }) => {
    await setup(page)
    for (const [label, url] of [['Indique e ganhe', /\/settings\/indique$/], ['Meus dados', /\/settings\/dados$/], ['Termos de uso', /\/termos$/], ['Política de privacidade', /\/privacidade$/]]) {
      await page.getByRole('button', { name: label, exact: true }).scrollIntoViewIfNeeded()
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(page).toHaveURL(url)
      await page.goBack()
    }
  })

  test('"Resumos mensais" abre os stories e o selo do plano abre os planos', async ({ page }) => {
    await setup(page)
    await page.locator('.pf-stories').click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
    await page.goBack()
    await page.locator('.pf-plan').click()
    await expect(page).toHaveURL(/\/planos$/)
  })

  test('"Sair da conta" volta ao login', async ({ page }) => {
    await setup(page)
    await page.getByRole('button', { name: 'Sair da conta' }).scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Sair da conta' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('plano grátis: selo discreto "Plano Grátis"', async ({ page }) => {
    await setup(page, { ...USER, plan: 'free' })
    await expect(page.locator('.pf-plan')).toHaveText('Plano Grátis')
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.pf-plan')).backgroundColor)).toBe('rgba(255, 255, 255, 0.18)')
  })

  test('as telas de dentro (ex.: Segurança) acendem o Perfil na barra', async ({ page }) => {
    await setup(page, USER, '/settings/seguranca')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
  })
})

test.describe('Perfil — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('coluna centralizada, sem rolagem horizontal, com a lista completa', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.pf-row')).toHaveCount(14)
    const m = await page.evaluate(() => {
      const r = document.querySelector('.pf-page').getBoundingClientRect()
      return { w: Math.round(r.width), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, radius: getComputedStyle(document.querySelector('.pf-page')).borderTopLeftRadius }
    })
    expect(m.w).toBeLessThanOrEqual(520)
    expect(m.overflowX).toBe(0)
    expect(m.radius).toBe('28px')
  })
})
