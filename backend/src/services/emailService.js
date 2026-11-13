// ═══════════════════════════════════════════════════════
// 📧 src/services/emailService.js — Envio de E-mail
//
// Usa o Resend para envio de e-mails transacionais.
// Requer: RESEND_API_KEY (secret) e EMAIL_FROM (env var).
//
// O visual (cabeçalho azul, cartão, botão, avisos, versão escura) fica em
// emailLayout.js; aqui cada e-mail só monta o texto, o link e os números.
// ═══════════════════════════════════════════════════════

const { Resend } = require('resend')
const {
  esc, emailLayout, emailP, emailSmall, emailGreeting, emailNote, emailButton, emailCode, emailDivider, emailRows, C,
} = require('./emailLayout')

if (!process.env.RESEND_API_KEY) {
  console.warn('[emailService] RESEND_API_KEY não configurada — envio de e-mails desativado.')
}
const resend = new Resend(process.env.RESEND_API_KEY || 'not_configured')

const FROM = process.env.EMAIL_FROM || 'Nancy <noreply@nancy.app>'
const DEFAULT_APP_URL = 'https://finance-app-1042158013294.southamerica-east1.run.app'

// O SDK da Resend NÃO lança exceção quando a API rejeita o envio (domínio não
// verificado, remetente inválido, limite de conta, etc.) — ele resolve
// normalmente com { data: null, error: {...} }. Sem checar esse campo, uma
// rejeição da Resend passa batido e o chamador (ex: /forgot-password) segue
// achando que o e-mail foi enviado quando na verdade nunca saiu. Incidente
// real: EMAIL_FROM apontando para o domínio de sandbox (onboarding@resend.dev)
// rejeitava silenciosamente todo envio para qualquer destinatário que não
// fosse o dono da conta Resend, e o app respondia "e-mail enviado" mesmo assim.
async function send(payload) {
  const { error } = await resend.emails.send(payload)
  if (error) {
    throw new Error(`Resend rejeitou o envio: ${error.message || error.name || JSON.stringify(error)}`)
  }
}

// "R$ 1.234,50" (sempre com sinal próprio quando o chamador quiser: o valor sai em módulo).
const brl = (v) => `R$ ${Math.abs(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Palavras em destaque dentro do texto (acompanham a versão escura).
const accent = (html, color = C.brand) => `<strong class="nx-accent" style="color:${color};font-weight:800;">${html}</strong>`
const alert  = (html) => `<strong class="nx-red" style="color:${C.red};font-weight:800;">${html}</strong>`

async function sendMonthlyReport(toEmail, userName, month, year, summary, pdfBuffer) {
  const monthNames = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ]
  const monthName = monthNames[month - 1]

  const rows = [{ label: 'Salário', value: brl(summary.salary), tone: 'green' }]
  if (summary.unpaidFixedCosts > 0) rows.push({ label: 'Contas Fixas (pendentes)', value: `- ${brl(summary.unpaidFixedCosts)}`, tone: 'red' })
  rows.push({ label: 'Total Gasto', value: `- ${brl(summary.totalExpenses)}`, tone: 'red' })
  rows.push({ label: 'Saldo Final', value: `${summary.currentBalance < 0 ? '- ' : ''}${brl(summary.currentBalance)}`, tone: summary.currentBalance >= 0 ? 'green' : 'red', big: true })

  const html = emailLayout({
    title: 'Relatório mensal',
    preheader: `O resumo financeiro do seu mês de ${monthName}/${year}, com o detalhamento completo em PDF.`,
    body: [
      emailGreeting(userName),
      emailP(`Aqui está o resumo financeiro do seu mês de <strong>${esc(monthName)}/${year}</strong>:`),
      emailRows(rows),
      emailSmall('O detalhamento completo está no PDF em anexo.', { align: 'center', last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Relatório de ${monthName}/${year} — Nancy`,
    html,
    attachments: [
      {
        filename: `relatorio-${monthName.toLowerCase()}-${year}.pdf`,
        content:  pdfBuffer.toString('base64'),
      }
    ]
  })
}

async function sendResetEmail(toEmail, userName, resetLink) {
  const html = emailLayout({
    title: 'Redefinição de senha',
    preheader: 'Recebemos uma solicitação para redefinir a senha da sua conta.',
    body: [
      emailGreeting(userName),
      emailP('Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:'),
      emailButton(resetLink, 'Redefinir minha senha'),
      emailSmall('Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail — sua senha permanece a mesma.', { last: true }),
    ].join('\n'),
  })
  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Redefinição de senha — Nancy',
    html,
  })
}

async function sendRenewalReminderEmail(toEmail, userName, planName, daysLeft) {
  const appUrl    = process.env.APP_URL || DEFAULT_APP_URL
  const planLabel = planName === 'elite' ? 'Elite' : 'Pro'
  const urgency   = daysLeft <= 1 ? 'expira hoje' : `expira em ${daysLeft} dias`

  const html = emailLayout({
    title: 'Aviso de renovação',
    preheader: `Seu plano ${planLabel} ${urgency}. Renove para continuar com todos os recursos.`,
    body: [
      emailGreeting(userName),
      emailP(`Seu plano <strong>${esc(planLabel)}</strong> ${alert(esc(urgency))}. Para continuar aproveitando todos os recursos, renove agora.`),
      emailNote('warn', 'Após o vencimento, sua conta retorna automaticamente para o plano Free e você perderá acesso ao assistente IA, relatórios avançados e outros recursos premium.'),
      emailButton(`${appUrl}/planos`, `Renovar plano ${esc(planLabel)}`),
      emailSmall('Se já renovou, ignore este e-mail.', { align: 'center', last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Seu plano ${planLabel} ${urgency} — Nancy`,
    html,
  })
}

async function sendWelcomeEmail(toEmail, userName, trialEndsAt) {
  const appUrl   = process.env.APP_URL || DEFAULT_APP_URL
  const trialEnd = new Date(trialEndsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const li = (t) => `<li style="margin:0 0 6px;">${t}</li>`
  const html = emailLayout({
    title: 'Seja bem-vindo(a)!',
    preheader: 'Sua conta foi criada com sucesso. Você está no Plano Pro com 7 dias grátis.',
    body: [
      emailGreeting(userName),
      emailP(`Sua conta foi criada com sucesso. Você está no ${accent('Plano Pro')} com <strong>7 dias grátis</strong> — sem precisar de cartão de crédito.`),
      emailNote('success', `<strong style="font-weight:800;">O que está incluído no seu trial Pro:</strong>
<ul style="margin:10px 0 0;padding-left:20px;">${[
        'Assistente financeiro com IA',
        'Relatórios e fechamentos mensais em PDF',
        'Metas de economia e orçamento por categoria',
        'Compras parceladas com controle automático',
        'Autenticação em dois fatores (2FA)',
      ].map(li).join('')}</ul>`),
      emailSmall(`Seu trial expira em <strong>${esc(trialEnd)}</strong>. Após isso, você pode assinar ou continuar no plano grátis.`),
      emailButton(appUrl, 'Acessar minha conta', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Bem-vindo(a) ao Nancy! Seu trial Pro começa agora',
    html,
  })
}

async function sendTrialExpiryEmail(toEmail, userName, daysLeft) {
  const appUrl  = process.env.APP_URL || DEFAULT_APP_URL
  const urgency = daysLeft <= 1 ? 'expira hoje' : `expira em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`

  const html = emailLayout({
    title: 'Seu trial está acabando',
    preheader: `Seu trial do Plano Pro ${urgency}. Assine para continuar com acesso completo.`,
    body: [
      emailGreeting(userName),
      emailP(`Seu trial do <strong>Plano Pro</strong> ${alert(esc(urgency))}. Assine agora para continuar com acesso completo.`),
      emailNote('warn', 'Após o trial, sua conta migra para o plano Free e você perde acesso ao assistente IA, fechamentos em PDF e demais recursos premium.'),
      emailButton(`${appUrl}/planos`, 'Assinar Pro — R$ 9,90/mês'),
      emailSmall('Cancele quando quiser. Sem fidelidade.', { align: 'center', last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Seu trial Pro ${urgency} — Nancy`,
    html,
  })
}

async function sendPlanActivationEmail(toEmail, userName, plan, planExpiresAt) {
  const appUrl    = process.env.APP_URL || DEFAULT_APP_URL
  const planLabel = plan === 'elite' ? 'Elite' : 'Pro'
  const expiresOn = new Date(planExpiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const planColor = plan === 'elite' ? '#7C3AED' : C.brand

  const html = emailLayout({
    title: `Plano ${planLabel} ativado`,
    preheader: `Seu pagamento foi confirmado. O Plano ${planLabel} está ativo.`,
    body: [
      emailGreeting(userName),
      emailP(`Seu pagamento foi confirmado. O ${accent(`Plano ${esc(planLabel)}`, planColor)} está ativo e você tem acesso completo a todos os recursos.`),
      emailNote('success', `Seu plano está ativo até <strong>${esc(expiresOn)}</strong>. Você receberá um aviso antes do vencimento para renovar.`),
      emailButton(appUrl, 'Acessar minha conta', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Plano ${planLabel} ativado com sucesso! — Nancy`,
    html,
  })
}

async function sendReferralRewardEmail(toEmail, referrerName, referredName) {
  const appUrl = process.env.APP_URL || DEFAULT_APP_URL

  const html = emailLayout({
    title: 'Sua indicação funcionou!',
    preheader: 'Alguém criou uma conta com o seu código de indicação e você ganhou +10 dias no seu plano.',
    body: [
      emailGreeting(referrerName),
      emailP(`<strong>${esc(referredName)}</strong> criou uma conta usando o seu código de indicação. Como recompensa, você ganhou ${accent('+10 dias')} no seu plano!`),
      emailNote('success', 'Continue indicando amigos — cada indicação que criar conta te dá mais 30 dias grátis. Não há limite!'),
      emailButton(`${appUrl}/settings`, 'Ver meu código de indicação', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `${esc(referredName)} entrou usando seu código — você ganhou +10 dias!`,
    html,
  })
}

async function sendPlanExpiredEmail(toEmail, userName, wasTrialOrPaid) {
  const appUrl   = process.env.APP_URL || DEFAULT_APP_URL
  const subject  = wasTrialOrPaid === 'trial' ? 'Seu trial Pro encerrou — Nancy' : 'Seu plano expirou — Nancy'
  const headline = wasTrialOrPaid === 'trial' ? 'Seu trial de 7 dias encerrou' : 'Seu plano expirou'
  const detail   = wasTrialOrPaid === 'trial'
    ? 'Seu período de avaliação gratuita do <strong>Plano Pro</strong> chegou ao fim. Sua conta agora está no plano Grátis.'
    : 'Seu plano foi encerrado por falta de renovação. Sua conta agora está no plano Grátis.'

  const html = emailLayout({
    title: headline,
    preheader: 'Sua conta agora está no plano Grátis e seus dados continuam salvos.',
    body: [
      emailGreeting(userName),
      emailP(detail),
      emailNote('danger', 'Seus dados continuam salvos. Para recuperar acesso ao assistente IA, relatórios PDF e demais recursos premium, assine agora:'),
      emailButton(`${appUrl}/planos`, 'Ver planos — a partir de R$ 9,90/mês'),
      emailSmall('Cancele quando quiser. Sem fidelidade.', { align: 'center', last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject,
    html,
  })
}

async function sendVerificationEmail(toEmail, userName, verifyLink, code) {
  const html = emailLayout({
    title: 'Confirme seu e-mail',
    preheader: 'Confirme seu endereço de e-mail para ativar sua conta completamente.',
    body: [
      emailGreeting(userName),
      emailP('Clique no botão abaixo para confirmar seu endereço de e-mail e ativar sua conta completamente.'),
      emailButton(verifyLink, 'Confirmar meu e-mail'),
      emailSmall('Este link expira em <strong>24 horas</strong>. Se não foi você, ignore este e-mail.', { last: !code }),
      code ? [
        emailDivider(),
        emailP('Ou digite este código no app:', { align: 'center', mb: 12 }),
        emailCode(code),
        emailSmall('Esse código expira em <strong>15 minutos</strong>.', { align: 'center', last: true }),
      ].join('\n') : '',
    ].join('\n'),
  })
  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Confirme seu e-mail — Nancy',
    html,
  })
}

// Vai pro e-mail NOVO — precisa confirmar posse antes da troca ser aplicada.
async function sendEmailChangeVerification(toEmail, userName, confirmLink) {
  const html = emailLayout({
    title: 'Confirme seu novo e-mail',
    preheader: 'Confirme que este endereço é seu para concluir a troca do e-mail de login.',
    body: [
      emailGreeting(userName),
      emailP('Você pediu para trocar o e-mail de login da sua conta Nancy para este endereço. Clique no botão abaixo para confirmar — sem essa confirmação, a troca não é aplicada e seu e-mail atual continua sendo usado para entrar.'),
      emailButton(confirmLink, 'Confirmar novo e-mail'),
      emailSmall('Este link expira em <strong>24 horas</strong>. Se você não pediu essa troca, ignore este e-mail — nada será alterado.', { last: true }),
    ].join('\n'),
  })
  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Confirme seu novo e-mail — Nancy',
    html,
  })
}

// Vai pro e-mail ANTIGO — avisa que a troca aconteceu, caso não tenha sido o usuário.
async function sendEmailChangeAlert(toEmail, userName, newEmail) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  const html = emailLayout({
    title: 'E-mail de login alterado',
    preheader: 'O e-mail de login da sua conta foi alterado. Se não foi você, fale com a gente agora.',
    body: [
      emailGreeting(userName),
      emailP(`O e-mail de login da sua conta foi alterado para <strong>${esc(newEmail)}</strong> em <strong>${esc(now)}</strong> (horário de Brasília). A partir de agora, use o novo e-mail para entrar.`),
      emailNote('danger', `<strong style="font-weight:800;">Não foi você?</strong> Como o e-mail de login mudou, "Esqueci minha senha" com este endereço antigo não vai mais funcionar. Responda este e-mail ou escreva pra
<a href="mailto:contato@myfinancepro.com.br" class="nx-red" style="color:${C.red};font-weight:700;">contato@myfinancepro.com.br</a>
imediatamente pra recuperarmos sua conta.`, { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Seu e-mail de login foi alterado — Nancy',
    html,
  })
}

async function sendWeeklyDigest(toEmail, userName, weekData) {
  const appUrl = process.env.APP_URL || DEFAULT_APP_URL
  const { totalExpenses, totalIncome, topCategory, transactionCount, balance } = weekData

  const rows = [
    { label: 'Entradas', value: brl(totalIncome), tone: 'green' },
    { label: 'Gastos', value: `- ${brl(totalExpenses)}`, tone: 'red' },
    { label: 'Transações registradas', value: String(transactionCount) },
  ]
  if (topCategory) rows.push({ label: 'Categoria que mais gastou', value: topCategory })
  rows.push({ label: 'Saldo do período', value: `${balance >= 0 ? '' : '- '}${brl(balance)}`, tone: balance >= 0 ? 'green' : 'red', big: true })

  const html = emailLayout({
    title: 'Resumo semanal',
    preheader: 'O resumo dos seus últimos 7 dias: entradas, gastos e saldo do período.',
    body: [
      emailGreeting(userName),
      emailP('Aqui está o resumo dos seus últimos 7 dias:'),
      emailRows(rows),
      emailButton(appUrl, 'Ver detalhes no app', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Seu resumo semanal — Nancy',
    html,
  })
}

async function sendPasswordChangedAlert(toEmail, userName) {
  const appUrl = process.env.APP_URL || 'https://myfinancepro.com.br'
  const now    = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  const html = emailLayout({
    title: 'Senha alterada',
    preheader: 'A senha da sua conta foi alterada. Se não foi você, recupere o acesso agora.',
    body: [
      emailGreeting(userName),
      emailP(`A senha da sua conta foi alterada em <strong>${esc(now)}</strong> (horário de Brasília).`),
      emailNote('danger', '<strong style="font-weight:800;">Não foi você?</strong> Acesse o app imediatamente e use "Esqueci minha senha" para recuperar o acesso. Se precisar de ajuda, entre em contato com o suporte.'),
      emailButton(`${appUrl}/login`, 'Acessar minha conta', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Sua senha foi alterada — Nancy',
    html,
  })
}

async function sendNewIpLoginAlert(toEmail, userName, ip) {
  const appUrl = process.env.APP_URL || 'https://myfinancepro.com.br'
  const now    = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  const html = emailLayout({
    title: 'Acesso de novo local detectado',
    preheader: 'Detectamos um login na sua conta a partir de um endereço IP novo.',
    body: [
      emailGreeting(userName),
      emailP(`Detectamos um login na sua conta em <strong>${esc(now)}</strong> a partir de um endereço IP que não usou sua conta nos últimos 30 dias.`),
      emailNote('warn', `<strong style="font-weight:800;">Detalhes do acesso:</strong><br>
IP: <strong>${esc(ip)}</strong><br>
Horário: <strong>${esc(now)}</strong> (Brasília)`),
      emailNote('danger', '<strong style="font-weight:800;">Não foi você?</strong> Altere sua senha imediatamente e ative a autenticação em dois fatores (2FA) nas configurações da sua conta.'),
      emailButton(`${appUrl}/settings`, 'Proteger minha conta', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Acesso de novo local detectado — Nancy',
    html,
  })
}

async function sendAccountUnlockEmail(toEmail, userName, unlockLink) {
  const html = emailLayout({
    title: 'Conta bloqueada temporariamente',
    preheader: 'Sua conta foi bloqueada após 10 tentativas de login incorretas. Desbloqueie pelo link.',
    body: [
      emailGreeting(userName),
      emailP('Sua conta foi temporariamente bloqueada após <strong>10 tentativas de login incorretas</strong>. Clique no botão abaixo para desbloquear o acesso:'),
      emailButton(unlockLink, 'Desbloquear minha conta'),
      emailSmall('Este link expira em <strong>1 hora</strong> e só pode ser usado uma vez.'),
      emailNote('danger', '<strong style="font-weight:800;">Não foi você?</strong> Alguém pode estar tentando acessar sua conta. Após desbloquear, recomendamos alterar sua senha e ativar o 2FA.', { last: true }),
    ].join('\n'),
  })

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Desbloqueie sua conta Nancy',
    html,
  })
}

module.exports = { sendMonthlyReport, sendResetEmail, sendRenewalReminderEmail, sendWelcomeEmail, sendTrialExpiryEmail, sendPlanActivationEmail, sendReferralRewardEmail, sendWeeklyDigest, sendPlanExpiredEmail, sendVerificationEmail, sendPasswordChangedAlert, sendNewIpLoginAlert, sendAccountUnlockEmail, sendEmailChangeVerification, sendEmailChangeAlert }
