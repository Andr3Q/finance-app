import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { goalsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { peekStory, loadStory, invalidateStories, LOADERS } from '../services/storiesData.js'
import { monthName, money, maskSlides, HIDDEN_AMOUNT, buildRecapSlides, buildTipSlides, buildGoalSlides } from '../utils/storySlides.js'
import { resumoKey, dicasKey, metasKey, markSeen } from '../utils/storiesSeen.js'
import NancyMark from '../components/ui/NancyMark.jsx'

const STORY_DURATION_MS = 5000
const RING_R    = 46
const RING_CIRC = 2 * Math.PI * RING_R

const IconPause = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
)
const IconPlay = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
)
const IconClose = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
)

// Resumo em stories (tela 09). Os círculos do Início abrem esta mesma rota com
// state.story: 'resumo' (padrão, com state.monthOffset 0 ou -1), 'dicas' ou
// 'metas'. Cada fluxo usa os próprios dados reais; a construção dos slides
// fica em utils/storySlides.js (ver lá a regra de omitir o que não tem dado).
// Os dados já costumam estar prontos: o Início os busca em segundo plano
// (services/storiesData.js) — aqui só se abre com o que está guardado.
export default function StoriesResumo() {
  const navigate = useNavigate()
  const location = useLocation()
  const story    = LOADERS[location.state?.story] ? location.state.story : 'resumo'
  const offset   = story === 'resumo' ? Math.min(0, Math.max(-11, Number(location.state?.monthOffset) || 0)) : 0

  const user = useUser()
  // Já guardado pelo pré-carregamento do Início? Abre pronto, sem "Montando seu resumo…".
  const [warm]   = useState(() => peekStory(user.id, story, offset))
  const [data,   setData]   = useState(warm ?? null)
  const [status, setStatus] = useState(warm !== undefined ? 'ready' : 'loading') // loading | ready | error
  const [index,    setIndex]    = useState(0)
  const [paused,   setPaused]   = useState(false)
  const [progress, setProgress] = useState(0) // 0-1 dentro do slide atual
  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState(null)

  const rafRef      = useRef(null)
  const startRef    = useRef(null)
  const pausedAtRef = useRef(0)

  useEffect(() => {
    if (warm !== undefined) return undefined // já veio pronto; se a busca estiver no ar, loadStory se junta a ela
    let cancelled = false
    loadStory(user.id, story, offset)
      .then(d => { if (!cancelled) { setData(d); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [story, offset, user.id, warm])

  // Mesma preferência "ocultar valores" do Início — lida uma vez ao abrir.
  const [hideValues] = useState(() => {
    try { return localStorage.getItem('hide-balance') === '1' } catch { return false }
  })

  const slides = useMemo(() => {
    if (!data) return []
    const built = story === 'dicas' ? buildTipSlides(data)
      : story === 'metas' ? buildGoalSlides(data)
      : data.hasData ? buildRecapSlides(data, offset) : []
    return hideValues ? maskSlides(built) : built
  }, [data, story, offset, hideValues])

  // Abriu com conteúdo = vista: o anel do círculo no Início apaga. Story vazia
  // ou com erro não conta (o usuário não viu nada).
  useEffect(() => {
    if (status !== 'ready' || slides.length === 0) return
    markSeen(story === 'dicas' ? dicasKey() : story === 'metas' ? metasKey() : resumoKey(offset))
  }, [status, slides.length, story, offset])

  // Volta pra tela de onde os stories foram abertos (Início, Perfil, Notificações); aberto direto pela URL, vai pro Início.
  const close = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'))

  const goTo = (i) => {
    if (i < 0) return // já no primeiro — tocar na esquerda não faz nada
    if (i >= slides.length) { close(); return } // depois do último — fecha
    pausedAtRef.current = 0
    setIndex(i)
    setProgress(0)
  }

  useEffect(() => {
    if (paused || slides.length === 0) return
    let cancelled = false
    startRef.current = performance.now() - pausedAtRef.current
    const tick = (t) => {
      if (cancelled) return
      const pct = Math.min(1, (t - startRef.current) / STORY_DURATION_MS)
      setProgress(pct)
      if (pct >= 1) { goTo(index + 1); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, slides.length])

  const togglePause = () => {
    if (!paused) pausedAtRef.current = progress * STORY_DURATION_MS
    setPaused(p => !p)
  }

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const shareTitle = story === 'dicas' ? 'Uma dica da Nancy'
    : story === 'metas' ? 'Minha meta na Nancy'
    : `Meu resumo de ${monthName(data?.month ?? 1)} na Nancy`

  const share = async (slide) => {
    const text = [slide.headline, slide.big, slide.sub].filter(Boolean).join(' — ')
    try {
      if (navigator.share) { await navigator.share({ title: shareTitle, text }); return }
      await navigator.clipboard.writeText(`${shareTitle}: ${text}`)
      showToast('Copiado.')
    } catch { /* usuário cancelou o compartilhamento */ }
  }

  const createGoal = async (cta) => {
    if (busy) return
    setBusy(true)
    try {
      const lastDay = new Date(cta.nextYm.year, cta.nextYm.month, 0).getDate()
      const mm = String(cta.nextYm.month).padStart(2, '0')
      await goalsAPI.create({
        title: `Meta de ${cta.nextName}`,
        targetAmount: cta.amount,
        deadline: `${cta.nextYm.year}-${mm}-${String(lastDay).padStart(2, '0')}`,
      })
      invalidateStories()
      navigate('/goals')
    } catch (err) {
      showToast(err.response?.data?.error || 'Não foi possível criar a meta.', false)
      setBusy(false)
    }
  }

  // O chat da Nancy fica abaixo desta tela (z-index menor), então abrir o chat
  // aqui o esconderia — volta pro Início, que abre o chat ao receber o state.
  const runCta = (cta) => {
    if (cta.kind === 'create-goal') return createGoal(cta)
    if (cta.kind === 'open-chat')   return navigate('/dashboard', { state: { openChat: true } })
    if (cta.kind === 'go-goals')    return navigate('/goals')
  }

  const slide = slides[index]
  const title = story === 'dicas' ? 'Dicas da Nancy'
    : story === 'metas' ? 'Suas metas'
    : data ? `Resumo de ${monthName(data.month)}` : 'Resumo'

  // Fluxo carregou mas não há nenhum slide com dado real.
  const empty = status === 'ready' && slides.length === 0 ? ({
    dicas: { eyebrow: 'Dicas da Nancy', headline: 'Ainda sem dicas por aqui.', sub: 'Registre mais transações para a Nancy encontrar onde dá para melhorar.' },
    metas: { eyebrow: 'Suas metas', headline: 'Nenhuma meta em andamento.', sub: 'Crie uma meta para acompanhar seu progresso aqui.', cta: { kind: 'go-goals', label: 'Criar uma meta' } },
    resumo: { eyebrow: 'Resumo do mês', headline: `Sem movimentações em ${monthName(data?.month ?? 1)}.`, sub: 'Registre suas transações para ver o resumo aqui.' },
  })[story] : null

  const cta = slide?.cta || empty?.cta

  return (
    <div className={`stories-page${slide ? ` stories-theme-${slide.theme}` : ''}`}>
      <div className="stories-progress-row">
        {slides.map((s, i) => (
          <div key={s.id} className="stories-progress-track">
            <div
              className="stories-progress-fill"
              style={{ width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%` }}
            />
          </div>
        ))}
      </div>

      <div className="stories-header">
        <div className="stories-header-user">
          <NancyMark size={30} />
          <div className="stories-header-text">
            <span className="stories-title">{title}</span>
            <span className="stories-sub">Nancy · resumo</span>
          </div>
        </div>
        <div className="stories-header-actions">
          <button className="stories-iconbtn" onClick={togglePause} aria-label={paused ? 'Retomar' : 'Pausar'}>
            {paused ? <IconPlay /> : <IconPause />}
          </button>
          <button className="stories-iconbtn" onClick={close} aria-label="Fechar">
            <IconClose />
          </button>
        </div>
      </div>

      <button className="stories-tap-zone stories-tap-left" onClick={() => goTo(index - 1)} aria-label="Voltar" />
      <button className="stories-tap-zone stories-tap-right" onClick={() => goTo(index + 1)} aria-label="Avançar" />

      <div className="stories-content">
        {status === 'loading' && <p className="stories-subtext">Montando seu resumo…</p>}
        {status === 'error' && <p className="stories-subtext">Não foi possível carregar o resumo. Tente de novo mais tarde.</p>}
        {empty && (
          <>
            <div className="stories-eyebrow">{empty.eyebrow}</div>
            <h1 className="stories-headline">{empty.headline}</h1>
            <p className="stories-subtext">{empty.sub}</p>
          </>
        )}

        {slide && (
          slide.id === 'intro' ? (
            <>
              <div className="stories-eyebrow">Resumo do mês</div>
              <h1 className="stories-headline">
                Seu {monthName(data.month)}<br />
                em {slides.length} história{slides.length === 1 ? '' : 's'}.
              </h1>
              <p className="stories-subtext">Toque à direita para avançar.</p>
            </>
          ) : (
            <>
              <div className="stories-eyebrow">{slide.eyebrow}</div>
              <h1 className="stories-headline">{slide.headline}</h1>
              {slide.big && <div className={`stories-big${slide.bigAccent ? ' stories-big-accent' : ''}`}>{slide.big}</div>}
              {slide.bars && (
                <div className="stories-bars">
                  {slide.bars.map((b, i) => (
                    <div key={b.label} className="stories-bar-row">
                      <div className="stories-bar-label"><span>{b.label}</span><span className="stories-mono">{b.hidden ? HIDDEN_AMOUNT : money(b.amount)}</span></div>
                      <div className="stories-bar-track"><div className={`stories-bar-fill stories-bar-fill-${i}`} style={{ width: `${b.pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {slide.ring !== undefined && (
                <div className="stories-ring">
                  <svg width="112" height="112" viewBox="0 0 112 112">
                    <circle cx="56" cy="56" r={RING_R} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="9" />
                    <circle cx="56" cy="56" r={RING_R} fill="none" stroke="#34E3A0" strokeWidth="9" strokeLinecap="round"
                      strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - slide.ring / 100)}
                      transform="rotate(-90 56 56)" />
                  </svg>
                  <span className="stories-ring-score">{slide.ring}</span>
                </div>
              )}
              {slide.sub && <p className="stories-subtext">{slide.sub}</p>}
            </>
          )
        )}
      </div>

      {cta && (
        <div className="stories-cta-wrap">
          <button className="stories-cta" onClick={() => runCta(cta)} disabled={busy}>{cta.label}</button>
          {slide && <button className="stories-share" onClick={() => share(slide)}>Compartilhar resumo</button>}
        </div>
      )}

      {toast && <div className={`stories-toast${toast.ok ? '' : ' stories-toast-err'}`} role="status">{toast.msg}</div>}
    </div>
  )
}
