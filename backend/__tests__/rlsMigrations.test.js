// Toda tabela criada por migração tem que ligar o Row Level Security. O backend conecta como dono (o RLS não o afeta), mas o Supabase expõe o
// schema "public" pela Data API: uma tabela SEM RLS fica legível/gravável por quem tiver a chave pública do projeto. Foi o que aconteceu com a
// PushSubscription (chaves de notificação push dos usuários) até esta correção; este teste impede que uma tabela futura repita o erro.
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '../prisma/migrations')
const sql = fs.readdirSync(dir)
  .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
  .sort()
  .map((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'))
  .join('\n')
const nome = (raw) => raw.replace(/"/g, '').replace(/^public\./i, '')

describe('RLS nas tabelas do app (migrações)', () => {
  const criadas = [...sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?((?:"public"\.)?"[^"]+")/gi)].map((m) => nome(m[1]))
  const comRls = new Set([...sql.matchAll(/ALTER TABLE\s+(?:ONLY\s+)?((?:"public"\.)?"[^"]+")\s+ENABLE ROW LEVEL SECURITY/gi)].map((m) => nome(m[1])))

  it('o teste enxerga as tabelas (se isto falhar, o regex quebrou, não o RLS)', () => {
    expect(criadas.length).toBeGreaterThanOrEqual(12)
    expect(criadas).toContain('User')
    expect(criadas).toContain('PushSubscription')
  })

  it('toda tabela criada liga o ROW LEVEL SECURITY', () => {
    expect(criadas.filter((t) => !comRls.has(t))).toEqual([])
  })
})
