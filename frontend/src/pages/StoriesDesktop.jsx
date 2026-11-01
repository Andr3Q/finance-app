import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import NancyMark from '../components/ui/NancyMark.jsx'
import { useForcedLightTheme } from '../hooks/useTheme.js'
import { useTipAvailable } from '../hooks/useTipAvailable.js'
import { peekStory, loadStory } from '../services/storiesData.js'
import { viewerSlides } from '../utils/homeCarousel.js'
import { MONTHS } from '../constants/index.js'

const FALLBACK_BG = 'linear-gradient(120deg,#1546FF,#0A2A9E)'
// n === null: ainda carregando — o cartão guarda a altura sem anunciar "Sem histórias" por engano
const plural = (n) => (n === null ? '\u00a0' : n === 0 ? 'Sem histórias' : `${n} ${n === 1 ? 'história' : 'histórias'}`)
const capital = (t) => t[0].toUpperCase() + t.slice(1)

// um dos fluxos de resumo, já pronto do pré-carregamento do Início ou buscado agora (os mesmos dados da tela do celular)
function useFlow(userId, kind, offset, enabled = true) {
  const [state, setState] = useState(() => {
    const warm = enabled && userId ? peekStory(userId, kind, offset) : null
    return warm != null ? { data: warm, done: true } : { data: null, done: false }
  })
  useEffect(() => {
    if (!enabled || !userId) return undefined
    let cancelled = false
    loadStory(userId, kind, offset)
      .then(d => { if (!cancelled) setState({ data: d ?? null, done: true }) })
      .catch(() => { if (!cancelled) setState({ data: null, done: true }) })
    return () => { cancelled = true }
  }, [userId, kind, offset, enabled])
  return state
}

// Os quatro conjuntos do topo: resumo do mês, dicas da Nancy IA, metas e resumo do mês anterior. Dicas só são buscadas quando existem
// (a dica chama a IA do servidor).
function useSets(userId, hidden) {
  const tipKnown = useTipAvailable(userId) // true / false / null (ainda não se sabe)
  const tipOk = tipKnown === true
  const f0 = useFlow(userId, 'resumo', 0)
  const f1 = useFlow(userId, 'resumo', -1)
  const fd = useFlow(userId, 'dicas', 0, tipOk)
  const fm = useFlow(userId, 'metas', 0)
  const d0 = f0.data, d1 = f1.data, dd = fd.data, dm = fm.data
  const count = (f, flow, data) => (f.done ? viewerSlides(flow, data, { hidden }).length : null)
  return useMemo(() => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const goalsPct = Array.isArray(dm) && dm.length
      ? Math.round(dm.reduce((s, g) => s + (g.targetAmount > 0 ? Math.min(1, g.currentAmount / g.targetAmount) : 0), 0) / dm.length * 100)
      : null
    return [
      { key: 'resumo', short: MONTHS[now.getMonth()].slice(0, 3).toUpperCase(), name: `Resumo de ${MONTHS[now.getMonth()].toLowerCase()}`, n: count(f0, 'resumo', d0), bg: 'linear-gradient(135deg,#1546FF,#12C985)', state: { story: 'resumo', monthOffset: 0 } },
      { key: 'dicas', short: '✦', name: 'Dicas IA', n: tipKnown === null ? null : tipOk ? count(fd, 'dicas', dd) : 0, bg: '#12C985', state: { story: 'dicas' } },
      { key: 'metas', short: goalsPct !== null ? `${goalsPct}%` : '—', name: 'Metas', n: count(fm, 'metas', dm), bg: '#0E9A69', state: { story: 'metas' } },
      { key: 'anterior', short: MONTHS[prev.getMonth()].slice(0, 3).toUpperCase(), name: capital(MONTHS[prev.getMonth()]), n: count(f1, 'anterior', d1), bg: '#0A2A9E', state: { story: 'resumo', monthOffset: -1 } },
    ]
  }, [f0, f1, fd, fm, tipKnown, tipOk, hidden])
}

const IconPause = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
const IconPlay = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>

// Resumo em stories no desktop (design "Nancy Desktop", tela 09): os quatro conjuntos em cartões e o visualizador grande por baixo.
// Só a apresentação — dados, tempo, pausa, teclado, criar meta e compartilhar são os do StoriesResumo, que passa tudo em `ctx`.
// O design não desenha os botões de ação dos slides (criar meta, revisar com a Nancy, compartilhar): são funções do app e ficam
// sob o texto, só nos slides que os têm.
export default function StoriesDesktop({ ctx }) {
  useForcedLightTheme() // dentro do menu e da barra do desktop, a tela segue o tema claro das outras
  const navigate = useNavigate()
  const { user, hidden, flowKey, slides, index, status, duration, paused, effectivePaused, setHover, togglePause, goTo, next, empty, retry, cta, runCta, share, busy, toast, setTitle } = ctx
  const sets = useSets(user.id, hidden)
  const slide = slides[index]
  // o design dá ao cabeçalho o mesmo nome do cartão selecionado ("Setembro", "Metas", "Dicas IA")
  const headName = sets.find(g => g.key === flowKey)?.name || setTitle

  return (
    <>
      <Navbar />
      <div className="pwnav ndh-pwnav fade-in">
        <div className="ndsv-page">
          <div className="ndsv-sets">
            {sets.map(g => (
              <button
                key={g.key} type="button" className={`ndsv-set${g.key === flowKey ? ' sel' : ''}`}
                aria-pressed={g.key === flowKey} onClick={() => navigate('/resumo-stories', { replace: true, state: g.state })}
              >
                <span className="ndsv-set-ico" style={{ background: g.bg }}>{g.short}</span>
                <span className="ndsv-set-text"><span className="ndsv-set-name">{g.name}</span><span className="ndsv-set-n">{plural(g.n)}</span></span>
              </button>
            ))}
          </div>

          <section className="ndsv-viewer" style={{ background: slide?.bg || FALLBACK_BG }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-label={setTitle}>
            <div className="ndsv-bars">
              {slides.map((s, i) => (
                <button key={`${s.id}-${i}`} type="button" className="ndsv-bar" onClick={() => goTo(i)} aria-label={`Ir para o resumo ${i + 1} de ${slides.length}`}>
                  <span
                    key={i === index ? `cur-${index}` : i}
                    className={`ndsv-fill${i < index ? ' done' : i === index ? ' cur' : ''}`}
                    style={i === index ? { animationDuration: `${duration}ms`, animationPlayState: effectivePaused ? 'paused' : 'running' } : undefined}
                  />
                </button>
              ))}
            </div>
            {/* o cartão todo avança ao clique (como no design); barras, cabeçalho, pausa e botões ficam por cima */}
            {slide && <button type="button" className="ndsv-hit" onClick={next} aria-label="Próximo resumo" />}
            <div className="ndsv-head"><NancyMark size={34} /><span className="ndsv-head-name">{headName}</span><span className="ndsv-head-by">· Nancy</span></div>
            <button type="button" className="ndsv-pause" onClick={togglePause} aria-label={paused ? 'Retomar' : 'Pausar'}>{effectivePaused ? <IconPlay /> : <IconPause />}</button>

            <div className="ndsv-body">
              {status === 'loading' && <span className="ndsv-sub">Montando seu resumo…</span>}
              {status === 'error' && (<><span className="ndsv-sub">Não foi possível carregar o resumo.</span><button type="button" className="ndsv-btn" onClick={retry}>Tentar de novo</button></>)}
              {empty && (<><span className="ndsv-kicker">{empty.eyebrow.toUpperCase()}</span><span className="ndsv-title">{empty.headline}</span><span className="ndsv-sub">{empty.sub}</span></>)}
              {slide && (
                <>
                  <span className="ndsv-kicker" key={`k${index}`}>{slide.k}</span>
                  <span className="ndsv-title" key={`t${index}`}>{slide.t}</span>
                  {slide.v && <span className="ndsv-value" key={`v${index}`}>{slide.v}</span>}
                  {slide.s && <span className="ndsv-sub" key={`s${index}`}>{slide.s}</span>}
                </>
              )}
              {cta && (
                <div className="ndsv-actions">
                  <button type="button" className="ndsv-btn" onClick={() => runCta(cta)} disabled={busy}>{cta.label}</button>
                  {slide && <button type="button" className="ndsv-btn ndsv-btn--ghost" onClick={() => share(slide)}>Compartilhar resumo</button>}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      {toast && <div className={`stories-toast${toast.ok ? '' : ' stories-toast-err'}`} role="status">{toast.msg}</div>}
    </>
  )
}
