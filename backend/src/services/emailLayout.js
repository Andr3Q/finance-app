'use strict'

// ═══════════════════════════════════════════════════════
// 📧 src/services/emailLayout.js — Visual dos e-mails (Nancy 2)
//
// Casca única dos e-mails transacionais: cabeçalho azul com a logo, cartão branco
// de cantos arredondados, botão azul, avisos coloridos e versão escura. Cada e-mail
// em emailService.js só monta o miolo (texto, link, números) com os ajudantes daqui.
//
// Regras de e-mail (por isso tudo é tabela com estilo na própria tag):
// - cliente de e-mail não entende variável de CSS, flex nem fonte da web: cores
//   fixas e pilha de fontes do sistema;
// - o que o Gmail do iPhone escurece sozinho (fundo branco vira cinza escuro)
//   continua legível; quem aceita `prefers-color-scheme` (Apple Mail, Outlook)
//   recebe a paleta escura abaixo;
// - tudo que vem do usuário (nome etc.) precisa passar por esc() antes de entrar
//   no miolo; título, subtítulo e prévia daqui já são escapados.
// ═══════════════════════════════════════════════════════

const SITE_URL = 'https://myfinancepro.com.br'
// Sempre o endereço de produção: na homologação o portão barraria a imagem.
const LOGO_URL = `${SITE_URL}/logo-icon.png`

const C = {
  brand: '#1C48FF',
  ink: '#121A33',
  muted: '#5B6784',
  soft: '#66728F',
  page: '#F2F6FF',
  line: '#E3EAF6',
  green: '#0E9F6E',
  red: '#D92D43',
}

const FONT = "'Sora',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace"

// Escapa caracteres especiais HTML para evitar injeção nos templates de e-mail
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const TONES = {
  info:    { bg: '#EEF2FF', bar: '#1C48FF', ink: '#121A33' },
  success: { bg: '#E6FAF1', bar: '#1FBF86', ink: '#0E3C2E' },
  warn:    { bg: '#FFF6E0', bar: '#F5A623', ink: '#4A3200' },
  danger:  { bg: '#FFECEE', bar: '#E5384A', ink: '#5C1420' },
}

// Parágrafo comum do corpo. `mb` é o espaço abaixo (20 por padrão; `last` zera, para o último item do cartão).
function emailP(html, { align = 'left', mb = 20, last = false } = {}) {
  return `<p class="nx-muted" style="margin:0 0 ${last ? 0 : mb}px;font-family:${FONT};font-size:15px;line-height:1.65;color:${C.muted};text-align:${align};">${html}</p>`
}

// Parágrafo pequeno (avisos de prazo, "ignore se não foi você").
function emailSmall(html, { align = 'left', last = false } = {}) {
  return `<p class="nx-soft" style="margin:0 0 ${last ? 0 : 20}px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.soft};text-align:${align};">${html}</p>`
}

function emailGreeting(name) {
  return `<p class="nx-ink" style="margin:0 0 10px;font-family:${FONT};font-size:17px;line-height:1.4;color:${C.ink};">Olá, <strong style="font-weight:800;">${esc(name)}</strong>!</p>`
}

// Aviso colorido (info, success, warn, danger). O miolo já vem escapado.
function emailNote(tone, html, { last = false } = {}) {
  const t = TONES[tone] || TONES.info
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${last ? 0 : 20}px;"><tr>
<td class="nx-note nx-note-${tone in TONES ? tone : 'info'}" bgcolor="${t.bg}" style="background:${t.bg};border-left:4px solid ${t.bar};border-radius:14px;padding:16px 18px;font-family:${FONT};font-size:14px;line-height:1.65;color:${t.ink};">${html}</td>
</tr></table>`
}

// Botão principal (largura toda, como os botões do app). O endereço é escapado aqui.
function emailButton(href, label, { bg = C.brand, color = '#FFFFFF', last = false } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 ${last ? 0 : 20}px;"><tr>
<td align="center" bgcolor="${bg}" style="background:${bg};border-radius:16px;">
<a href="${esc(href)}" style="display:block;padding:16px 24px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${color};text-decoration:none;border-radius:16px;">${label}</a>
</td></tr></table>`
}

// Linha fina que separa o botão do que vem depois (ex.: o código alternativo).
function emailDivider() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr><td class="nx-rule" height="1" style="height:1px;font-size:0;line-height:0;border-top:1px solid ${C.line};">&nbsp;</td></tr></table>`
}

// Caixa do código de 6 dígitos (o código vem do servidor, só números).
function emailCode(code) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr>
<td align="center" class="nx-code" bgcolor="#EEF2FF" style="background:#EEF2FF;border-radius:16px;padding:16px 12px;font-family:${MONO};font-size:32px;font-weight:700;letter-spacing:8px;line-height:1.2;color:${C.brand};">${esc(code)}</td>
</tr></table>`
}

// Linhas de números (resumo semanal e relatório mensal): [{ label, value, tone?, big? }],
// com tone 'green' (entrou/positivo) ou 'red' (negativo). `big` destaca a linha (o total).
function emailRows(rows) {
  const body = rows.map((r, i) => {
    const isLast = i === rows.length - 1
    const border = isLast ? 'none' : `1px solid ${C.line}`
    const size = r.big ? 17 : 15
    const weight = r.big ? 800 : 700
    const valueClass = r.tone === 'green' ? 'nx-green' : r.tone === 'red' ? 'nx-red' : 'nx-ink'
    const valueColor = r.tone === 'green' ? C.green : r.tone === 'red' ? C.red : C.ink
    return `<tr>
<td class="nx-rule ${r.big ? 'nx-ink' : 'nx-muted'}" style="padding:13px 0;border-bottom:${border};font-family:${FONT};font-size:${size}px;color:${r.big ? C.ink : C.muted};${r.big ? 'font-weight:700;' : ''}">${esc(r.label)}</td>
<td class="nx-rule ${valueClass}" align="right" style="padding:13px 0;border-bottom:${border};font-family:${FONT};font-size:${size}px;font-weight:${weight};color:${valueColor};white-space:nowrap;">${esc(r.value)}</td>
</tr>`
  }).join('\n')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">${body}</table>`
}

const DARK_CSS = `
@media (prefers-color-scheme: dark) {
  .nx-page { background:#0B1020 !important; }
  .nx-card { background:#151D35 !important; }
  .nx-ink { color:#F2F6FF !important; }
  .nx-muted { color:#B4BED8 !important; }
  .nx-soft { color:#93A0BF !important; }
  .nx-rule { border-color:#26304D !important; }
  .nx-accent { color:#9DB4FF !important; }
  .nx-green { color:#4AE2AC !important; }
  .nx-red { color:#FF8794 !important; }
  .nx-code { background:#1D2850 !important; color:#9DB4FF !important; }
  .nx-note-info { background:#1A2552 !important; color:#E3E9FF !important; }
  .nx-note-success { background:#12342B !important; color:#C9F6E2 !important; }
  .nx-note-warn { background:#3A2E12 !important; color:#FFE6B0 !important; }
  .nx-note-danger { background:#3B1A22 !important; color:#FFD1D6 !important; }
  .nx-foot a { color:#9DB4FF !important; }
}`

const MOBILE_CSS = `
@media (max-width: 520px) {
  .nx-wrap { padding:12px 10px !important; }
  .nx-card { padding:24px 20px !important; }
  .nx-head { padding:24px 20px !important; }
  .nx-title { font-size:24px !important; }
}`

// Monta o e-mail completo.
//   title      — título grande do cabeçalho (texto puro)
//   subtitle   — linha opcional abaixo do título (texto puro)
//   preheader  — texto de prévia que aparece na lista da caixa de entrada (texto puro)
//   body       — HTML do miolo (já escapado), montado com os ajudantes acima
function emailLayout({ title, subtitle = '', preheader = '', body }) {
  const hidden = esc(preheader)
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)} — Nancy</title>
<style>${MOBILE_CSS}${DARK_CSS}</style>
</head>
<body class="nx-page" style="margin:0;padding:0;background:${C.page};">
${hidden ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${hidden}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="nx-page" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" class="nx-wrap" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

<tr><td class="nx-head" bgcolor="${C.brand}" style="background:${C.brand};background-image:linear-gradient(135deg,#3A62FF 0%,#1C48FF 55%,#1636D4 100%);border-radius:24px;padding:28px 28px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;"><tr>
<td valign="middle" style="padding:0 12px 0 0;"><img src="${LOGO_URL}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:12px;"></td>
<td valign="middle" style="font-family:${FONT};font-size:22px;font-weight:800;line-height:1;letter-spacing:-0.4px;color:#FFFFFF;">nancy</td>
</tr></table>
<h1 class="nx-title" style="margin:0;font-family:${FONT};font-size:26px;font-weight:800;line-height:1.2;letter-spacing:-0.4px;color:#FFFFFF;">${esc(title)}</h1>
${subtitle ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:14px;line-height:1.5;color:#D6E0FF;">${esc(subtitle)}</p>` : ''}
</td></tr>

<tr><td height="12" style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>

<tr><td class="nx-card" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:24px;padding:30px 28px;">
${body}
</td></tr>

<tr><td class="nx-foot" align="center" style="padding:22px 12px 4px;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.soft};">
<span class="nx-soft" style="color:${C.soft};">Nancy — Seu controle financeiro pessoal</span><br>
<a href="${SITE_URL}/privacidade" style="color:${C.brand};text-decoration:none;">Política de Privacidade</a>
<span class="nx-soft" style="color:${C.soft};">&nbsp;·&nbsp;</span>
<a href="${SITE_URL}/termos" style="color:${C.brand};text-decoration:none;">Termos de Uso</a>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

module.exports = { esc, emailLayout, emailP, emailSmall, emailGreeting, emailNote, emailButton, emailCode, emailDivider, emailRows, C, SITE_URL, LOGO_URL }
