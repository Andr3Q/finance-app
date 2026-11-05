'use strict'
// Cadeia de entrega: os workflows de deploy têm a chave do Google Cloud e publicam em produção. Ação de terceiros por tag solta (@v4) pode
// ser trocada pelo dono da ação sem aviso, e um merge automático na main publica em produção sem ninguém olhar. Estas travas impedem as duas coisas.
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const workflows = execSync('git ls-files .github/workflows', { cwd: root, encoding: 'utf-8' }).split('\n').filter((f) => /\.ya?ml$/.test(f))
const read = (f) => fs.readFileSync(path.join(root, f), 'utf-8')

describe('workflows do GitHub Actions', () => {
  test('o teste enxerga os workflows (se isto falhar, o git ls-files quebrou, não a segurança)', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(8)
    expect(workflows).toContain('.github/workflows/deploy.yml')
  })

  test('toda ação de terceiros é fixada pelo SHA de 40 caracteres (nada de @v4 nem @main)', () => {
    const soltas = []
    for (const f of workflows) {
      read(f).split('\n').forEach((linha, i) => {
        const m = linha.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/)
        if (!m) return
        const ref = m[1]
        if (ref.startsWith('./') || ref.startsWith('docker://')) return
        if (!/@[0-9a-f]{40}$/.test(ref)) soltas.push(`${f}:${i + 1} ${ref}`)
      })
    }
    expect(soltas).toEqual([])
  })

  test('nenhum workflow aprova nem mescla pull request sozinho: merge na main = produção, só com o ok do dono', () => {
    expect(workflows).not.toContain('.github/workflows/dependabot-automerge.yml')
    const automaticos = workflows.filter((f) => /gh\s+pr\s+(merge|review)|pulls\/\d+\/merge|enable-?auto-?merge|dependabot\/fetch-metadata/i.test(read(f)))
    expect(automaticos).toEqual([])
  })

  test('todo workflow declara permissões mínimas no topo (nada de token com escrita por padrão)', () => {
    const sem = workflows.filter((f) => !/^permissions:/m.test(read(f)))
    expect(sem).toEqual([])
  })
})
