// Casca desktop (design "Nancy Desktop"): menu lateral e títulos da barra de cima. Funções puras — o que o protótipo chama de
// NAV, PARENT, SET_KEYS e TT (Nancy Desktop.dc.html), ligado às rotas reais do app.

// `ready: false` = a tela do item ainda não existe no app; o menu só mostra os itens prontos (ver visibleDesktopNav).
// `action` = em vez de trocar de rota, dispara o evento (Nancy IA abre o painel do chat até ter a tela própria).
export const DESKTOP_NAV = [
  { key: 'home',       label: 'Início',      icon: 'home',   to: '/dashboard',    ready: true },
  { key: 'extrato',    label: 'Extrato',     icon: 'list',   to: '/transactions', ready: true },
  { key: 'planilha',   label: 'Planilha IA', icon: 'grid',   to: '/planilha',     badge: 'novo', ready: false },
  { key: 'chat',       label: 'Nancy IA',    icon: 'spark',  action: 'nancy:open-agent-chat', ready: true },
  { key: 'analisador', label: 'Analisador',  icon: 'card',   to: '/analisador',   badge: 'IA', ready: false },
  { key: 'metas',      label: 'Metas',       icon: 'target', to: '/goals',        ready: true },
  { key: 'financas',   label: 'Finanças',    icon: 'wallet', to: '/financas',     ready: true },
  { key: 'calendario', label: 'Calendário',  icon: 'cal',    to: '/calendar',     ready: true },
  { key: 'planos',     label: 'Planos',      icon: 'zap',    to: '/planos',       ready: true },
]

export const visibleDesktopNav = () => DESKTOP_NAV.filter(i => i.ready)

// rota → tela do protótipo
const SCREEN_BY_PATH = {
  '/dashboard': 'home', '/resumo-stories': 'stories', '/notificacoes': 'notifs',
  '/transactions': 'extrato', '/contas-do-mes': 'compromissos', '/parcelados': 'parcelas', '/analise': 'analise',
  '/planilha': 'planilha', '/analisador': 'analisador',
  '/goals': 'metas', '/historico': 'historico', '/assinaturas': 'assinaturas', '/lembretes': 'lembretes', '/limites': 'limites',
  '/financas': 'financas', '/calendar': 'calendario',
  '/settings': 'perfil', '/settings/perfil': 'dadosPessoais', '/settings/seguranca': 'seguranca',
  '/settings/notificacoes': 'notificacoes', '/settings/fechamento': 'fechamento', '/planos': 'planos',
  '/settings/pagamentos': 'pagamentos', '/settings/indique': 'indique', '/settings/dados': 'dados',
  '/settings/instalar': 'instalar', '/termos': 'termos', '/privacidade': 'privacidade',
}

// sub-telas acendem o item "pai" do menu
const PARENT = {
  compromissos: 'extrato', parcelas: 'extrato', analise: 'extrato',
  historico: 'metas', assinaturas: 'metas', lembretes: 'metas', limites: 'metas',
  stories: 'home', notifs: 'home',
}

// telas do grupo "Configurações": o cartão do usuário (rodapé do menu) fica aceso
const SETTINGS_SCREENS = ['perfil', 'dadosPessoais', 'seguranca', 'notificacoes', 'fechamento', 'planos', 'pagamentos', 'indique', 'dados', 'instalar', 'termos', 'privacidade']

const normalize = (p) => (p && p.length > 1 ? p.replace(/\/+$/, '') : p)

// { screen, activeNav, inSettings } para a rota atual. activeNav é a chave do item aceso no menu (ou null).
export function desktopNavState(pathname) {
  const screen = SCREEN_BY_PATH[normalize(pathname)] || null
  if (!screen) return { screen: null, activeNav: null, inSettings: false }
  const activeNav = PARENT[screen] || screen
  return {
    screen,
    activeNav: DESKTOP_NAV.some(i => i.key === activeNav) ? activeNav : null,
    inSettings: SETTINGS_SCREENS.includes(screen),
  }
}

// título e subtítulo da barra de cima, por tela (TT do protótipo). Os textos com mês/data/contagem são calculados.
const WEEKDAYS_SHORT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MONTHS_LOWER = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function greetingFor(date) {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const STATIC_TITLES = {
  stories:       ['Resumo em stories', 'Seu mês contado em histórias'],
  parcelas:      ['Compras parceladas', 'Parcelas em andamento'],
  analise:       ['Análise do mês', 'Para onde foi seu dinheiro'],
  planilha:      ['Planilha IA', 'Montada automaticamente a partir das suas contas'],
  analisador:    ['Analisador de compras', 'A Nancy diz se vale comprar, parcelar ou esperar'],
  metas:         ['Metas', 'Seus objetivos'],
  historico:     ['Histórico', 'Últimos 6 meses'],
  assinaturas:   ['Assinaturas', 'Detectadas pela Nancy IA'],
  lembretes:     ['Lembretes', 'Avisos de vencimento'],
  limites:       ['Limites', 'Teto de gasto por categoria'],
  financas:      ['Finanças', 'Salário e contas fixas'],
  calendario:    ['Calendário', 'Vencimentos e lançamentos'],
  perfil:        ['Configurações', 'Sua conta Nancy'],
  dadosPessoais: ['Dados pessoais', 'Nome, e-mail e foto'],
  seguranca:     ['Segurança', 'Senha e duas etapas'],
  notificacoes:  ['Preferências', 'Alertas e lembretes'],
  fechamento:    ['Balanço mensal', 'Fechar o mês e gerar relatório'],
  planos:        ['Planos', 'Grátis, Pro e Elite'],
  pagamentos:    ['Pagamentos', 'Histórico e cancelamento'],
  indique:       ['Indique e ganhe', 'Convide amigos'],
  dados:         ['Meus dados', 'Exportar ou excluir'],
  instalar:      ['Instalar app', 'Nancy no computador'],
  termos:        ['Termos de Uso', 'Atualizado em out/2026'],
  privacidade:   ['Política de Privacidade', 'Conforme a LGPD'],
}

// opts: { now: Date, firstName: string }. A tela pode trocar só o subtítulo (usePageSubtitle) quando ele depende dos dados dela.
export function desktopTitle(pathname, { now = new Date(), firstName = '' } = {}) {
  const { screen } = desktopNavState(pathname)
  const month = MONTHS_LOWER[now.getMonth()]
  if (screen === 'home') {
    const hello = `${greetingFor(now)}${firstName ? `, ${firstName}` : ''}`
    return ['Início', `${hello} · ${WEEKDAYS_SHORT[now.getDay()]}, ${now.getDate()} de ${month}`]
  }
  if (screen === 'extrato') return ['Extrato', `Todas as movimentações de ${month}`]
  if (screen === 'compromissos') return ['Contas do mês', `Compromissos de ${month}`]
  if (screen === 'notifs') return ['Notificações', 'Suas novidades'] // a tela troca por "N novas" (usePageSubtitle)
  if (screen && STATIC_TITLES[screen]) return STATIC_TITLES[screen]
  return ['Ops!', 'Erro 404'] // rota fora do mapa: é a tela 404
}
