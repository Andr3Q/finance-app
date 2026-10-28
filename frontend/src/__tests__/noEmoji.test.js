import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// O design do Nancy não usa emoji: nada na interface (textos, avisos, ícones). Este teste varre o código-fonte do app e
// reprova se um emoji voltar. O "✓" simples (marca de verificação tipográfica, U+2713) não é emoji e faz parte do design.
// o Vitest roda a partir de frontend/ (raiz do projeto): src/ fica ali
const SRC = join(process.cwd(), 'src') + '/'
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u
const isComment = (line) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

describe('sem emoji na interface', () => {
  it('nenhum arquivo de src/ (fora testes e comentários) contém emoji', () => {
    const found = []
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!isComment(line) && EMOJI.test(line)) found.push(`${file.replace(SRC, 'src/')}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
    }
    expect(found).toEqual([])
  })

  it('o detector enxerga os emojis que já apareceram (e ignora o ✓ do design)', () => {
    for (const e of ['📲', '⚡', '✨', '🎉', '🏆', '🙏', '⚠️', '⚠', '✅', '💸']) expect(EMOJI.test(`texto ${e}`)).toBe(true)
    expect(EMOJI.test('✓ Quitado')).toBe(false)
    expect(EMOJI.test('Plano Elite → R$ 34,90')).toBe(false)
  })
})
