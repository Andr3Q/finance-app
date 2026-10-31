// @ts-nocheck
/**
 * Área de toque efetiva de um controle: o toque nos 4 cantos de um quadrado de 44x44 centrado nele (o mínimo do WCAG/Apple/
 * Material) ainda tem que cair no próprio controle. Mede com elementFromPoint, então vale também para a borda invisível
 * (::after) que amplia controles pequenos sem mudar o visual.
 * Devolve os 4 resultados — todos true = alvo de 44x44.
 */
async function touchTarget44(page, selector, index = 0) {
  // A splash (vídeo de tela cheia, ~4s a cada carga) fica POR CIMA de tudo: com ela na tela, elementFromPoint devolve o vídeo.
  await page.locator('#app-splash').waitFor({ state: 'hidden', timeout: 20000 })
  await page.locator(selector).nth(index).waitFor({ state: 'visible' })
  return page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll(sel)[i]
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    return [[-21.5, -21.5], [21.5, -21.5], [-21.5, 21.5], [21.5, 21.5]].map(([dx, dy]) => {
      const t = document.elementFromPoint(cx + dx, cy + dy)
      return !!t && (t === el || el.contains(t))
    })
  }, [selector, index])
}

module.exports = { touchTarget44 }
