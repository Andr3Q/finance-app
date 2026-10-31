import { DESKTOP_NAV, visibleDesktopNav, desktopNavState, desktopTitle, greetingFor } from '../utils/desktopNav.js'
import appSource from '../App.jsx?raw'

describe('menu lateral do desktop — itens', () => {
  it('o design tem 9 itens, na ordem do protótipo', () => {
    expect(DESKTOP_NAV.map(i => i.label)).toEqual(
      ['Início', 'Extrato', 'Planilha IA', 'Nancy IA', 'Analisador', 'Metas', 'Finanças', 'Calendário', 'Planos'])
    expect(DESKTOP_NAV.find(i => i.key === 'planilha').badge).toBe('novo')
    expect(DESKTOP_NAV.find(i => i.key === 'analisador').badge).toBe('IA')
  })

  it('só aparecem os itens cuja tela já existe (Planilha IA e Analisador entram quando forem construídos)', () => {
    expect(visibleDesktopNav().map(i => i.label)).toEqual(
      ['Início', 'Extrato', 'Nancy IA', 'Metas', 'Finanças', 'Calendário', 'Planos'])
  })

  it('todo item pronto leva a uma rota que existe no app (ou dispara um evento)', () => {
    const routes = [...appSource.matchAll(/path="([^"]+)"/g)].map(m => m[1])
    for (const item of visibleDesktopNav()) {
      if (item.action) expect(item.action).toMatch(/^nancy:/)
      else expect(routes, `rota de "${item.label}"`).toContain(item.to)
    }
  })
})

describe('menu lateral do desktop — item aceso', () => {
  const nav = (p) => desktopNavState(p).activeNav

  it('cada tela principal acende o seu item', () => {
    expect(nav('/dashboard')).toBe('home')
    expect(nav('/transactions')).toBe('extrato')
    expect(nav('/goals')).toBe('metas')
    expect(nav('/financas')).toBe('financas')
    expect(nav('/calendar')).toBe('calendario')
    expect(nav('/planos')).toBe('planos')
  })

  it('sub-telas acendem o item pai', () => {
    for (const p of ['/contas-do-mes', '/parcelados', '/analise']) expect(nav(p), p).toBe('extrato')
    for (const p of ['/historico', '/assinaturas', '/lembretes', '/limites']) expect(nav(p), p).toBe('metas')
    for (const p of ['/resumo-stories', '/notificacoes']) expect(nav(p), p).toBe('home')
  })

  it('o grupo Configurações acende o cartão do usuário e nenhum item (Planos acende os dois)', () => {
    for (const p of ['/settings', '/settings/perfil', '/settings/seguranca', '/settings/pagamentos', '/settings/dados', '/termos', '/privacidade']) {
      expect(desktopNavState(p), p).toMatchObject({ activeNav: null, inSettings: true })
    }
    expect(desktopNavState('/planos')).toMatchObject({ activeNav: 'planos', inSettings: true })
    expect(desktopNavState('/dashboard').inSettings).toBe(false)
  })

  it('rota fora do mapa não acende nada e barra final é ignorada', () => {
    expect(desktopNavState('/nada-aqui')).toEqual({ screen: null, activeNav: null, inSettings: false })
    expect(nav('/transactions/')).toBe('extrato')
  })

  it('toda rota logada do app tem tela no mapa (senão a barra de cima mostraria "Ops!")', () => {
    const publicOrSpecial = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email',
      '/confirmar-troca-email', '/unlock-account', '/analytics', '*']
    const routes = [...appSource.matchAll(/path="([^"]+)"/g)].map(m => m[1]).filter(p => !publicOrSpecial.includes(p))
    expect(routes.length).toBeGreaterThan(20)
    for (const p of routes) expect(desktopNavState(p).screen, `rota ${p}`).not.toBeNull()
  })
})

describe('barra de cima do desktop — título e subtítulo', () => {
  const night = new Date(2026, 9, 20, 22, 0) // terça, 20 de outubro de 2026

  it('Início: saudação pelo horário, nome, dia da semana e data (como no design)', () => {
    expect(desktopTitle('/dashboard', { now: night, firstName: 'André' })).toEqual(['Início', 'Boa noite, André · terça, 20 de outubro'])
    expect(desktopTitle('/dashboard', { now: night })[1]).toBe('Boa noite · terça, 20 de outubro')
  })

  it('a saudação troca às 5h, 12h e 18h', () => {
    const at = (h, m = 0) => greetingFor(new Date(2026, 9, 20, h, m))
    expect(at(4, 59)).toBe('Boa noite')
    expect(at(5)).toBe('Bom dia')
    expect(at(11, 59)).toBe('Bom dia')
    expect(at(12)).toBe('Boa tarde')
    expect(at(17, 59)).toBe('Boa tarde')
    expect(at(18)).toBe('Boa noite')
  })

  it('Extrato e Contas do mês dizem o mês corrente', () => {
    expect(desktopTitle('/transactions', { now: night })).toEqual(['Extrato', 'Todas as movimentações de outubro'])
    expect(desktopTitle('/contas-do-mes', { now: night })).toEqual(['Contas do mês', 'Compromissos de outubro'])
    expect(desktopTitle('/transactions', { now: new Date(2026, 0, 5) })[1]).toBe('Todas as movimentações de janeiro')
  })

  it('demais telas usam os textos do protótipo', () => {
    expect(desktopTitle('/goals')).toEqual(['Metas', 'Seus objetivos'])
    expect(desktopTitle('/settings')).toEqual(['Configurações', 'Sua conta Nancy'])
    expect(desktopTitle('/settings/seguranca')).toEqual(['Segurança', 'Senha e duas etapas'])
    expect(desktopTitle('/settings/notificacoes')).toEqual(['Preferências', 'Alertas e lembretes'])
    expect(desktopTitle('/limites')).toEqual(['Limites', 'Teto de gasto por categoria'])
    expect(desktopTitle('/termos')).toEqual(['Termos de Uso', 'Atualizado em out/2026'])
  })

  it('rota desconhecida cai no texto da tela 404', () => {
    expect(desktopTitle('/nada-aqui')).toEqual(['Ops!', 'Erro 404'])
  })
})
