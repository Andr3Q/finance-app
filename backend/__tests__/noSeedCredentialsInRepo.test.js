'use strict'
// O repositório do Nancy é PÚBLICO e a homologação responde pela internet. A senha fixa das contas de seed (alice, bob, admin) já
// esteve escrita no código, nos workflows e no resumo dos deploys, e qualquer pessoa entrava como administrador Elite. Ela foi trocada
// por um segredo do GitHub (STAGING_SEED_PASSWORD); este teste impede que a antiga ou outra senha fixa de seed volte a ser versionada.
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const SENHA_ANTIGA = ['Staging', '123!'].join('') // montada aqui para o próprio teste não conter o literal

const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf-8' }).split('\n').filter(Boolean)
  .filter(f => !/\.(png|jpg|jpeg|webp|gif|ico|woff2?|ttf|aab|mp4|webm|pdf|zip|xlsx)$/i.test(f) && !f.endsWith('package-lock.json'))
const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf-8') } catch { return '' } }

describe('credenciais de seed fora do repositório público', () => {
  test('a senha antiga das contas de seed não aparece em nenhum arquivo versionado', () => {
    const achados = tracked.filter(f => read(f).includes(SENHA_ANTIGA))
    expect(achados).toEqual([])
  })

  test('o seed e os workflows pedem a senha do ambiente, não de um literal', () => {
    expect(read('backend/prisma/seed.staging.js')).toMatch(/STAGING_PASS\s*=\s*process\.env\.STAGING_SEED_PASSWORD/)
    expect(read('.github/workflows/deploy-staging.yml')).toMatch(/secrets\.STAGING_SEED_PASSWORD/)
  })

  test('o resumo público do deploy de homologação não imprime senha nenhuma', () => {
    const linhas = read('.github/workflows/deploy-staging.yml').split('\n').filter(l => l.includes('GITHUB_STEP_SUMMARY'))
    // as linhas da tabela de contas listam só e-mail e plano
    const tabela = linhas.filter(l => /@staging\.test/.test(l))
    expect(tabela.length).toBe(3)
    tabela.forEach(l => expect(l.split('|').length).toBe(4)) // "| e-mail | plano |" = 2 colunas, nada de coluna de senha
  })
})
