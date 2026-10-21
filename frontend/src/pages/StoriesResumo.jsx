import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MONTHS } from '../constants/index.js'

const STORY_DURATION_MS = 5000

const IconPause = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
)
const IconPlay = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
)
const IconClose = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
)

// Resumo em stories (tela 09) — só o slide de abertura foi desenhado até
// agora ("Seu outubro em 6 histórias", mas os outros 5 ainda não chegaram).
// Em vez de inventar o conteúdo que falta, implementei a estrutura real de
// navegação (barra de progresso, avança/pausa/fecha) já pronta pra crescer
// — "slides" é a única coisa que precisa ganhar itens quando os próximos
// designs chegarem. O texto do título usa slides.length de verdade, não um
// "6" fixo, pra barra de progresso e texto nunca ficarem inconsistentes
// entre si enquanto só esse slide existir.
export default function StoriesResumo() {
  const navigate = useNavigate()
  const now = new Date()
  const monthName = MONTHS[now.getMonth()]

  const slides = [
    { id: 'intro' },
  ]

  const [index,    setIndex]    = useState(0)
  const [paused,   setPaused]   = useState(false)
  const [progress, setProgress] = useState(0) // 0-1 dentro do slide atual

  const rafRef      = useRef(null)
  const startRef     = useRef(null)
  const pausedAtRef  = useRef(0)

  const close = () => navigate('/dashboard')

  const goTo = (i) => {
    if (i < 0) return // já no primeiro — tocar na esquerda não faz nada
    if (i >= slides.length) { close(); return } // depois do último — fecha
    pausedAtRef.current = 0
    setIndex(i)
    setProgress(0)
  }

  useEffect(() => {
    if (paused) return
    let cancelled = false
    startRef.current = performance.now() - pausedAtRef.current
    const tick = (t) => {
      if (cancelled) return
      const elapsed = t - startRef.current
      const pct = Math.min(1, elapsed / STORY_DURATION_MS)
      setProgress(pct)
      if (pct >= 1) { goTo(index + 1); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused])

  const togglePause = () => {
    if (!paused) pausedAtRef.current = progress * STORY_DURATION_MS
    setPaused(p => !p)
  }

  return (
    <div className="stories-page">
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
          <div className="stories-avatar">n</div>
          <div className="stories-header-text">
            <span className="stories-title">Resumo de {monthName.toLowerCase()}</span>
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
        {index === 0 && (
          <>
            <div className="stories-eyebrow">Resumo do mês</div>
            <h1 className="stories-headline">
              Seu {monthName.toLowerCase()}<br />
              em {slides.length} história{slides.length === 1 ? '' : 's'}.
            </h1>
            <p className="stories-subtext">Toque à direita para avançar.</p>
          </>
        )}
      </div>
    </div>
  )
}
