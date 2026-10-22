import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { transactionsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { getCache, setCache } from '../services/cache.js'
import Navbar from '../components/layout/Navbar.jsx'
import { getSalaryNotif, getTrialNotif } from '../utils/notifications.js'
import { buildNotifications, countUnread, readNotifIds, markNotifsRead } from '../utils/notificationsFeed.js'
import { buildRecapSlides, maskAmounts } from '../utils/storySlides.js'

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
  salary: () => <Svg><path d="M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 007.93 3H4a2 2 0 00-2 2v13c0 1.1.9 2 2 2z"/></Svg>,
  recap:  () => <Svg><path d="M9.94 15.5A2 2 0 008.5 14.06l-6.14-1.58a.5.5 0 010-.96L8.5 9.94A2 2 0 009.94 8.5l1.58-6.14a.5.5 0 01.96 0L14.06 8.5a2 2 0 001.44 1.44l6.14 1.58a.5.5 0 010 .96L15.5 14.06a2 2 0 00-1.44 1.44l-1.58 6.14a.5.5 0 01-.96 0z"/></Svg>,
  limit:  () => <Svg><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Svg>,
  bill:   () => <Svg><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></Svg>,
  trial:  () => <Svg><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>,
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

const readHidden = () => { try { return localStorage.getItem('hide-balance') === '1' } catch { return false } }
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
  const [seenAtOpen] = useState(readNotifIds)
  const [hidden]     = useState(readHidden)

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
    salaryNotif, trialNotif, recapSlides,
  }) : []),
  // salaryNotif/trialNotif mudam só com a data/usuário — recalcular junto dos dados basta
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data, recapSlides, user.id, user.trialEndsAt, user.isOnTrial])

  // Quantas histórias o resumo do mês tem de verdade — só pra frase do aviso ("em 6 histórias").
  const hasRecap = items.some(i => i.kind === 'recap')
  useEffect(() => {
    if (!hasRecap) return
    let cancelled = false
    transactionsAPI.monthlyRecap(0)
      .then(r => { if (!cancelled && r.data?.hasData) setRecapSlides(buildRecapSlides(r.data, 0).length) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [hasRecap])

  // Tudo que está na tela agora conta como visto.
  const idsKey = items.map(i => i.id).join('|')
  useEffect(() => {
    if (idsKey) markNotifsRead(idsKey.split('|'))
  }, [idsKey])

  const newCount = countUnread(items, seenAtOpen)
  const subtitle = loading ? 'Carregando…' : newCount === 0 ? 'Nenhuma nova' : newCount === 1 ? '1 nova' : `${newCount} novas`

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'))

  const open = (n) => {
    const a = n.action
    if (a.type === 'route') navigate(a.to)
    else if (a.type === 'story') navigate('/resumo-stories', { state: { monthOffset: a.monthOffset } })
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
