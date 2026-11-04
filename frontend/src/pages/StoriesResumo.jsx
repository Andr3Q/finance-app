import { useState, useEffect, useRef, useMemo } from 'react'
import { useHideBalance } from '../hooks/useHideBalance.js'
import { useNavigate, useLocation } from 'react-router-dom'
import { goalsAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'
import { useEscapeKey } from '../hooks/useEscapeKey.js'
import { peekStory, loadStory, invalidateStories, LOADERS } from '../services/storiesData.js'
import { monthName, money, maskSlides, HIDDEN_AMOUNT, buildRecapSlides, buildTipSlides, buildGoalSlides } from '../utils/storySlides.js'
import { resumoKey, dicasKey, metasKey, markSeen } from '../utils/storiesSeen.js'
import NancyMark from '../components/ui/NancyMark.jsx'
import { useIsDesktop } from '../hooks/useIsDesktop.js'
import { viewerSlides, CAROUSEL_MS } from '../utils/homeCarousel.js'
import StoriesDesktop from './StoriesDesktop.jsx'

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
  const location = useLocation()
  const story    = LOADERS[location.state?.story] ? location.state.story : 'resumo'
  const offset   = story === 'resumo' ? Math.min(0, Math.max(-11, Number(location.state?.monthOffset) || 0)) : 0
  // no desktop os quatro conjuntos ficam lado a lado e trocar de conjunto muda a rota (replace): cada fluxo começa do zero
  return <StoriesFlow key={`${story}|${offset}`} story={story} offset={offset} />
}

function StoriesFlow({ story, offset }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useIsDesktop() // no desktop a tela tem layout próprio (design "Nancy Desktop"); dados, tempo e ações são os mesmos
  const duration = isDesktop ? CAROUSEL_MS : STORY_DURATION_MS // o protótipo do desktop troca de slide a cada 4s
  const [hover, setHover] = useState(false)

  const user = useUser()
  // Já guardado pelo pré-carregamento do Início? Abre pronto, sem "Montando seu resumo…".
  const [warm]   = useState(() => peekStory(user.id, story, offset))
  const [data,   setData]   = useState(warm ?? null)
  const [status, setStatus] = useState(warm !== undefined ? 'ready' : 'loading') // loading | ready | error
  const [index,    setIndex]    = useState(0)
  const [paused,   setPaused]   = useState(false)
  const [away,     setAway]     = useState(false) // o app foi para o segundo plano: o story espera, como se estivesse pausado
  const [busy,  setBusy]  = useState(false)
  const [toast, setToast] = useState(null)
  const [attempt, setAttempt] = useState(0) // sobe a cada "Tentar de novo": refaz a busca que falhou

  // Relógio do slide atual: quanto já passou antes da última pausa e quando a rodada atual começou.
  const clockRef = useRef({ elapsed: 0, startedAt: 0 })

  useEffect(() => {
    if (warm !== undefined) return undefined // já veio pronto; se a busca estiver no ar, loadStory se junta a ela
    let cancelled = false
    loadStory(user.id, story, offset)
      .then(d => { if (!cancelled) { setData(d); setStatus('ready') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [story, offset, user.id, warm, attempt])

  const retry = () => { setStatus('loading'); setAttempt(a => a + 1) } // erro nunca fica guardado: a próxima busca vai à rede

  // Mesma preferência "ocultar valores" do Início (e do olho da barra de cima no desktop).
  const [hideValues] = useHideBalance()

  const slides = useMemo(() => {
    if (!data) return []
    const built = story === 'dicas' ? buildTipSlides(data)
      : story === 'metas' ? buildGoalSlides(data)
      : data.hasData ? buildRecapSlides(data, offset) : []
    return hideValues ? maskSlides(built) : built
  }, [data, story, offset, hideValues])

  const flow = story === 'resumo' ? (offset < 0 ? 'anterior' : 'resumo') : story
  const dSlides = useMemo(() => (isDesktop && data ? viewerSlides(flow, data, { hidden: hideValues }) : []), [isDesktop, data, flow, hideValues])
  const total = isDesktop ? dSlides.length : slides.length

  // Abriu com conteúdo = vista: o anel do círculo no Início apaga. Story vazia
  // ou com erro não conta (o usuário não viu nada).
  useEffect(() => {
    if (status !== 'ready' || total === 0) return
    markSeen(story === 'dicas' ? dicasKey() : story === 'metas' ? metasKey() : resumoKey(offset))
  }, [status, total, story, offset])

  // Volta pra tela de onde os stories foram abertos (Início, Perfil, Notificações); aberto direto pela URL, vai pro Início.
  const close = () => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'))

  const goTo = (i) => {
    if (i < 0) return // já no primeiro — tocar na esquerda não faz nada
    if (i >= total) { close(); return } // depois do último — fecha
    clockRef.current = { elapsed: 0, startedAt: 0 }
    setIndex(i)
  }

  // Soma ao relógio o que já passou nesta rodada (chamar ANTES de pausar).
  const stopClock = () => {
    const c = clockRef.current
    if (c.startedAt) { c.elapsed += Date.now() - c.startedAt; c.startedAt = 0 }
  }

  // Cada slide dura STORY_DURATION_MS. A barra anda por CSS (animação de transform, que roda fora da thread do React): antes o
  // estado de progresso mudava a cada quadro e a tela inteira era refeita 60 vezes por segundo, pesado em celular simples.
  // Aqui só há UM temporizador por slide e a pausa/retomada usa o relógio acima.
  const effectivePaused = paused || away || (isDesktop && hover) // no desktop, passar o mouse pausa
  useEffect(() => {
    if (effectivePaused || total === 0) return undefined
    const c = clockRef.current
    c.startedAt = Date.now()
    const timer = setTimeout(() => goTo(index + 1), Math.max(0, duration - c.elapsed))
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, effectivePaused, total, duration])

  // Trocou de app/aba: o story espera (a barra e o relógio param) e continua de onde estava ao voltar.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopClock()
      setAway(document.hidden)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Teclado (desktop e acessibilidade): Esc fecha, setas voltam e avançam.
  useEscapeKey(() => close(), true)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') goTo(index + 1)
      else if (e.key === 'ArrowLeft') goTo(index - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total])

  const togglePause = () => {
    if (!paused) stopClock()
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
      // Já existe a meta deste mês? Sem isto, cada toque criava outra "Meta de <mês>" igual.
      const title = `Meta de ${cta.nextName}`
      let existing = null
      try { existing = peekStory(user.id, 'metas') ?? await loadStory(user.id, 'metas') } catch { existing = null }
      if (Array.isArray(existing) && existing.some(g => String(g.title).trim().toLowerCase() === title.toLowerCase())) {
        showToast(`Você já tem a meta de ${cta.nextName}.`)
        setBusy(false)
        return
      }
      const lastDay = new Date(cta.nextYm.year, cta.nextYm.month, 0).getDate()
      const mm = String(cta.nextYm.month).padStart(2, '0')
      await goalsAPI.create({
        title,
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
    if (cta.kind === 'open-chat')   return navigate('/dashboard', { state: { openChat: true, message: cta.message } })
    if (cta.kind === 'go-goals')    return navigate('/goals')
  }

  const slide = isDesktop ? dSlides[index] : slides[index]
  const title = story === 'dicas' ? 'Dicas da Nancy'
    : story === 'metas' ? 'Suas metas'
    : data ? `Resumo de ${monthName(data.month)}` : 'Resumo'

  // Fluxo carregou mas não há nenhum slide com dado real.
  const empty = status === 'ready' && total === 0 ? ({
    dicas: { eyebrow: 'Dicas da Nancy', headline: 'Ainda sem dicas por aqui.', sub: 'Registre mais transações para a Nancy encontrar onde dá para melhorar.' },
    metas: { eyebrow: 'Suas metas', headline: 'Nenhuma meta em andamento.', sub: 'Crie uma meta para acompanhar seu progresso aqui.', cta: { kind: 'go-goals', label: 'Criar uma meta' } },
    resumo: { eyebrow: 'Resumo do mês', headline: `Sem movimentações em ${monthName(data?.month ?? 1)}.`, sub: 'Registre suas transações para ver o resumo aqui.' },
  })[story] : null

  const cta = slide?.cta || empty?.cta

  if (isDesktop) {
    return <StoriesDesktop ctx={{
      user, hidden: hideValues, flowKey: flow, slides: dSlides, index, status, duration, paused, effectivePaused, setHover, togglePause,
      goTo, next: () => goTo(index + 1), empty, retry, cta, runCta, share, busy, toast, setTitle: title,
    }} />
  }

  return (
    <div className={`stories-page${slide ? ` stories-theme-${slide.theme}` : ''}`} style={{ '--story-ms': `${duration}ms` }}>
      <div className="stories-progress-row">
        {slides.map((s, i) => (
          <div key={s.id} className="stories-progress-track">
            <div className={`stories-progress-fill${i < index ? ' is-done' : i === index ? ` is-active${effectivePaused ? ' is-paused' : ''}` : ''}`} />
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
        {status === 'error' && (
          <>
            <p className="stories-subtext">Não foi possível carregar o resumo.</p>
            <button type="button" className="stories-retry" onClick={retry}>Tentar de novo</button>
          </>
        )}
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
