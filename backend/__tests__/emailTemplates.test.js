'use strict'

// Os 15 e-mails transacionais no visual do Nancy 2 (services/emailLayout.js + emailService.js).
// O que estes testes travam: assunto, destinatário, link de cada botão, as frases que a pessoa precisa ler,
// o escape de tudo que vem do usuário, a ausência do visual antigo e a versão escura.

const mockSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}))

const svc = require('../src/services/emailService')

const TO = 'maria@exemplo.com'
const NOME = 'Maria Silva'
const APP = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'

// Cada caso: como enviar, o assunto exato, o link do botão (quando tem) e frases que precisam estar no texto visível.
const montarCasos = (NOME) => ({
  verificacao: {
    enviar: () => svc.sendVerificationEmail(TO, NOME, 'https://myfinancepro.com.br/verify-email?token=abc123', '434812'),
    assunto: 'Confirme seu e-mail — Nancy',
    links: ['https://myfinancepro.com.br/verify-email?token=abc123'],
    frases: ['Confirme seu e-mail', 'Confirmar meu e-mail', 'expira em 24 horas', 'Ou digite este código no app:', '434812', 'expira em 15 minutos'],
  },
  boasVindas: {
    enviar: () => svc.sendWelcomeEmail(TO, NOME, '2026-11-22T15:00:00Z'),
    assunto: 'Bem-vindo(a) ao Nancy! Seu trial Pro começa agora',
    links: [APP],
    frases: ['Seja bem-vindo(a)!', 'Plano Pro', '7 dias grátis', 'Assistente financeiro com IA', 'Autenticação em dois fatores (2FA)', '22 de novembro de 2026', 'Acessar minha conta'],
  },
  redefinirSenha: {
    enviar: () => svc.sendResetEmail(TO, NOME, 'https://myfinancepro.com.br/reset-password?token=zzz999'),
    assunto: 'Redefinição de senha — Nancy',
    links: ['https://myfinancepro.com.br/reset-password?token=zzz999'],
    frases: ['Redefinição de senha', 'Redefinir minha senha', 'expira em 1 hora', 'sua senha permanece a mesma'],
  },
  senhaAlterada: {
    enviar: () => svc.sendPasswordChangedAlert(TO, NOME),
    assunto: 'Sua senha foi alterada — Nancy',
    links: ['https://myfinancepro.com.br/login'],
    frases: ['Senha alterada', 'A senha da sua conta foi alterada em', 'Não foi você?', 'Esqueci minha senha', 'Acessar minha conta'],
  },
  novoIp: {
    enviar: () => svc.sendNewIpLoginAlert(TO, NOME, '203.0.113.7'),
    assunto: 'Acesso de novo local detectado — Nancy',
    links: ['https://myfinancepro.com.br/settings'],
    frases: ['Acesso de novo local detectado', 'Detalhes do acesso:', '203.0.113.7', 'nos últimos 30 dias', 'Proteger minha conta'],
  },
  contaBloqueada: {
    enviar: () => svc.sendAccountUnlockEmail(TO, NOME, 'https://myfinancepro.com.br/unlock?token=u1u1'),
    assunto: 'Desbloqueie sua conta Nancy',
    links: ['https://myfinancepro.com.br/unlock?token=u1u1'],
    frases: ['Conta bloqueada temporariamente', '10 tentativas de login incorretas', 'Desbloquear minha conta', 'expira em 1 hora e só pode ser usado uma vez'],
  },
  novoEmailConfirma: {
    enviar: () => svc.sendEmailChangeVerification(TO, NOME, 'https://myfinancepro.com.br/confirm-email?token=c1c1'),
    assunto: 'Confirme seu novo e-mail — Nancy',
    links: ['https://myfinancepro.com.br/confirm-email?token=c1c1'],
    frases: ['Confirme seu novo e-mail', 'Confirmar novo e-mail', 'expira em 24 horas', 'nada será alterado'],
  },
  emailAlterado: {
    enviar: () => svc.sendEmailChangeAlert(TO, NOME, 'novo@exemplo.com'),
    assunto: 'Seu e-mail de login foi alterado — Nancy',
    links: ['mailto:contato@myfinancepro.com.br'],
    frases: ['E-mail de login alterado', 'novo@exemplo.com', 'Não foi você?', 'contato@myfinancepro.com.br'],
  },
  planoAtivadoPro: {
    enviar: () => svc.sendPlanActivationEmail(TO, NOME, 'pro', '2026-12-12T15:00:00Z'),
    assunto: 'Plano Pro ativado com sucesso! — Nancy',
    links: [APP],
    frases: ['Plano Pro ativado', 'Seu pagamento foi confirmado', '12 de dezembro de 2026', 'Acessar minha conta'],
  },
  planoAtivadoElite: {
    enviar: () => svc.sendPlanActivationEmail(TO, NOME, 'elite', '2026-12-12T15:00:00Z'),
    assunto: 'Plano Elite ativado com sucesso! — Nancy',
    links: [APP],
    frases: ['Plano Elite ativado', 'Plano Elite'],
  },
  renovacao: {
    enviar: () => svc.sendRenewalReminderEmail(TO, NOME, 'pro', 3),
    assunto: 'Seu plano Pro expira em 3 dias — Nancy',
    links: [`${APP}/planos`],
    frases: ['Aviso de renovação', 'expira em 3 dias', 'Renovar plano Pro', 'Se já renovou, ignore este e-mail.'],
  },
  renovacaoHoje: {
    enviar: () => svc.sendRenewalReminderEmail(TO, NOME, 'elite', 1),
    assunto: 'Seu plano Elite expira hoje — Nancy',
    links: [`${APP}/planos`],
    frases: ['expira hoje', 'Renovar plano Elite'],
  },
  trialAcabando: {
    enviar: () => svc.sendTrialExpiryEmail(TO, NOME, 2),
    assunto: 'Seu trial Pro expira em 2 dias — Nancy',
    links: [`${APP}/planos`],
    frases: ['Seu trial está acabando', 'expira em 2 dias', 'Assinar Pro — R$ 9,90/mês', 'Cancele quando quiser. Sem fidelidade.'],
  },
  trialEncerrou: {
    enviar: () => svc.sendPlanExpiredEmail(TO, NOME, 'trial'),
    assunto: 'Seu trial Pro encerrou — Nancy',
    links: [`${APP}/planos`],
    frases: ['Seu trial de 7 dias encerrou', 'plano Grátis', 'Seus dados continuam salvos', 'Ver planos — a partir de R$ 9,90/mês'],
  },
  planoExpirou: {
    enviar: () => svc.sendPlanExpiredEmail(TO, NOME, 'paid'),
    assunto: 'Seu plano expirou — Nancy',
    links: [`${APP}/planos`],
    frases: ['Seu plano expirou', 'falta de renovação'],
  },
  indicacao: {
    enviar: () => svc.sendReferralRewardEmail(TO, NOME, 'João Souza'),
    assunto: 'João Souza entrou usando seu código — você ganhou +10 dias!',
    links: [`${APP}/settings`],
    frases: ['Sua indicação funcionou!', 'João Souza', '+10 dias', 'Ver meu código de indicação', 'mais 30 dias grátis'],
  },
  resumoSemanal: {
    enviar: () => svc.sendWeeklyDigest(TO, NOME, { totalExpenses: 1234.5, totalIncome: 5000, topCategory: 'Alimentação', transactionCount: 23, balance: 3765.5 }),
    assunto: 'Seu resumo semanal — Nancy',
    links: [APP],
    frases: ['Resumo semanal', 'últimos 7 dias', 'R$ 5.000,00', '- R$ 1.234,50', 'Categoria que mais gastou', 'Alimentação', 'Saldo do período', 'R$ 3.765,50', 'Ver detalhes no app'],
  },
  relatorioMensal: {
    enviar: () => svc.sendMonthlyReport(TO, NOME, 10, 2026, { salary: 5000, unpaidFixedCosts: 450.9, totalExpenses: 3120.4, currentBalance: 1428.7 }, Buffer.from('%PDF-fake')),
    assunto: 'Relatório de Outubro/2026 — Nancy',
    links: [],
    frases: ['Relatório de Outubro/2026', 'R$ 5.000,00', 'Contas Fixas (pendentes)', '- R$ 450,90', '- R$ 3.120,40', 'Saldo Final', 'R$ 1.428,70', 'O detalhamento completo está no PDF em anexo.'],
  },
})
const CASOS = montarCasos(NOME)

const ARQUIVO_PDF = 'relatorio-outubro-2026.pdf'

const visivel = (html) => html
  .replace(/<head>[\s\S]*?<\/head>/, '')
  .replace(/<div style="display:none[\s\S]*?<\/div>/, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')

async function capturar(fn) {
  mockSend.mockReset()
  mockSend.mockResolvedValue({ data: { id: 'x' }, error: null })
  await fn()
  expect(mockSend).toHaveBeenCalledTimes(1)
  return mockSend.mock.calls[0][0]
}

describe('e-mails no visual do Nancy 2', () => {
  describe.each(Object.entries(CASOS))('%s', (chave, caso) => {
    let payload
    beforeAll(async () => { payload = await capturar(caso.enviar) })

    test('destinatário e assunto', () => {
      expect(payload.to).toBe(TO)
      expect(payload.subject).toBe(caso.assunto)
    })

    test('traz as frases que a pessoa precisa ler', () => {
      const texto = visivel(payload.html)
      for (const f of caso.frases) expect(texto).toContain(f)
    })

    test('cada botão aponta para o link certo', () => {
      for (const l of caso.links) expect(payload.html).toContain(`href="${l}"`)
    })

    test('casca nova: cabeçalho azul, logo, rodapé, prévia e versão escura', () => {
      const h = payload.html
      expect(h.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(h).toContain('<html lang="pt-BR">')
      expect(h).toContain('#1C48FF')                                         // azul do Nancy 2
      expect(h).toContain('https://myfinancepro.com.br/logo-icon.png')       // logo nova (produção)
      expect(h).toContain('https://myfinancepro.com.br/privacidade')
      expect(h).toContain('https://myfinancepro.com.br/termos')
      expect(h).toContain('Nancy — Seu controle financeiro pessoal')
      expect(h).toContain('prefers-color-scheme: dark')
      expect(h).toContain('<meta name="color-scheme" content="light dark">')
      expect(h).toMatch(/<div style="display:none[^>]*>[^<]{10,}<\/div>/)    // texto de prévia da caixa de entrada
    })

    test('nada do visual antigo (verde-água sobre azul-marinho) nem emoji no texto', () => {
      for (const velho of ['#00ffcc', '#00a89a', '#020d10', '#061520', '#4ac46e', 'font-family: Arial', 'font-family:Arial']) {
        expect(payload.html).not.toContain(velho)
      }
      expect(payload.html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F0}]/u)
    })

    test('o que vem do usuário é escapado (nome com HTML não vira tag)', async () => {
      const hostil = '<img src=x onerror=alert(1)>"\'<script>alert(2)</script>'
      const p = await capturar(montarCasos(hostil)[chave].enviar)
      expect(p.html).not.toContain('<img src=x')
      expect(p.html).not.toContain('<script>')
      expect(p.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })
  })

  test('a prévia da caixa de entrada nunca traz o código de verificação', async () => {
    const p = await capturar(CASOS.verificacao.enviar)
    const previa = p.html.match(/<div style="display:none[^>]*>([^<]*)<\/div>/)[1]
    expect(previa).not.toContain('434812')
    expect(previa).not.toMatch(/\d{6}/)
  })

  test('verificação sem código não mostra a caixa do código', async () => {
    const p = await capturar(() => svc.sendVerificationEmail(TO, NOME, 'https://myfinancepro.com.br/verify-email?token=abc123'))
    expect(visivel(p.html)).not.toContain('Ou digite este código no app:')
    expect(p.html).not.toContain('letter-spacing:8px')
  })

  test('código com HTML é escapado', async () => {
    const p = await capturar(() => svc.sendVerificationEmail(TO, NOME, 'https://x/y', '<b>1</b>'))
    expect(p.html).not.toContain('<b>1</b>')
    expect(p.html).toContain('&lt;b&gt;1&lt;/b&gt;')
  })

  test('link com & vai escapado no atributo e continua certo', async () => {
    const p = await capturar(() => svc.sendResetEmail(TO, NOME, 'https://x.com/r?token=a&b=2"><script>'))
    expect(p.html).toContain('href="https://x.com/r?token=a&amp;b=2&quot;&gt;&lt;script&gt;"')
    expect(p.html).not.toContain('<script>')
  })

  test('plano Elite usa o roxo, plano Pro usa o azul', async () => {
    const elite = await capturar(CASOS.planoAtivadoElite.enviar)
    const pro = await capturar(CASOS.planoAtivadoPro.enviar)
    expect(elite.html).toContain('#7C3AED')
    expect(pro.html).not.toContain('#7C3AED')
  })

  describe('números (resumo semanal e relatório mensal)', () => {
    test('semanal sem categoria não mostra a linha; saldo negativo sai com sinal e vermelho', async () => {
      const p = await capturar(() => svc.sendWeeklyDigest(TO, NOME, { totalExpenses: 900, totalIncome: 100, topCategory: null, transactionCount: 4, balance: -800 }))
      const t = visivel(p.html)
      expect(t).not.toContain('Categoria que mais gastou')
      expect(t).toContain('- R$ 800,00')
      expect(t).toContain('R$ 100,00')
      expect(p.html).toMatch(/nx-red[^>]*>- R\$ 800,00</)
    })

    test('semanal com saldo positivo sai verde, sem sinal', async () => {
      const p = await capturar(CASOS.resumoSemanal.enviar)
      expect(p.html).toMatch(/nx-green[^>]*>R\$ 3\.765,50</)
    })

    test('milhar com ponto e centavos com vírgula, em módulo', async () => {
      const p = await capturar(() => svc.sendWeeklyDigest(TO, NOME, { totalExpenses: 1234567.8, totalIncome: 0, topCategory: null, transactionCount: 0, balance: -1234567.8 }))
      expect(visivel(p.html)).toContain('- R$ 1.234.567,80')
    })

    test('mensal sem contas fixas pendentes não mostra a linha; saldo negativo com sinal', async () => {
      const p = await capturar(() => svc.sendMonthlyReport(TO, NOME, 11, 2026, { salary: 5000, unpaidFixedCosts: 0, totalExpenses: 6200, currentBalance: -1200 }, Buffer.from('x')))
      const t = visivel(p.html)
      expect(t).not.toContain('Contas Fixas (pendentes)')
      expect(t).toContain('Relatório de Novembro/2026')
      expect(t).toContain('- R$ 1.200,00')
      expect(t).not.toContain('R$ -1')
    })

    test('mensal leva o PDF em anexo com o nome de sempre', async () => {
      const p = await capturar(CASOS.relatorioMensal.enviar)
      expect(p.attachments).toHaveLength(1)
      expect(p.attachments[0].filename).toBe(ARQUIVO_PDF)
      expect(p.attachments[0].content).toBe(Buffer.from('%PDF-fake').toString('base64'))
    })
  })

  test('mensal e semanal escapam a categoria', async () => {
    const p = await capturar(() => svc.sendWeeklyDigest(TO, NOME, { totalExpenses: 1, totalIncome: 1, topCategory: '<b>x</b>', transactionCount: 1, balance: 0 }))
    expect(p.html).not.toContain('<b>x</b>')
  })
})

