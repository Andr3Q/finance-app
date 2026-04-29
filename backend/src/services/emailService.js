// ═══════════════════════════════════════════════════════
// 📧 src/services/emailService.js — Envio de E-mail
//
// Usa o Nodemailer para enviar e-mails via Gmail SMTP.
// É chamado pelo reports.js quando o usuário fecha o mês.
// ═══════════════════════════════════════════════════════

const nodemailer = require('nodemailer')

// Cria o "transportador" de e-mails — configura qual servidor de e-mail usar
// Gmail requer uma "App Password" (não a senha normal da conta)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,  // peereiraandre@gmail.com
    pass: process.env.EMAIL_PASS   // App Password do Google
  }
})

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
        <p style="color: #333; font-size: 16px;">Olá, <strong>${userName}</strong>! 👋</p>
        <p style="color: #666;">Aqui está o resumo financeiro do seu mês de <strong>${monthName}/${year}</strong>:</p>
        
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

module.exports = { sendMonthlyReport }
