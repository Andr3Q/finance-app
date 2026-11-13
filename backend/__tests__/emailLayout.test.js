'use strict'

const {
  esc, emailLayout, emailP, emailSmall, emailGreeting, emailNote, emailButton, emailCode, emailDivider, emailRows, C,
} = require('../src/services/emailLayout')
const { bannerUrl } = require('../src/services/emailBanners')

describe('emailLayout — casca dos e-mails', () => {
  test('título e prévia são texto puro: tudo escapado (título sem imagem usa o cabeçalho em texto)', () => {
    const h = emailLayout({ title: '<b>T</b>', preheader: '<u>P</u>', body: '' })
    for (const cru of ['<b>T</b>', '<u>P</u>']) expect(h).not.toContain(cru)
    expect(h).toContain('&lt;b&gt;T&lt;/b&gt;')
    expect(h).toContain('&lt;u&gt;P&lt;/u&gt;')
  })

  test('sem prévia não cria a linha escondida', () => {
    const h = emailLayout({ title: 'Oi', body: '<p>corpo</p>' })
    expect(h).not.toContain('display:none')
    expect(h).toContain('<p>corpo</p>')
  })

  test('título com imagem: cabeçalho é a imagem, com o título no texto alternativo e azul de reserva', () => {
    const h = emailLayout({ title: 'Resumo semanal', body: '' })
    expect(h).toContain(`<img src="${bannerUrl('Resumo semanal')}" width="520" alt="Resumo semanal"`)
    expect(h).toContain('class="nx-hero"')
    expect(h).toContain('bgcolor="#1C48FF"')                 // reserva para o Outlook (sem degradê, sem imagem)
    expect(h).toContain('linear-gradient(135deg,#3A62FF')    // reserva para os demais enquanto a imagem não carrega
    expect(h).not.toContain('<h1')                           // o título não é texto: o Gmail escuro viraria o branco em preto
  })

  test('texto alternativo da imagem é escapado', () => {
    const h = emailLayout({ title: 'Resumo semanal', body: '' })
    expect(h).not.toMatch(/alt="[^"]*[<>][^"]*"/)
  })

  test('título sem imagem: o e-mail sai igual, com o título em texto e sem imagem nenhuma', () => {
    const h = emailLayout({ title: 'Título novo sem imagem', body: '' })
    expect(h).toContain('<h1 class="nx-title"')
    expect(h).toContain('>Título novo sem imagem</h1>')
    expect(h).toContain('>nancy</p>')
    expect(h).not.toContain('<img')
  })

  test('cabe no celular: largura máxima 520 e regra para telas estreitas', () => {
    const h = emailLayout({ title: 'Oi', body: '' })
    expect(h).toContain('max-width:520px')
    expect(h).toContain('@media (max-width: 520px)')
    expect(h).toContain('name="viewport"')
  })
})

describe('emailLayout — peças do miolo', () => {
  test('botão: link escapado no atributo, largura toda, azul da marca por padrão', () => {
    const b = emailButton('https://x.com/a?b=1&c="2"', 'Ir')
    expect(b).toContain('href="https://x.com/a?b=1&amp;c=&quot;2&quot;"')
    expect(b).toContain(`bgcolor="${C.brand}"`)
    expect(b).toContain('width="100%"')
    expect(b).toContain('>Ir</a>')
  })

  test('botão com cor própria e último item sem margem embaixo', () => {
    const b = emailButton('https://x.com', 'Ir', { bg: '#7C3AED', last: true })
    expect(b).toContain('bgcolor="#7C3AED"')
    expect(b).toContain('margin:0 0 0px')
  })

  test('aviso: cada tom tem a sua cor; tom desconhecido vira informativo', () => {
    expect(emailNote('danger', 'x')).toContain('#FFECEE')
    expect(emailNote('warn', 'x')).toContain('#FFF6E0')
    expect(emailNote('success', 'x')).toContain('#E6FAF1')
    const desconhecido = emailNote('nao-existe', 'x')
    expect(desconhecido).toContain('#EEF2FF')
    expect(desconhecido).toContain('nx-note-info')
  })

  test('saudação escapa o nome', () => {
    expect(emailGreeting('<script>')).toContain('Olá, <strong style="font-weight:800;">&lt;script&gt;</strong>!')
  })

  test('parágrafos: último item sem margem, alinhamento configurável', () => {
    expect(emailP('a', { last: true })).toContain('margin:0 0 0px')
    expect(emailP('a', { mb: 12 })).toContain('margin:0 0 12px')
    expect(emailSmall('a', { align: 'center' })).toContain('text-align:center')
  })

  test('código: só o texto, escapado, em caixa própria', () => {
    const c = emailCode('<1>')
    expect(c).toContain('&lt;1&gt;')
    expect(c).toContain('nx-code')
  })

  test('linhas de números: verde, vermelho e neutro; a última não leva traço embaixo', () => {
    const r = emailRows([
      { label: 'A', value: '1', tone: 'green' },
      { label: 'B', value: '2', tone: 'red' },
      { label: 'C', value: '3' },
      { label: 'Total', value: '6', big: true },
    ])
    expect(r).toContain('nx-green')
    expect(r).toContain('nx-red')
    expect(r.match(/border-bottom:1px solid/g)).toHaveLength(6) // 3 linhas x 2 células
    expect(r.match(/border-bottom:none/g)).toHaveLength(2)      // a última linha
    expect(r).toContain('font-size:17px')                       // total em destaque
  })

  test('linhas de números escapam rótulo e valor', () => {
    const r = emailRows([{ label: '<b>L</b>', value: '<i>V</i>' }])
    expect(r).not.toContain('<b>L</b>')
    expect(r).not.toContain('<i>V</i>')
  })

  test('divisor é uma linha fina', () => {
    expect(emailDivider()).toContain('border-top:1px solid')
  })

  test('esc cobre os cinco caracteres e aceita vazio', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#x27;')
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
    expect(esc(42)).toBe('42')
  })
})
