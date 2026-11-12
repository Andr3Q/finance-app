'use strict'

const {
  esc, emailLayout, emailP, emailSmall, emailGreeting, emailNote, emailButton, emailCode, emailDivider, emailRows, C, LOGO_URL,
} = require('../src/services/emailLayout')

describe('emailLayout — casca dos e-mails', () => {
  test('título, subtítulo e prévia são texto puro: tudo escapado', () => {
    const h = emailLayout({ title: '<b>T</b>', subtitle: '<i>S</i>', preheader: '<u>P</u>', body: '' })
    for (const cru of ['<b>T</b>', '<i>S</i>', '<u>P</u>']) expect(h).not.toContain(cru)
    expect(h).toContain('&lt;b&gt;T&lt;/b&gt;')
    expect(h).toContain('&lt;i&gt;S&lt;/i&gt;')
    expect(h).toContain('&lt;u&gt;P&lt;/u&gt;')
  })

  test('sem prévia não cria a linha escondida; sem subtítulo não cria o parágrafo', () => {
    const h = emailLayout({ title: 'Oi', body: '<p>corpo</p>' })
    expect(h).not.toContain('display:none')
    expect(h).not.toContain('#D6E0FF')
    expect(h).toContain('<p>corpo</p>')
  })

  test('a logo vem da produção e é decorativa (o "nancy" ao lado já diz o nome)', () => {
    const h = emailLayout({ title: 'Oi', body: '' })
    expect(LOGO_URL).toBe('https://myfinancepro.com.br/logo-icon.png')
    expect(h).toContain(`<img src="${LOGO_URL}" width="40" height="40" alt=""`)
    expect(h).toContain('>nancy</td>')
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
