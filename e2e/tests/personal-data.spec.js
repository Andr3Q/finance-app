// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Dados pessoais (Nancy 2, tela 25) — /settings/perfil, celular.
// A foto passa de verdade pelo navegador: o arquivo escolhido é reduzido a um JPEG 256x256 antes do envio.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, name: 'André Pereira', email: 'andre@nancy.app', plan: 'elite', emailVerified: true }

async function setup(page, user = USER, goto = '/settings/perfil', seedJpeg = null) {
  const calls = []
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/auth/profile', r => { calls.push(['PUT profile', r.request().postDataJSON()]); r.fulfill(json({ user })) })
  // o servidor guarda a última foto enviada e a devolve como imagem em GET /auth/avatar (como o de verdade)
  let stored = seedJpeg || null
  await page.route('**/api/auth/avatar**', r => {
    const req = r.request()
    if (req.method() === 'PUT') {
      const { image } = req.postDataJSON(); calls.push(['PUT avatar', image]); stored = Buffer.from(image.split(',')[1], 'base64')
      return r.fulfill(json({ avatarUpdatedAt: '2026-10-22T15:00:00.000Z' }))
    }
    if (req.method() === 'DELETE') { calls.push(['DELETE avatar']); stored = null; return r.fulfill(json({ avatarUpdatedAt: null })) }
    return stored ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: stored }) : r.fulfill(json({ error: 'Sem foto de perfil.' }, 404))
  })
  await page.route('**/api/auth/resend-verification', r => { calls.push(['POST resend']); r.fulfill(json({ ok: true })) })
  await page.route('**/api/auth/change-email', r => { calls.push(['POST change-email', r.request().postDataJSON()]); r.fulfill(json({ ok: true })) })
  await page.goto(goto)
  return calls
}

// JPEG pequeno e válido, gerado no navegador
const smallJpeg = (page) => page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64
  const x = c.getContext('2d'); x.fillStyle = '#3DE29F'; x.fillRect(0, 0, 64, 64)
  return c.toDataURL('image/jpeg', 0.8).split(',')[1]
}).then(b64 => Buffer.from(b64, 'base64'))

// PNG 800x400 desenhado no próprio navegador (sem arquivo de apoio no repositório)
const bigPng = (page) => page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 400
  const x = c.getContext('2d'); x.fillStyle = '#1C48FF'; x.fillRect(0, 0, 800, 400); x.fillStyle = '#3DE29F'; x.fillRect(300, 100, 200, 200)
  return c.toDataURL('image/png').split(',')[1]
}).then(b64 => Buffer.from(b64, 'base64'))

test.describe('Dados pessoais', () => {
  test('layout do design: avatar azul, "Alterar foto", cartão com Nome/E-mail e selo, botão azul; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Perfil', exact: true })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Nome, e-mail e verificação')
    await expect(page.locator('.dp-av')).toHaveText('AP')
    await expect(page.getByLabel('Nome')).toHaveValue('André Pereira')
    await expect(page.getByLabel('E-mail')).toHaveValue('andre@nancy.app')
    await expect(page.locator('.dp-pill')).toHaveText('✓ E-mail verificado')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.dp-av').getBoundingClientRect().top * 10) / 10)).toBe(117)
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const cs = (s) => getComputedStyle(document.querySelector(s))
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: rd(r.top), left: rd(r.left), w: rd(r.width), h: rd(r.height), bottom: rd(r.bottom) } }
      return {
        theme: document.documentElement.getAttribute('data-theme'), body: cs('.fin-body').backgroundColor, av: cs('.dp-av').backgroundColor, card: cs('.dp-card').backgroundColor,
        inp: cs('.dp-inp').backgroundColor, pill: cs('.dp-pill').backgroundColor, pillColor: cs('.dp-pill').color, save: cs('.dp-save').backgroundColor,
        avBox: box('.dp-av'), cardBox: box('.dp-card'), inpBox: box('.dp-inp'), saveBox: box('.dp-save'),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(m.theme).toBe('light')
    expect(m.body).toBe('rgb(242, 246, 255)')
    expect(m.av).toBe('rgb(28, 72, 255)')
    expect(m.card).toBe('rgb(255, 255, 255)')
    expect(m.inp).toBe('rgb(244, 247, 252)')
    expect(m.pillColor).toBe('rgb(17, 121, 83)')
    expect(m.save).toBe('rgb(28, 72, 255)')
    expect([m.avBox.w, m.avBox.h]).toEqual([88, 88])
    expect([m.cardBox.left, m.cardBox.w]).toEqual([18, 357])
    expect(m.inpBox.h).toBe(52)
    expect(m.saveBox.h).toBe(54)
    expect(m.saveBox.top - m.cardBox.bottom).toBe(16)
    expect(m.overflowX).toBe(0)
  })

  test('salvar o nome: manda só o nome, mostra o aviso e o novo nome vale no Perfil', async ({ page }) => {
    const calls = await setup(page)
    await page.getByLabel('Nome').fill('André Almeida Pereira')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByText('Perfil atualizado!')).toBeVisible()
    expect(calls).toEqual([['PUT profile', { name: 'André Almeida Pereira' }]])
    await page.getByRole('button', { name: 'Voltar' }).click()   // navega dentro do app (sem recarregar)
    await expect(page.getByRole('heading', { name: 'André Almeida Pereira' })).toBeVisible()
  })

  test('nome curto não é enviado', async ({ page }) => {
    const calls = await setup(page)
    await page.getByLabel('Nome').fill('A')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByRole('alert')).toHaveText('Nome deve ter entre 2 e 100 caracteres.')
    expect(calls).toEqual([])
  })

  test('"Alterar foto": o arquivo é reduzido a JPEG 256x256 no navegador, enviado, e a foto aparece aqui e no Perfil', async ({ page }) => {
    const calls = await setup(page)
    await page.getByLabel('Escolher foto de perfil').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: await bigPng(page) })
    await expect(page.getByText('Foto atualizada!')).toBeVisible()
    expect(calls).toHaveLength(1)
    const [kind, image] = calls[0]
    expect(kind).toBe('PUT avatar')
    expect(image.startsWith('data:image/jpeg;base64,')).toBe(true)
    const bytes = Buffer.from(image.split(',')[1], 'base64')
    expect(bytes.length).toBeLessThanOrEqual(48 * 1024)
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xFF, 0xD8, 0xFF])
    expect([bytes[bytes.length - 2], bytes[bytes.length - 1]]).toEqual([0xFF, 0xD9])
    const dims = await page.evaluate(src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = src }), image)
    expect(dims).toEqual([256, 256])
    // a foto aparece pelo endereço versionado e o servidor entrega os mesmos bytes (a imagem não fica no navegador)
    await expect(page.locator('.dp-av img')).toHaveAttribute('src', '/api/auth/avatar?v=2026-10-22T15%3A00%3A00.000Z')
    await expect.poll(() => page.evaluate(() => document.querySelector('.dp-av img').naturalWidth)).toBe(256)
    expect(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem('user'))).filter(k => /avatar/i.test(k)))).toEqual(['avatarUpdatedAt'])
    await expect(page.getByRole('button', { name: 'Remover' })).toBeVisible()

    await page.getByRole('button', { name: 'Voltar' }).click()   // volta ao Perfil sem recarregar
    await expect(page.locator('.pf-av img')).toHaveAttribute('src', '/api/auth/avatar?v=2026-10-22T15%3A00%3A00.000Z')
    await expect.poll(() => page.evaluate(() => document.querySelector('.pf-av img').naturalWidth)).toBe(256)
  })

  test('"Remover" apaga a foto e volta às iniciais', async ({ page }) => {
    const seed = await (async () => { const p = await page.context().newPage(); await p.goto('about:blank'); const b = await smallJpeg(p); await p.close(); return b })()
    const calls = await setup(page, { ...USER, avatarUpdatedAt: '2026-10-20T10:00:00.000Z' }, '/settings/perfil', seed)
    await expect(page.locator('.dp-av img')).toBeVisible()
    await page.getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByText('Foto removida.')).toBeVisible()
    expect(calls).toEqual([['DELETE avatar']])
    await expect(page.locator('.dp-av img')).toHaveCount(0)
    await expect(page.locator('.dp-av')).toHaveText('AP')
  })

  test('arquivo que não é imagem é recusado sem enviar nada', async ({ page }) => {
    const calls = await setup(page)
    await page.getByLabel('Escolher foto de perfil').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') })
    await expect(page.getByRole('alert')).toHaveText('Escolha uma imagem (JPG, PNG ou WebP).')
    expect(calls).toEqual([])
  })

  test('e-mail não verificado: aviso e "Reenviar e-mail"', async ({ page }) => {
    const calls = await setup(page, { ...USER, emailVerified: false })
    await expect(page.locator('.dp-pill')).toHaveText('E-mail não verificado')
    await page.getByRole('button', { name: 'Reenviar e-mail' }).click()
    await expect(page.getByText(/E-mail de verificação enviado/)).toBeVisible()
    expect(calls).toEqual([['POST resend']])
  })

  test('"Trocar e-mail": pede novo e-mail e senha, e o e-mail de login continua o de antes', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: 'Trocar e-mail' }).click()
    await page.getByLabel('Novo e-mail').fill('novo@nancy.app')
    await page.getByLabel('Senha atual (para confirmar)').fill('Senha1234')
    await page.getByRole('button', { name: 'Enviar link de confirmação' }).click()
    await expect(page.getByText(/Enviamos um link de confirmação para novo@nancy.app/)).toBeVisible()
    expect(calls).toEqual([['POST change-email', { newEmail: 'novo@nancy.app', password: 'Senha1234' }]])
    await expect(page.getByLabel('E-mail')).toHaveValue('andre@nancy.app')
    await expect(page.getByText(/Troca pendente para/)).toBeVisible()
  })

  test('do Perfil: "Dados pessoais" abre a tela e voltar retorna', async ({ page }) => {
    await setup(page, USER, '/settings')
    await page.getByRole('button', { name: 'Dados pessoais' }).click()
    await expect(page).toHaveURL(/\/settings\/perfil$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
