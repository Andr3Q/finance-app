import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// A fonte Sora é do próprio app: o layout não pode voltar a depender do Google Fonts (largura do texto = onde quebra a linha).
const ROOT = process.cwd()
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const css  = readFileSync(join(ROOT, 'src/index.css'), 'utf8')

describe('Sora hospedada no app', () => {
  it('o index.html não chama o Google Fonts (nem pré-conecta, nem pré-carrega)', () => {
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    expect(html).not.toMatch(/font-init\.js/)
  })

  it('o index.css declara a Sora com arquivos locais (os dois subconjuntos) e fonte variável 100–800', () => {
    const faces = css.match(/@font-face\s*\{[^}]*font-family:\s*'Sora'[^}]*\}/g) || []
    expect(faces).toHaveLength(2)
    for (const f of faces) {
      expect(f).toMatch(/url\('\.\/assets\/fonts\/sora-[a-z-]+\.woff2'\)/)
      expect(f).toMatch(/font-weight:\s*100 800/)
      expect(f).toMatch(/unicode-range:/)
    }
    expect(css).not.toMatch(/@import\s+url\([^)]*fonts\.googleapis/)
  })

  it('os arquivos da fonte existem e são woff2', () => {
    for (const name of ['sora-latin.woff2', 'sora-latin-ext.woff2']) {
      const p = join(ROOT, 'src/assets/fonts', name)
      expect(existsSync(p)).toBe(true)
      expect(readFileSync(p).subarray(0, 4).toString('latin1')).toBe('wOF2')
    }
  })
})
