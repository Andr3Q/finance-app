// ═══════════════════════════════════════════════════════
// 📧 src/services/emailService.js — Envio de E-mail
//
// Usa o Resend para envio de e-mails transacionais.
// Requer: RESEND_API_KEY (secret) e EMAIL_FROM (env var).
// ═══════════════════════════════════════════════════════

const { Resend } = require('resend')

// Escapa caracteres especiais HTML para evitar injeção nos templates de e-mail
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

if (!process.env.RESEND_API_KEY) {
  console.warn('[emailService] RESEND_API_KEY não configurada — envio de e-mails desativado.')
}
const resend = new Resend(process.env.RESEND_API_KEY || 'not_configured')

const FROM = process.env.EMAIL_FROM || 'Nancy <noreply@nancy.app>'

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

async function sendMonthlyReport(toEmail, userName, month, year, summary, pdfBuffer) {
  const monthNames = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ]
  const monthName = monthNames[month - 1]

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1a1a3e, #2d2d6e); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: #fff; margin: 0; font-size: 28px;">💸 Nancy</h1>
        <p style="color: #a0a0d0; margin: 8px 0 0;">Relatório de ${monthName}/${year}</p>
      </div>
      <div style="background: #fff; padding: 24px; border-radius: 12px; margin-bottom: 16px;">
        <p style="color: #333; font-size: 16px;">Olá, <strong>${esc(userName)}</strong>! 👋</p>
        <p style="color: #666;">Aqui está o resumo financeiro do seu mês de <strong>${esc(monthName)}/${year}</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr style="background: #f8f8f8;">
            <td style="padding: 12px; border-radius: 8px 0 0 8px; color: #666;">💰 Salário</td>
            <td style="padding: 12px; border-radius: 0 8px 8px 0; text-align: right; font-weight: bold; color: #00d084;">
              R$ ${summary.salary.toFixed(2).replace('.', ',')}
            </td>
          </tr>
          ${!summary.autoLaunched ? `<tr>
            <td style="padding: 12px; color: #666;">📋 Contas Fixas</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #ff4757;">
              - R$ ${summary.totalFixedCosts.toFixed(2).replace('.', ',')}
            </td>
          </tr>` : ''}
          <tr style="background: #f8f8f8;">
            <td style="padding: 12px; border-radius: 8px 0 0 8px; color: #666;">🛍️ Total Gasto</td>
            <td style="padding: 12px; border-radius: 0 8px 8px 0; text-align: right; font-weight: bold; color: #ff4757;">
              - R$ ${summary.totalExpenses.toFixed(2).replace('.', ',')}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px; color: #333; font-weight: bold; font-size: 18px;">✅ Saldo Final</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 18px; color: ${summary.currentBalance >= 0 ? '#00d084' : '#ff4757'};">
              R$ ${summary.currentBalance.toFixed(2).replace('.', ',')}
            </td>
          </tr>
        </table>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        O detalhamento completo está no PDF em anexo.<br/>
        Nancy — Seu controle financeiro pessoal 💸
      </p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `📊 Relatório de ${monthName}/${year} — Nancy`,
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
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(0,255,204,0.15);">
        <h1 style="color: #00ffcc; margin: 0; font-size: 24px;">Nancy</h1>
        <p style="color: #5a8a78; margin: 8px 0 0; font-size: 14px;">Redefinição de senha</p>
      </div>
      <div style="background: #fff; padding: 28px; border-radius: 12px;">
        <p style="color: #333; font-size: 15px; margin: 0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:
        </p>
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #00ffcc, #00a89a); color: #021a14; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Redefinir minha senha
          </a>
        </div>
        <p style="color: #999; font-size: 12px; line-height: 1.5; margin: 0;">
          Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail — sua senha permanece a mesma.
        </p>
      </div>
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `
  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Redefinição de senha — Nancy',
    html,
  })
}

async function sendRenewalReminderEmail(toEmail, userName, planName, daysLeft) {
  const appUrl    = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const planLabel = planName === 'elite' ? 'Elite' : 'Pro'
  const urgency   = daysLeft <= 1 ? 'expira hoje' : `expira em ${daysLeft} dias`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(74,196,110,0.2);">
        <h1 style="color: #4ac46e; margin: 0; font-size: 24px;">Nancy</h1>
        <p style="color: #5a8a78; margin: 8px 0 0; font-size: 14px;">Aviso de renovação</p>
      </div>
      <div style="background: #fff; padding: 28px; border-radius: 12px;">
        <p style="color: #333; font-size: 15px; margin: 0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Seu plano <strong>${esc(planLabel)}</strong> <strong style="color: #e55;">${esc(urgency)}</strong>.
          Para continuar aproveitando todos os recursos, renove agora.
        </p>
        <div style="background: #f9f9f9; border-radius: 10px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #4ac46e;">
          <p style="margin: 0; color: #333; font-size: 13px; line-height: 1.6;">
            Após o vencimento, sua conta retorna automaticamente para o plano Free e você perderá acesso ao assistente IA, relatórios avançados e outros recursos premium.
          </p>
        </div>
        <div style="text-align: center; margin-bottom: 20px;">
          <a href="${appUrl}/planos" style="display: inline-block; background: #4ac46e; color: #000; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Renovar plano ${esc(planLabel)}
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          Se já renovou, ignore este e-mail.
        </p>
      </div>
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Seu plano ${planLabel} ${urgency} — Nancy`,
    html,
  })
}

async function sendWelcomeEmail(toEmail, userName, trialEndsAt) {
  const appUrl   = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const trialEnd = new Date(trialEndsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(0,255,204,0.15);">
        <h1 style="color: #00ffcc; margin: 0; font-size: 26px;">Nancy</h1>
        <p style="color: #5a8a78; margin: 8px 0 0; font-size: 14px;">Seja bem-vindo(a)! 🎉</p>
      </div>
      <div style="background: #fff; padding: 28px; border-radius: 12px;">
        <p style="color: #333; font-size: 16px; margin: 0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Sua conta foi criada com sucesso. Você está no <strong style="color: #00ffcc;">Plano Pro</strong> com <strong>7 dias grátis</strong> — sem precisar de cartão de crédito.
        </p>
        <div style="background: #f0fff8; border-radius: 10px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #00d084;">
          <p style="margin: 0 0 8px; color: #333; font-size: 13px; font-weight: bold;">O que está incluído no seu trial Pro:</p>
          <ul style="margin: 0; padding-left: 18px; color: #555; font-size: 13px; line-height: 1.8;">
            <li>Assistente financeiro com IA</li>
            <li>Relatórios e fechamentos mensais em PDF</li>
            <li>Metas de economia e orçamento por categoria</li>
            <li>Compras parceladas com controle automático</li>
            <li>Autenticação em dois fatores (2FA)</li>
          </ul>
        </div>
        <p style="color: #888; font-size: 13px; margin: 0 0 24px;">
          Seu trial expira em <strong>${esc(trialEnd)}</strong>. Após isso, você pode assinar ou continuar no plano grátis.
        </p>
        <div style="text-align: center;">
          <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #00ffcc, #00a89a); color: #021a14; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Acessar minha conta
          </a>
        </div>
      </div>
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Bem-vindo(a) ao Nancy! Seu trial Pro começa agora 🎉',
    html,
  })
}

async function sendTrialExpiryEmail(toEmail, userName, daysLeft) {
  const appUrl  = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const urgency = daysLeft <= 1 ? 'expira hoje' : `expira em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1a0a00, #2d1500); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(255,165,0,0.3);">
        <h1 style="color: #ffaa00; margin: 0; font-size: 24px;">Nancy</h1>
        <p style="color: #997a40; margin: 8px 0 0; font-size: 14px;">⏰ Seu trial está acabando</p>
      </div>
      <div style="background: #fff; padding: 28px; border-radius: 12px;">
        <p style="color: #333; font-size: 15px; margin: 0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Seu trial do <strong>Plano Pro</strong> <strong style="color: #e55;">${esc(urgency)}</strong>.
          Assine agora para continuar com acesso completo.
        </p>
        <div style="background: #fff8f0; border-radius: 10px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #ffaa00;">
          <p style="margin: 0; color: #333; font-size: 13px; line-height: 1.6;">
            Após o trial, sua conta migra para o plano Free e você perde acesso ao assistente IA, fechamentos em PDF e demais recursos premium.
          </p>
        </div>
        <div style="text-align: center; margin-bottom: 16px;">
          <a href="${appUrl}/planos" style="display: inline-block; background: #ffaa00; color: #1a0a00; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Assinar Pro — R$ 9,90/mês
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">Cancele quando quiser. Sem fidelidade.</p>
      </div>
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Seu trial Pro ${urgency} — Nancy`,
    html,
  })
}

async function sendPlanActivationEmail(toEmail, userName, plan, planExpiresAt) {
  const appUrl    = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const planLabel = plan === 'elite' ? 'Elite' : 'Pro'
  const expiresOn = new Date(planExpiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const color     = plan === 'elite' ? '#a855f7' : '#00ffcc'
  const textColor = plan === 'elite' ? '#fff' : '#021a14'

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(0,255,204,0.15);">
        <h1 style="color: ${color}; margin: 0; font-size: 24px;">Nancy</h1>
        <p style="color: #5a8a78; margin: 8px 0 0; font-size: 14px;">Plano ${esc(planLabel)} ativado ✅</p>
      </div>
      <div style="background: #fff; padding: 28px; border-radius: 12px;">
        <p style="color: #333; font-size: 15px; margin: 0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Seu pagamento foi confirmado. O <strong style="color: ${color};">Plano ${esc(planLabel)}</strong> está ativo e você tem acesso completo a todos os recursos.
        </p>
        <div style="background: #f0fff8; border-radius: 10px; padding: 16px; margin-bottom: 24px; border-left: 3px solid ${color};">
          <p style="margin: 0; color: #555; font-size: 13px; line-height: 1.6;">
            Seu plano está ativo até <strong>${esc(expiresOn)}</strong>. Você receberá um aviso antes do vencimento para renovar.
          </p>
        </div>
        <div style="text-align: center;">
          <a href="${appUrl}" style="display: inline-block; background: ${color}; color: ${textColor}; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Acessar minha conta
          </a>
        </div>
      </div>
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `Plano ${planLabel} ativado com sucesso! — Nancy`,
    html,
  })
}

async function sendReferralRewardEmail(toEmail, referrerName, referredName) {
  const appUrl = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(0,255,204,0.15);">
        <h1 style="color: #00ffcc; margin: 0; font-size: 24px;">Nancy</h1>
        <p style="color: #5a8a78; margin: 8px 0 0; font-size: 14px;">🎉 Sua indicação funcionou!</p>
      </div>
      <div style="background: #fff; padding: 28px; border-radius: 12px;">
        <p style="color: #333; font-size: 15px; margin: 0 0 12px;">Olá, <strong>${esc(referrerName)}</strong>!</p>
        <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          <strong>${esc(referredName)}</strong> criou uma conta usando o seu código de indicação.
          Como recompensa, você ganhou <strong style="color: #00ffcc;">+10 dias</strong> no seu plano!
        </p>
        <div style="background: #f0fff8; border-radius: 10px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #00d084;">
          <p style="margin: 0; color: #555; font-size: 13px; line-height: 1.6;">
            Continue indicando amigos — cada indicação que criar conta te dá mais 30 dias grátis. Não há limite!
          </p>
        </div>
        <div style="text-align: center;">
          <a href="${appUrl}/settings" style="display: inline-block; background: linear-gradient(135deg, #00ffcc, #00a89a); color: #021a14; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Ver meu código de indicação
          </a>
        </div>
      </div>
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: `🎉 ${esc(referredName)} entrou usando seu código — você ganhou +10 dias!`,
    html,
  })
}

async function sendPlanExpiredEmail(toEmail, userName, wasTrialOrPaid) {
  const appUrl   = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const subject  = wasTrialOrPaid === 'trial' ? 'Seu trial Pro encerrou — Nancy' : 'Seu plano expirou — Nancy'
  const headline = wasTrialOrPaid === 'trial' ? 'Seu trial de 7 dias encerrou' : 'Seu plano expirou'
  const detail   = wasTrialOrPaid === 'trial'
    ? 'Seu período de avaliação gratuita do <strong>Plano Pro</strong> chegou ao fim. Sua conta agora está no plano Grátis.'
    : 'Seu plano foi encerrado por falta de renovação. Sua conta agora está no plano Grátis.'

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#1a0a00,#2d1500);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(239,68,68,0.3);">
        <h1 style="color:#ef4444;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#997a40;margin:8px 0 0;font-size:14px;">⏰ ${esc(headline)}</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">${detail}</p>
        <div style="background:#fff5f5;border-radius:10px;padding:16px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0;color:#333;font-size:13px;line-height:1.6;">
            Seus dados continuam salvos. Para recuperar acesso ao assistente IA, relatórios PDF e demais recursos premium, assine agora:
          </p>
        </div>
        <div style="text-align:center;margin-bottom:16px;">
          <a href="${appUrl}/planos" style="display:inline-block;background:#4ac46e;color:#000;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;">
            Ver planos — a partir de R$ 9,90/mês
          </a>
        </div>
        <p style="color:#999;font-size:12px;text-align:center;margin:0;">Cancele quando quiser. Sem fidelidade.</p>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject,
    html,
  })
}

async function sendVerificationEmail(toEmail, userName, verifyLink) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#020d10,#061520);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(0,255,204,0.15);">
        <h1 style="color:#00ffcc;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#5a8a78;margin:8px 0 0;font-size:14px;">Confirme seu e-mail</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Clique no botão abaixo para confirmar seu endereço de e-mail e ativar sua conta completamente.
        </p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${verifyLink}" style="display:inline-block;background:linear-gradient(135deg,#00ffcc,#00a89a);color:#021a14;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;">
            Confirmar meu e-mail
          </a>
        </div>
        <p style="color:#999;font-size:12px;line-height:1.5;margin:0;">
          Este link expira em <strong>24 horas</strong>. Se não foi você, ignore este e-mail.
        </p>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `
  await send({
    from:    FROM,
    to:      toEmail,
    subject: 'Confirme seu e-mail — Nancy',
    html,
  })
}

// Vai pro e-mail NOVO — precisa confirmar posse antes da troca ser aplicada.
async function sendEmailChangeVerification(toEmail, userName, confirmLink) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#020d10,#061520);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(0,255,204,0.15);">
        <h1 style="color:#00ffcc;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#5a8a78;margin:8px 0 0;font-size:14px;">Confirme seu novo e-mail</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px;">
          Você pediu para trocar o e-mail de login da sua conta Nancy para este endereço. Clique no botão abaixo para confirmar — sem essa confirmação, a troca não é aplicada e seu e-mail atual continua sendo usado para entrar.
        </p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${confirmLink}" style="display:inline-block;background:linear-gradient(135deg,#00ffcc,#00a89a);color:#021a14;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;">
            Confirmar novo e-mail
          </a>
        </div>
        <p style="color:#999;font-size:12px;line-height:1.5;margin:0;">
          Este link expira em <strong>24 horas</strong>. Se você não pediu essa troca, ignore este e-mail — nada será alterado.
        </p>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `
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

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#1a0005,#2d000e);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(239,68,68,0.3);">
        <h1 style="color:#ef4444;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#997a7a;margin:8px 0 0;font-size:14px;">✉️ E-mail de login alterado</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">
          O e-mail de login da sua conta foi alterado para <strong>${esc(newEmail)}</strong> em <strong>${esc(now)}</strong> (horário de Brasília). A partir de agora, use o novo e-mail para entrar.
        </p>
        <div style="background:#fff5f5;border-radius:10px;padding:16px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0;color:#333;font-size:13px;line-height:1.6;">
            <strong>Não foi você?</strong> Como o e-mail de login mudou, "Esqueci minha senha" com este endereço antigo não vai mais funcionar. Responda este e-mail ou escreva pra
            <a href="mailto:contato@nancy.com.br" style="color:#ef4444;font-weight:700;">contato@nancy.com.br</a>
            imediatamente pra recuperarmos sua conta.
          </p>
        </div>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: '✉️ Seu e-mail de login foi alterado — Nancy',
    html,
  })
}

async function sendWeeklyDigest(toEmail, userName, weekData) {
  const appUrl = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const { totalExpenses, totalIncome, topCategory, transactionCount, balance } = weekData

  const fmtBRL       = (v) => `R$ ${Math.abs(v).toFixed(2).replace('.', ',')}`
  const balanceColor = balance >= 0 ? '#00d084' : '#ef4444'
  const topCatLine   = topCategory
    ? `<tr style="background:#f8f8f8;"><td style="padding:12px;border-radius:8px 0 0 8px;color:#666;">📌 Categoria que mais gastou</td><td style="padding:12px;border-radius:0 8px 8px 0;text-align:right;font-weight:bold;color:#333;">${esc(topCategory)}</td></tr>`
    : ''

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#020d10,#061520);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(0,255,204,0.15);">
        <h1 style="color:#00ffcc;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#5a8a78;margin:8px 0 0;font-size:14px;">📊 Resumo semanal</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">Aqui está o resumo dos seus últimos 7 dias:</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr><td style="padding:12px;color:#666;">📥 Entradas</td><td style="padding:12px;text-align:right;font-weight:bold;color:#00d084;">${fmtBRL(totalIncome)}</td></tr>
          <tr style="background:#f8f8f8;"><td style="padding:12px;border-radius:8px 0 0 8px;color:#666;">📤 Gastos</td><td style="padding:12px;border-radius:0 8px 8px 0;text-align:right;font-weight:bold;color:#ef4444;">- ${fmtBRL(totalExpenses)}</td></tr>
          <tr><td style="padding:12px;color:#666;">🔢 Transações registradas</td><td style="padding:12px;text-align:right;font-weight:bold;color:#333;">${transactionCount}</td></tr>
          ${topCatLine}
          <tr style="background:#f8f8f8;"><td style="padding:12px;border-radius:8px 0 0 8px;color:#333;font-weight:bold;font-size:16px;">✅ Saldo do período</td><td style="padding:12px;border-radius:0 8px 8px 0;text-align:right;font-weight:bold;font-size:16px;color:${balanceColor};">${balance >= 0 ? '' : '- '}${fmtBRL(balance)}</td></tr>
        </table>
        <div style="text-align:center;">
          <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#00ffcc,#00a89a);color:#021a14;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;">Ver detalhes no app</a>
        </div>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: '📊 Seu resumo semanal — Nancy',
    html,
  })
}

async function sendPasswordChangedAlert(toEmail, userName) {
  const appUrl = process.env.APP_URL || 'https://myfinancepro.com.br'
  const now    = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#1a0005,#2d000e);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(239,68,68,0.3);">
        <h1 style="color:#ef4444;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#997a7a;margin:8px 0 0;font-size:14px;">🔐 Senha alterada</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">
          A senha da sua conta foi alterada em <strong>${esc(now)}</strong> (horário de Brasília).
        </p>
        <div style="background:#fff5f5;border-radius:10px;padding:16px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0;color:#333;font-size:13px;line-height:1.6;">
            <strong>Não foi você?</strong> Acesse o app imediatamente e use "Esqueci minha senha" para recuperar o acesso.
            Se precisar de ajuda, entre em contato com o suporte.
          </p>
        </div>
        <div style="text-align:center;">
          <a href="${appUrl}/login" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;">
            Acessar minha conta
          </a>
        </div>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: '🔐 Sua senha foi alterada — Nancy',
    html,
  })
}

async function sendNewIpLoginAlert(toEmail, userName, ip) {
  const appUrl = process.env.APP_URL || 'https://myfinancepro.com.br'
  const now    = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#0d1a00,#1a2d00);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(255,170,0,0.3);">
        <h1 style="color:#ffaa00;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#997a40;margin:8px 0 0;font-size:14px;">🌐 Acesso de novo local detectado</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Detectamos um login na sua conta em <strong>${esc(now)}</strong> a partir de um endereço IP que não usou sua conta nos últimos 30 dias.
        </p>
        <div style="background:#f9f4e8;border-radius:10px;padding:16px;margin-bottom:24px;border-left:3px solid #ffaa00;">
          <p style="margin:0 0 8px;color:#333;font-size:13px;font-weight:bold;">Detalhes do acesso:</p>
          <p style="margin:0;color:#555;font-size:13px;line-height:1.6;">
            📍 IP: <strong>${esc(ip)}</strong><br/>
            🕐 Horário: <strong>${esc(now)}</strong> (Brasília)
          </p>
        </div>
        <div style="background:#fff8f0;border-radius:10px;padding:16px;margin-bottom:24px;border-left:3px solid #ef4444;">
          <p style="margin:0;color:#333;font-size:13px;line-height:1.6;">
            <strong>Não foi você?</strong> Altere sua senha imediatamente e ative a autenticação em dois fatores (2FA) nas configurações da sua conta.
          </p>
        </div>
        <div style="text-align:center;">
          <a href="${appUrl}/settings" style="display:inline-block;background:#ffaa00;color:#1a0a00;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;">
            Proteger minha conta
          </a>
        </div>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: '🌐 Acesso de novo local detectado — Nancy',
    html,
  })
}

async function sendAccountUnlockEmail(toEmail, userName, unlockLink) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#f5f5f5;padding:20px;">
      <div style="background:linear-gradient(135deg,#020d10,#061520);padding:30px;border-radius:12px;text-align:center;margin-bottom:20px;border:1px solid rgba(239,68,68,0.3);">
        <h1 style="color:#ef4444;margin:0;font-size:24px;">Nancy</h1>
        <p style="color:#997a7a;margin:8px 0 0;font-size:14px;">🔒 Conta bloqueada temporariamente</p>
      </div>
      <div style="background:#fff;padding:28px;border-radius:12px;">
        <p style="color:#333;font-size:15px;margin:0 0 12px;">Olá, <strong>${esc(userName)}</strong>!</p>
        <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Sua conta foi temporariamente bloqueada após <strong>10 tentativas de login incorretas</strong>.
          Clique no botão abaixo para desbloquear o acesso:
        </p>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${unlockLink}" style="display:inline-block;background:linear-gradient(135deg,#00ffcc,#00a89a);color:#021a14;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:15px;">
            Desbloquear minha conta
          </a>
        </div>
        <p style="color:#999;font-size:12px;line-height:1.5;margin:0 0 16px;">
          Este link expira em <strong>1 hora</strong> e só pode ser usado uma vez.
        </p>
        <div style="background:#fff5f5;border-radius:10px;padding:16px;border-left:3px solid #ef4444;">
          <p style="margin:0;color:#333;font-size:13px;line-height:1.6;">
            <strong>Não foi você?</strong> Alguém pode estar tentando acessar sua conta. Após desbloquear, recomendamos alterar sua senha e ativar o 2FA.
          </p>
        </div>
      </div>
      <p style="color:#bbb;font-size:11px;text-align:center;margin-top:16px;">Nancy — Seu controle financeiro pessoal</p>
    </div>
  `

  await send({
    from:    FROM,
    to:      toEmail,
    subject: '🔒 Desbloqueie sua conta Nancy',
    html,
  })
}

module.exports = { sendMonthlyReport, sendResetEmail, sendRenewalReminderEmail, sendWelcomeEmail, sendTrialExpiryEmail, sendPlanActivationEmail, sendReferralRewardEmail, sendWeeklyDigest, sendPlanExpiredEmail, sendVerificationEmail, sendPasswordChangedAlert, sendNewIpLoginAlert, sendAccountUnlockEmail, sendEmailChangeVerification, sendEmailChangeAlert }
