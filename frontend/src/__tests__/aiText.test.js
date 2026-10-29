import { parseAiText, parseInline } from '../utils/aiText.js'

// Respostas reais da rodada de QA N2-7: o chat mostrava markdown cru ("**Saldo atual:** **R$ 8.822,20**", tabelas com "|").
describe('parseInline', () => {
  it('negrito vira parte em destaque e o resto fica como texto', () => {
    expect(parseInline('**Saldo atual:** **R$ 8.822,20**')).toEqual([
      { text: 'Saldo atual:', bold: true }, { text: ' ', bold: false }, { text: 'R$ 8.822,20', bold: true },
    ])
    expect(parseInline('Você gastou __R$ 10,00__ hoje')).toEqual([
      { text: 'Você gastou ', bold: false }, { text: 'R$ 10,00', bold: true }, { text: ' hoje', bold: false },
    ])
  })

  it('texto sem marcação passa intacto (inclusive dinheiro, acentos e porcentagem)', () => {
    expect(parseInline('Alimentação: R$ 1.234,56 (35%) — ok')).toEqual([{ text: 'Alimentação: R$ 1.234,56 (35%) — ok', bold: false }])
  })

  it('código, itálico e link viram texto puro; ** sem par some', () => {
    expect(parseInline('use `R$ 5` e *talvez* veja [o site](https://x.com)')).toEqual([{ text: 'use R$ 5 e talvez veja o site', bold: false }])
    expect(parseInline('**texto cortado')).toEqual([{ text: 'texto cortado', bold: false }])
    expect(parseInline('')).toEqual([])
    expect(parseInline(undefined)).toEqual([])
  })

  it('multiplicação e asterisco solto não viram itálico', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4', bold: false }])
  })
})

describe('parseAiText', () => {
  it('parágrafos separados por linha em branco; quebra de linha dentro do parágrafo é preservada', () => {
    expect(parseAiText('Oi!\nTudo bem?\n\nSegundo parágrafo')).toEqual([
      { type: 'p', text: 'Oi!\nTudo bem?' }, { type: 'p', text: 'Segundo parágrafo' },
    ])
  })

  it('títulos (#, ##, ###) viram um bloco de título sem os #', () => {
    expect(parseAiText('### Onde está o maior gasto?\nTexto')).toEqual([
      { type: 'heading', text: 'Onde está o maior gasto?' }, { type: 'p', text: 'Texto' },
    ])
  })

  it('listas com -, * e • e listas numeradas', () => {
    expect(parseAiText('- **Valor:** R$ 30,00\n- Categoria: Transporte\n* outro\n• mais um')).toEqual([
      { type: 'ul', items: ['**Valor:** R$ 30,00', 'Categoria: Transporte', 'outro', 'mais um'] },
    ])
    expect(parseAiText('1. Primeiro\n2) Segundo')).toEqual([{ type: 'ol', items: ['Primeiro', 'Segundo'] }])
  })

  it('tabela do QA vira tabela de verdade (cabeçalho, linhas e alinhamento ignorado)', () => {
    const md = '**Resumo dos gastos em outubro 2026**\n\n| Categoria | Valor total (R$) | % |\n|-----------|:-----------------:|--:|\n| Casa | 3.500,00 | 45% |\n| Alimentação | 1.200,00 | 15% |\n\n### Onde está o maior gasto?'
    expect(parseAiText(md)).toEqual([
      { type: 'p', text: '**Resumo dos gastos em outubro 2026**' },
      { type: 'table', header: ['Categoria', 'Valor total (R$)', '%'], rows: [['Casa', '3.500,00', '45%'], ['Alimentação', '1.200,00', '15%']] },
      { type: 'heading', text: 'Onde está o maior gasto?' },
    ])
  })

  it('tabela sem barras nas pontas e com linha a menos de células', () => {
    expect(parseAiText('Categoria | Valor\n--- | ---\nCasa | 10\nSó uma | ')).toEqual([
      { type: 'table', header: ['Categoria', 'Valor'], rows: [['Casa', '10'], ['Só uma']] }, // a célula que falta é completada na tela (AiMessage)
    ])
  })

  it('linha com | que NÃO é tabela continua parágrafo', () => {
    expect(parseAiText('Gastos | de hoje\nsem separador')).toEqual([{ type: 'p', text: 'Gastos | de hoje\nsem separador' }])
  })

  it('régua horizontal some; citação perde o ">"', () => {
    expect(parseAiText('antes\n\n---\n\n> dica')).toEqual([{ type: 'p', text: 'antes' }, { type: 'p', text: 'dica' }])
  })

  it('mistura: lista depois de parágrafo, sem linha em branco', () => {
    expect(parseAiText('Resumo:\n- um\n- dois\nFim')).toEqual([
      { type: 'p', text: 'Resumo:' }, { type: 'ul', items: ['um', 'dois'] }, { type: 'p', text: 'Fim' },
    ])
  })

  it('entrada vazia ou inválida não quebra', () => {
    expect(parseAiText('')).toEqual([])
    expect(parseAiText(null)).toEqual([])
    expect(parseAiText(undefined)).toEqual([])
    expect(parseAiText('\r\nlinha\r\n')).toEqual([{ type: 'p', text: 'linha' }])
  })

  it('HTML na resposta continua sendo só texto (o parser nunca interpreta tags)', () => {
    expect(parseAiText('<img src=x onerror=alert(1)> **ok**')).toEqual([{ type: 'p', text: '<img src=x onerror=alert(1)> **ok**' }])
    expect(parseInline('<img src=x onerror=alert(1)> **ok**')).toEqual([{ text: '<img src=x onerror=alert(1)> ', bold: false }, { text: 'ok', bold: true }])
  })
})
