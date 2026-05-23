// ═══════════════════════════════════════════════════════
// 📧 src/services/emailService.js — Envio de E-mail
//
// Usa o Nodemailer para enviar e-mails via Gmail SMTP.
// É chamado pelo reports.js quando o usuário fecha o mês.
// ═══════════════════════════════════════════════════════

const nodemailer = require('nodemailer')

// Escapa caracteres especiais HTML para evitar injeção nos templates de e-mail
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// Cria o transportador de e-mails — configura qual servidor de e-mail usar
// Gmail requer uma "App Password" (não a senha normal da conta)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

// Valida credenciais na inicialização para detectar problema cedo
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('[emailService] EMAIL_USER ou EMAIL_PASS não configurados — envio de e-mails desativado.')
}

/**
 * Envia o relatório mensal por e-mail com o PDF em anexo
 * @param {string} toEmail    - E-mail do destinatário
 * @param {string} userName   - Nome do usuário
 * @param {number} month      - Mês do relatório (1-12)
 * @param {number} year       - Ano do relatório
 * @param {object} summary    - Resumo financeiro do mês
 * @param {Buffer} pdfBuffer  - PDF gerado em memória
 */
async function sendMonthlyReport(toEmail, userName, month, year, summary, pdfBuffer) {
  const monthNames = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ]
  const monthName = monthNames[month - 1]

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1a1a3e, #2d2d6e); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: #fff; margin: 0; font-size: 28px;">💸 FinançasPro</h1>
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
          <tr>
            <td style="padding: 12px; color: #666;">📋 Contas Fixas</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #ff4757;">
              - R$ ${summary.totalFixedCosts.toFixed(2).replace('.', ',')}
            </td>
          </tr>
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
        FinançasPro — Seu controle financeiro pessoal 💸
      </p>
    </div>
  `

  await transporter.sendMail({
    from:    `"FinançasPro 💸" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: `📊 Relatório de ${monthName}/${year} — FinançasPro`,
    html:    emailHtml,
    attachments: [
      {
        filename:    `relatorio-${monthName.toLowerCase()}-${year}.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  })
}

async function sendResetEmail(toEmail, userName, resetLink) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(0,255,204,0.15);">
        <h1 style="color: #00ffcc; margin: 0; font-size: 24px;">FinançasPro</h1>
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
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">FinançasPro — Seu controle financeiro pessoal</p>
    </div>
  `
  await transporter.sendMail({
    from:    `"FinançasPro" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: 'Redefinição de senha — FinançasPro',
    html
  })
}

async function sendRenewalReminderEmail(toEmail, userName, planName, daysLeft) {
  const appUrl  = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
  const planLabel = planName === 'elite' ? 'Elite' : 'Pro'
  const urgency   = daysLeft <= 1 ? 'expira hoje' : `expira em ${daysLeft} dias`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #020d10, #061520); padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 20px; border: 1px solid rgba(74,196,110,0.2);">
        <h1 style="color: #4ac46e; margin: 0; font-size: 24px;">FinançasPro</h1>
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
      <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 16px;">FinançasPro — Seu controle financeiro pessoal</p>
    </div>
  `

  await transporter.sendMail({
    from:    `"FinançasPro" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: `Seu plano ${planLabel} ${urgency} — FinançasPro`,
    html,
  })
}

module.exports = { sendMonthlyReport, sendResetEmail, sendRenewalReminderEmail }
