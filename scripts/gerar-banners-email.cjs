#!/usr/bin/env node
'use strict'

// Gera as imagens do cabeçalho dos e-mails (uma por título de backend/src/services/emailBanners.js).
//
// Por que imagem: o Gmail do celular recolore o e-mail no modo escuro e não dá para desligar; texto branco no azul virava preto.
// Imagem ele não recolore. Ver o comentário de emailBanners.js.
//
// Como rodar (no mesmo container do E2E, para a fonte e o desenho saírem iguais em qualquer máquina), da raiz do projeto:
//   docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/repo -w /repo \
//     mcr.microsoft.com/playwright:v1.60.0-noble node scripts/gerar-banners-email.cjs
// Escreve em frontend/public/email/ (ou em BANNERS_OUT) e apaga os banner-*.jpg que não estão mais na lista.
// Rode de novo sempre que mudar um título, a logo ou o desenho abaixo, e commite as imagens.

const fs = require('fs')
const path = require('path')
const { chromium } = require('@playwright/test')

const ROOT = path.resolve(__dirname, '..')
const { BANNER_TITLES, bannerFile } = require(path.join(ROOT, 'backend/src/services/emailBanners.js'))
const OUT = process.env.BANNERS_OUT || path.join(ROOT, 'frontend/public/email')

const LARGURA = 400   // largura do desenho, em px. No e-mail a imagem vai de ~360 (celular) a 520 (computador)
const ESCALA = 3      // 400 x 3 = 1200 px de imagem: nítida mesmo a 520 px em tela retina (escala inteira: sem linha quebrada na borda)
const QUALIDADE = 90  // JPEG: um degradê com texto fica ~30 KB (o PNG passava de 120 KB)

const base64 = (arquivo) => fs.readFileSync(arquivo).toString('base64')
const FONTE_LATIN = `data:font/woff2;base64,${base64(path.join(ROOT, 'frontend/src/assets/fonts/sora-latin.woff2'))}`
const FONTE_EXT = `data:font/woff2;base64,${base64(path.join(ROOT, 'frontend/src/assets/fonts/sora-latin-ext.woff2'))}`
const LOGO = `data:image/png;base64,${base64(path.join(ROOT, 'frontend/public/logo-icon.png'))}`

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Mesmo desenho do cabeçalho em texto de emailLayout.js: degradê azul, logo 40px, "nancy", título 26px.
const pagina = (titulo) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Sora'; font-weight: 100 800; src: url(${FONTE_EXT}) format('woff2'); unicode-range: U+0100-02BA, U+1E00-1EFF, U+2020, U+20A0-20C4, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Sora'; font-weight: 100 800; src: url(${FONTE_LATIN}) format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #1C48FF; }
.banner { width: ${LARGURA}px; padding: 26px 26px 28px; font-family: 'Sora', sans-serif; color: #fff;
  background: linear-gradient(135deg, #3A62FF 0%, #1C48FF 55%, #1636D4 100%); }
.marca { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
.marca img { width: 40px; height: 40px; border-radius: 12px; display: block; }
.marca span { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; line-height: 1; }
h1 { margin: 0; font-size: 26px; font-weight: 800; line-height: 1.2; letter-spacing: -0.4px; text-wrap: balance; }
</style></head><body>
<div class="banner"><div class="marca"><img src="${LOGO}" alt=""><span>nancy</span></div><h1>${esc(titulo)}</h1></div>
</body></html>`

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const esperados = new Set(BANNER_TITLES.map(bannerFile))
  for (const f of fs.readdirSync(OUT)) {
    if (/^banner-.*\.jpg$/.test(f) && !esperados.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log('removido (fora da lista):', f) }
  }

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: LARGURA + 40, height: 400 }, deviceScaleFactor: ESCALA })
  const page = await ctx.newPage()
  for (const titulo of BANNER_TITLES) {
    await page.setContent(pagina(titulo), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const arquivo = path.join(OUT, bannerFile(titulo))
    // Altura em px inteiros: com altura quebrada a última linha da imagem sai com o fundo da página (uma faixa mais clara).
    const banner = page.locator('.banner')
    await banner.evaluate((el) => { el.style.height = `${Math.ceil(el.getBoundingClientRect().height)}px` })
    await banner.screenshot({ path: arquivo, type: 'jpeg', quality: QUALIDADE })
    console.log(`${bannerFile(titulo)}  ${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB`)
  }
  await browser.close()
  console.log(`\n${BANNER_TITLES.length} imagens em ${OUT}`)
})().catch((e) => { console.error('FALHA', e.message); process.exit(1) })
