import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Ícones do app (PWA, favicon, tela de instalar). Os arquivos de public/ são o ícone do Nancy 2
// (mesmo desenho do NancyMark) — este teste só garante que o manifesto não mente sobre eles:
// tamanho declarado = tamanho real, e os usados como "maskable" não têm transparência (a máscara
// do Android recorta cantos e um canto transparente apareceria como um quadrado branco/preto).
// o Vitest roda a partir de frontend/ (npm run test:run), então public/ e index.html ficam no cwd
const pub = (name) => resolve(process.cwd(), 'public', name)
const read = (name) => readFileSync(pub(name))

// IHDR do PNG: largura (bytes 16-19), altura (20-23), tipo de cor (25): 2 = RGB, 6 = RGBA
function pngInfo(buf) {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] }
}

const manifest = JSON.parse(read('manifest.json').toString('utf8'))

describe('ícones do app', () => {
  it('cada ícone do manifesto existe e tem exatamente o tamanho declarado', () => {
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons) {
      const file = icon.src.replace(/^\//, '')
      expect(existsSync(pub(file)), `${file} não existe em public/`).toBe(true)
      const { width, height } = pngInfo(read(file))
      expect(`${width}x${height}`, `tamanho real de ${file}`).toBe(icon.sizes)
    }
  })

  it('ícones "maskable" são quadrados de sangria total (sem canal alfa)', () => {
    for (const icon of manifest.icons.filter(i => /maskable/.test(i.purpose))) {
      const file = icon.src.replace(/^\//, '')
      expect(pngInfo(read(file)).colorType, `${file} tem transparência`).toBe(2)
    }
  })

  it('o logo do menu lateral e das páginas legais (logo-icon.png) é 200x200 com cantos transparentes', () => {
    const info = pngInfo(read('logo-icon.png'))
    expect([info.width, info.height]).toEqual([200, 200])
    expect(info.colorType).toBe(6) // RGBA: os cantos arredondados são transparentes
  })

  it('o favicon e o ícone do iOS apontam pra arquivos que existem', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1])
    expect(hrefs.length).toBeGreaterThanOrEqual(2)
    for (const href of hrefs) expect(existsSync(pub(href.replace(/^\//, ''))), `${href} não existe em public/`).toBe(true)
  })
})
