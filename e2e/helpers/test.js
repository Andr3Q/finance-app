// @ts-nocheck
// O `test` do Playwright com um portão a mais: depois de cada page.goto / page.reload a fonte Sora já foi carregada.
// Sem isso, a largura do texto (e portanto onde ele quebra de linha) dependia de a fonte ter chegado ou não na hora da
// medição — teste que passa num ambiente e falha em outro. A fonte agora é do próprio app (src/assets/fonts), então a
// espera é de milissegundos; o portão só garante que a medição nunca acontece com a fonte de reserva.
const base = require('@playwright/test')

const WEIGHTS = [300, 400, 500, 600, 700, 800]

async function waitForFonts(page) {
  try {
    await page.evaluate(async (weights) => {
      await Promise.all(weights.map(w => document.fonts.load(`${w} 16px Sora`)))
      await document.fonts.ready
    }, WEIGHTS)
  } catch { /* a página trocou durante a espera (redirecionamento): o próximo goto repete */ }
}

const test = base.test.extend({
  page: async ({ page }, use) => {
    // A splash (4,1s) segura o formulário de login: o gerenciador de senhas do celular abria por cima do vídeo (hooks/useSplashGone.js).
    // Os testes já convivem com a splash por cima e não esperam por ela — tratam como terminada; só o teste que cobre isso a liga de volta.
    await page.addInitScript(() => { window.__nancySplashGone = true })
    const goto = page.goto.bind(page)
    const reload = page.reload.bind(page)
    page.goto = async (...args) => { const r = await goto(...args); await waitForFonts(page); return r }
    page.reload = async (...args) => { const r = await reload(...args); await waitForFonts(page); return r }
    await use(page)
  },
})

module.exports = { ...base, test }
