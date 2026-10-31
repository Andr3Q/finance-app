import { useState, useEffect, useMemo, useCallback } from 'react'
import { useHideBalance } from '../hooks/useHideBalance.js'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI } from '../services/api.js'
import { loadStory } from '../services/storiesData.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { getCache, setCache } from '../services/cache.js'
import Navbar from '../components/layout/Navbar.jsx'
import { WalletGlyph, ReceiptGlyph } from '../components/ui/NancyGlyphs.jsx'
import { getSalaryNotif, getTrialNotif } from '../utils/notifications.js'
import { buildNotifications, countUnread, readNotifIds, markNotifsRead, isTipFresh } from '../utils/notificationsFeed.js'
import { prefsOf } from '../utils/notifPrefs.js'
import { usePrevMonthRecap } from '../hooks/usePrevMonthRecap.js'
import { usePageSubtitle } from '../hooks/usePageSubtitle.js'
import { publishUnreadCount } from '../hooks/useUnreadCount.js'
import { useTipAvailable } from '../hooks/useTipAvailable.js'
import { buildRecapSlides, maskAmounts } from '../utils/storySlides.js'
import { readCancelFlags, cancelReminders as toReminders } from '../utils/subsCancel.js'
import { readReminders } from '../utils/reminders.js'

// Notificações (Nancy 2, tela 13). Os avisos não vêm de uma tabela: são calculados na hora
// a partir dos mesmos dados do Início (utils/notificationsFeed.js) — por isso a lista nunca
// afirma algo que não é verdade agora. Abrir a tela marca tudo como visto neste aparelho
// (some o pontinho do sino do Início); o "N novas" do cabeçalho conta o que era novo
// no momento em que a tela abriu.

const Svg = ({ children }) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const ICONS = {
  salary: () => <WalletGlyph size={19} />,
  recap:  () => <Svg><path d="M9.94 15.5A2 2 0 008.5 14.06l-6.14-1.58a.5.5 0 010-.96L8.5 9.94A2 2 0 009.94 8.5l1.58-6.14a.5.5 0 01.96 0L14.06 8.5a2 2 0 001.44 1.44l6.14 1.58a.5.5 0 010 .96L15.5 14.06a2 2 0 00-1.44 1.44l-1.58 6.14a.5.5 0 01-.96 0z"/></Svg>,
  limit:  () => <Svg><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Svg>,
  bill:   () => <ReceiptGlyph size={19} />,
  reminder: () => <Svg><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></Svg>,
  cancel: () => <Svg><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></Svg>,
  trial:  () => <Svg><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>,
  tip:    () => <Svg><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0012 2z"/></Svg>,
}

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

const BellIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
  </svg>
)

const trialDismissed = () => { try { return !!sessionStorage.getItem('trial_just_expired') } catch { return false } }

export default function Notifications() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const [data,    setData]    = useState(() => getCache('dashboard') || null)
  const [loading, setLoading] = useState(() => !getCache('dashboard'))
  const [failed,  setFailed]  = useState(false)
  const [recapSlides, setRecapSlides] = useState(null)
  // Fotografia do que já estava visto quando a tela abriu — o "N novas" não zera sozinho
  // quando o efeito abaixo marca tudo como visto.
  const prefs = prefsOf(user)
  const prevRecapSlides = usePrevMonthRecap(prefs.stories)
  const tipAvailable = useTipAvailable(user.id) // só avisa da dica quando ela existe
  const [seenAtOpen] = useState(readNotifIds)
  const [hidden]     = useHideBalance()

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const { data: fresh } = await transactionsAPI.dashboard()
      if (!fresh || typeof fresh !== 'object') throw new Error('invalid response')
      setData(fresh)
      setCache('dashboard', fresh)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const salaryNotif = getSalaryNotif()
  const trialNotif  = user.id && !trialDismissed() ? getTrialNotif(user) : null

  const items = useMemo(() => (data ? buildNotifications({
    now: new Date(),
    summary: data.summary || null,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    limits: data.limits || [],
    budgets: data.budgets || [],
    salaryNotif, trialNotif, recapSlides, cancelReminders: toReminders(readCancelFlags()), reminderState: readReminders(),
    prefs, prevRecapSlides, tipFresh: tipAvailable === true && isTipFresh(Array.isArray(data.transactions) ? data.transactions : []),
  }) : []),
  // salaryNotif/trialNotif mudam só com a data/usuário — recalcular junto dos dados basta
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, recapSlides, prevRecapSlides, tipAvailable, user.id, user.trialEndsAt, user.isOnTrial, user.notifSalary, user.notifBudgetReminder, user.notifBudgetAlert, user.notifStories, user.notifTips])

  // Quantas histórias o resumo do mês tem de verdade — só pra frase do aviso ("em 6 histórias").
  const hasRecap = items.some(i => i.kind === 'recap')
  useEffect(() => {
    if (!hasRecap) return
    let cancelled = false
    loadStory(user.id, 'resumo', 0)
      .then(d => { if (!cancelled && d?.hasData) setRecapSlides(buildRecapSlides(d, 0).length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hasRecap, user.id])

  // Tudo que está na tela agora conta como visto.
  const idsKey = items.map(i => i.id).join('|')
  useEffect(() => {
    if (idsKey) markNotifsRead(idsKey.split('|'))
    if (data) publishUnreadCount(0) // viu tudo: a bolinha do sino (barra de cima do desktop) apaga
  }, [idsKey, data])

  const newCount = countUnread(items, seenAtOpen)
  const subtitle = loading ? 'Carregando…' : newCount === 0 ? 'Nenhuma nova' : newCount === 1 ? '1 nova' : `${newCount} novas`
  usePageSubtitle(loading ? null : subtitle) // barra de cima do desktop: "4 novas", como no design

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'))

  const open = (n) => {
    const a = n.action
    if (a.type === 'route') navigate(a.to)
    else if (a.type === 'story') navigate('/resumo-stories', { state: a.story ? { story: a.story } : { monthOffset: a.monthOffset } })
    else if (a.type === 'new-transaction') {
      window.dispatchEvent(new CustomEvent('nancy:new-transaction', { detail: { type: a.transactionType } }))
    }
  }

  return (
    <>
      <Navbar />
      <div className="pwnav ntf-pwnav fade-in">
        <div className="ntf-page">
          <header className="ntf-hero">
            <button type="button" className="ntf-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="ntf-head-text">
              <h1 className="ntf-title">Notificações</h1>
              <p className="ntf-sub">{subtitle}</p>
            </div>
          </header>

          <div className="ntf-body">
            {items.length > 0 ? (
              <ul className="ntf-card">
                {items.map(n => {
                  const Icon = ICONS[n.kind]
                  return (
                    <li key={n.id} className="ntf-item">
                      <button type="button" className="ntf-row" onClick={() => open(n)}>
                        <span className="ntf-ico"><Icon /></span>
                        <span className="ntf-main">
                          <span className="ntf-name">{n.title}</span>
                          <span className="ntf-text">{hidden ? maskAmounts(n.body) : n.body}</span>
                        </span>
                        <span className="ntf-when">{n.when}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="ntf-card ntf-empty">
                {loading ? (
                  <div className="dsb-loader"><div className="dsb-loader-ring" /></div>
                ) : failed ? (
                  <>
                    <p className="ntf-empty-title">Não foi possível carregar</p>
                    <p className="ntf-empty-sub">Confira sua conexão e tente de novo.</p>
                    <button type="button" className="ntf-retry" onClick={() => { setLoading(true); load() }}>Tentar de novo</button>
                  </>
                ) : (
                  <>
                    <span className="ntf-empty-ico"><BellIcon /></span>
                    <p className="ntf-empty-title">Tudo em dia</p>
                    <p className="ntf-empty-sub">Quando uma conta estiver vencendo, uma categoria chegar perto do limite ou o resumo do mês ficar pronto, avisamos por aqui.</p>
                  </>
                )}
              </div>
            )}

            <button type="button" className="ntf-prefs" onClick={() => navigate('/settings/notificacoes')}>
              Preferências de notificação
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
