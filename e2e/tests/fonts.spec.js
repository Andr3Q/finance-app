// @ts-nocheck
const { test, expect } = require('../helpers/test')

// ─────────────────────────────────────────────────────────────────
// A fonte Sora é do próprio app (src/assets/fonts), não do Google Fonts. Antes a largura do texto dependia da internet e do
// instante em que a fonte chegava: o mesmo texto cabia numa linha num ambiente e quebrava em outro.
// ─────────────────────────────────────────────────────────────────

test('a Sora vem do próprio app: nenhuma requisição ao Google Fonts e a fonte carrega', async ({ page }) => {
  const external = []
  page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) external.push(r.url()) })
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('/login')
  await expect(page.locator('body')).toBeVisible()

  expect(external).toEqual([])
  const faces = await page.evaluate(() => [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Sora').map(f => f.status))
  expect(faces.length).toBeGreaterThan(0)
  expect(faces).toContain('loaded')
  expect(await page.evaluate(() => document.fonts.check('16px Sora'))).toBe(true)
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Sora/)
})

test('o arquivo da fonte é servido com cache longo (nome com hash em /assets)', async ({ page }) => {
  const fonts = []
  page.on('response', r => { if (/\.woff2(\?|$)/.test(r.url())) fonts.push(r.url()) })
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.goto('/login')
  expect(fonts.length).toBeGreaterThan(0)
  expect(fonts.every(u => u.includes('localhost:5173'))).toBe(true)
})
