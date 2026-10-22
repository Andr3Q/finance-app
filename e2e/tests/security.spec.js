// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Segurança (Nancy 2, tela 26) — /settings/seguranca, celular.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, name: 'André Pereira', plan: 'elite', twoFactorEnabled: false }

async function setup(page, user = USER, goto = '/settings/seguranca') {
  const calls = []
  const state = { user: { ...user } }
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(state.user)))
  await page.route('**/api/auth/password', r => { calls.push(['PUT password', r.request().postDataJSON()]); r.fulfill(json({ message: 'ok' })) })
  await page.route('**/api/auth/2fa/setup', r => { calls.push(['POST setup']); r.fulfill(json({ qrCode: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', manualKey: 'ABCD EFGH IJKL' })) })
  await page.route('**/api/auth/2fa/verify-setup', r => { calls.push(['POST verify-setup', r.request().postDataJSON()]); r.fulfill(json({ backupCodes: ['aaaa-1111', 'bbbb-2222'] })) })
  await page.route('**/api/auth/2fa/disable', r => { calls.push(['POST disable', r.request().postDataJSON()]); r.fulfill(json({ ok: true })) })
  await page.route('**/api/auth/2fa/backup-codes-count', r => r.fulfill(json({ count: 8 })))
  await page.goto(goto)
  return calls
}

test.describe('Segurança', () => {
  test('layout do design: cartão de senha com formulário aberto e barra, cartão do 2FA com interruptor; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Segurança', exact: true })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Senha e duas etapas')
    await expect(page.getByRole('heading', { name: 'Alterar senha' })).toBeVisible()
    await expect(page.getByText('Use 8+ caracteres com número e símbolo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Atualizar senha' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Autenticação em duas etapas' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.sc-inp').getBoundingClientRect().top * 10) / 10)).toBe(181)
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const cs = (s, i = 0) => getComputedStyle(document.querySelectorAll(s)[i])
      const box = (s, i = 0) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { top: rd(r.top), left: rd(r.left), w: rd(r.width), h: rd(r.height), bottom: rd(r.bottom) } }
      return {
        theme: document.documentElement.getAttribute('data-theme'), body: cs('.fin-body').backgroundColor, card: cs('.sc-card').backgroundColor,
        inp: cs('.sc-inp').backgroundColor, btn: cs('.sc-btn').backgroundColor, meter: cs('.sc-meter').backgroundColor, off: cs('.sb-switch').backgroundColor,
        card1: box('.sc-card', 0), card2: box('.sc-2fa'), i1: box('.sc-inp', 0), i2: box('.sc-inp', 1), meterBox: box('.sc-meter'), i3: box('.sc-inp', 2), btnBox: box('.sc-btn'), sw: box('.sb-switch'), title2: box('.sc-2fa .sc-title'),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(m.theme).toBe('light')
    expect(m.body).toBe('rgb(242, 246, 255)')
    expect(m.card).toBe('rgb(255, 255, 255)')
    expect(m.inp).toBe('rgb(244, 247, 252)')
    expect(m.btn).toBe('rgb(28, 72, 255)')
    expect(m.meter).toBe('rgb(234, 238, 255)')
    expect(m.off).toBe('rgb(213, 220, 235)')
    expect([m.card1.left, m.card1.w]).toEqual([18, 357])
    expect([m.i1.h, m.i2.h, m.i3.h, m.btnBox.h]).toEqual([53, 53, 53, 54])
    expect(m.i2.top - m.i1.bottom).toBe(12)
    expect(m.meterBox.top - m.i2.bottom).toBe(14)
    expect(m.i3.top - m.meterBox.bottom).toBe(14)
    expect(m.btnBox.top - m.i3.bottom).toBe(13)
    expect([m.sw.w, m.sw.h]).toEqual([50, 30])
    expect(m.title2.h).toBe(42)               // "Autenticação em duas / etapas" quebra em 2 linhas, como no print
    expect(m.card2.top - m.card1.bottom).toBe(16)
    expect(m.overflowX).toBe(0)
  })

  test('trocar a senha: valida, envia a senha atual e a nova, e avisa', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: 'Atualizar senha' }).click()
    await expect(page.getByText('Informe a senha atual.')).toBeVisible()
    await page.getByPlaceholder('Senha atual', { exact: true }).fill('Atual@123')
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('Nova@Senha99')
    await expect(page.getByText('Forte')).toBeVisible()
    await page.getByPlaceholder('Confirmar nova senha').fill('Nova@Senha99')
    await page.getByRole('button', { name: 'Atualizar senha' }).click()
    await expect(page.getByText('Senha alterada com sucesso!')).toBeVisible()
    expect(calls).toEqual([['PUT password', { currentPassword: 'Atual@123', newPassword: 'Nova@Senha99' }]])
    await expect(page.getByPlaceholder('Senha atual', { exact: true })).toHaveValue('')
  })

  test('a barra de força enche e muda de cor conforme a nova senha', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.sc-meter-fill')).toBeAttached()   // só mede depois que a tela carregou
    const fill = () => page.evaluate(() => { const f = document.querySelector('.sc-meter-fill'); return { w: Math.round(f.getBoundingClientRect().width / f.parentElement.getBoundingClientRect().width * 100), bg: getComputedStyle(f).backgroundColor } })
    expect((await fill()).w).toBe(0)
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('abc')
    await expect.poll(async () => (await fill()).w).toBe(25)
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('Password1')
    await expect.poll(async () => await fill()).toEqual({ w: 100, bg: 'rgb(74, 226, 172)' })
  })

  test('2FA, plano Pro: o interruptor abre o QR code; com o código certo liga e mostra os códigos de recuperação', async ({ page }) => {
    const calls = await setup(page, { ...USER, plan: 'pro' })
    await page.getByRole('switch', { name: 'Autenticação em duas etapas' }).click()
    await expect(page.getByText('Ativar 2FA')).toBeVisible()
    // o modal é opaco (antes usava uma variável inexistente e deixava a página aparecer por trás do texto)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.tfa-modal')).backgroundColor)).toBe('rgb(255, 255, 255)')
    await page.getByPlaceholder('000000').fill('123456')
    await page.getByRole('button', { name: 'Confirmar e ativar' }).click()
    await expect(page.locator('.tfa-modal-head', { hasText: 'Códigos de recuperação' })).toBeVisible()
    await expect(page.getByText('aaaa-1111')).toBeVisible()
    expect(calls).toEqual([['POST setup'], ['POST verify-setup', { token: '123456' }]])
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(page.getByRole('switch', { name: 'Autenticação em duas etapas' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.sb-switch.on')).toBeVisible()
    // o interruptor anima a cor (0,15s): espera estabilizar antes de comparar
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.sb-switch.on')).backgroundColor)).toBe('rgb(25, 200, 132)')
  })

  test('2FA ativo: mostra os códigos que restam, e o interruptor pede a senha para desativar', async ({ page }) => {
    const calls = await setup(page, { ...USER, plan: 'pro', twoFactorEnabled: true })
    await expect(page.getByRole('switch', { name: 'Autenticação em duas etapas' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('8 códigos de recuperação disponíveis')).toBeVisible()
    await page.getByRole('switch', { name: 'Autenticação em duas etapas' }).click()
    await page.getByPlaceholder('Sua senha').fill('MinhaSenha1')
    await page.locator('.tfa-modal').getByRole('button', { name: 'Desativar 2FA' }).click()
    await expect(page.getByText('2FA desativado.')).toBeVisible()
    expect(calls).toEqual([['POST disable', { password: 'MinhaSenha1' }]])
    await expect(page.getByRole('switch', { name: 'Autenticação em duas etapas' })).toHaveAttribute('aria-checked', 'false')
  })

  test('2FA, plano grátis: o interruptor abre o convite ao Pro e nada é iniciado', async ({ page }) => {
    const calls = await setup(page, { ...USER, plan: 'free' })
    await expect(page.getByText(/Disponível nos planos Pro e Elite/)).toBeVisible()
    await page.getByRole('switch', { name: 'Autenticação em duas etapas' }).click()
    await expect(page.getByText(/exclusiva do plano Pro/)).toBeVisible()
    expect(calls).toEqual([])
    await expect(page.getByRole('switch', { name: 'Autenticação em duas etapas' })).toHaveAttribute('aria-checked', 'false')
  })

  test('do Perfil: "Segurança" abre a tela e voltar retorna', async ({ page }) => {
    await setup(page, USER, '/settings')
    await page.getByRole('button', { name: 'Segurança', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\/seguranca$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
