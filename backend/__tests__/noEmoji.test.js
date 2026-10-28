'use strict'
const fs = require('fs')
const path = require('path')

// O Nancy não usa emoji: nem na interface, nem nas notificações push, e-mails ou mensagens da API. Este teste varre
// backend/src e reprova se um emoji voltar em texto que o usuário lê (comentários de código são ignorados).
const SRC = path.join(__dirname, '..', 'src')
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.js$/.test(name)) out.push(p)
  }
  return out
}

describe('sem emoji nos textos do backend', () => {
  test('push, e-mails e mensagens da API não contêm emoji', () => {
    const found = []
    for (const file of walk(SRC)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (!isComment(line) && EMOJI.test(line)) found.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
    }
    expect(found).toEqual([])
  })

  test('o detector enxerga os emojis que já apareceram', () => {
    for (const e of ['💸', '🎉', '✅', '⚠️', '🏆', '🔒', '📊']) expect(EMOJI.test(`assunto ${e}`)).toBe(true)
    expect(EMOJI.test('Relatório de outubro — Nancy')).toBe(false)
  })
})
