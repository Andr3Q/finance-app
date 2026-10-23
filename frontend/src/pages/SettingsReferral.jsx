import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import { authAPI } from '../services/api.js'
import { analytics } from '../services/analytics.js'
import { useUser } from '../hooks/useUser.js'
import { useForcedLightTheme } from '../hooks/useTheme.js'

const Svg = ({ size = 18, sw = 1.9, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)
const BackIcon  = () => <Svg size={17} sw={2.4}><polyline points="15 18 9 12 15 6"/></Svg>
const CopyIcon  = () => <Svg size={15} sw={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></Svg>
const CheckIcon = () => <Svg size={15} sw={2.6}><polyline points="20 6 9 17 4 12"/></Svg>
const ShareIcon = () => <Svg size={17} sw={1.9}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></Svg>

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Indique e ganhe (Nancy 2, tela 31): código + copiar, andamento dos convites e compartilhar. Os números (dias de bônus,
// limite de indicações, trial do amigo) vêm do servidor/regra real — não os do print (30 dias, sem limite): quem decide
// mudar a recompensa muda o backend e a tela acompanha. "Copiar" copia o LINK (o cadastro só aceita o código pelo link ?ref=).
export default function SettingsReferral() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useUser()
  useForcedLightTheme() // tela desenhada só no claro (design Nancy 2)

  const [stats,    setStats]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [hasError, setHasError] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    authAPI.referralStats()
      .then(res => setStats(res.data))
      .catch(() => setHasError(true))
      .finally(() => setLoading(false))
  }, [])

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/settings'))

  // stats.referralCode como reserva: login antigo pode não ter salvo o código no sessionStorage
  const code = user.referralCode || stats?.referralCode
  const link = code ? `${window.location.origin}/register?ref=${code}` : null

  const rewarded     = stats?.rewardedCount ?? 0
  const referred     = stats?.referredCount ?? 0
  const max          = stats?.maxReferrals  ?? 5
  const bonusDays    = stats?.bonusDays     ?? 10
  const limitReached = stats?.limitReached  ?? false
  const pending      = Math.max(0, referred - rewarded) // cadastrados que ainda não confirmaram o e-mail
  const pct          = Math.min(100, Math.round((rewarded / max) * 100))
  const left         = Math.max(0, max - rewarded)

  const flashCopied = () => {
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  const handleCopy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    analytics.track('referral_link_copied')
    flashCopied()
  }
  const shareText = 'Controle suas finanças com IA! Use meu link e ganhe 14 dias de teste:'
  const handleShare = () => {
    if (!link) return
    if (navigator.share) navigator.share({ title: 'Nancy', text: shareText, url: link }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${link}`)}`, '_blank')
  }
  const handleMail = () => {
    if (link) window.open(`mailto:?subject=${encodeURIComponent('Experimente o Nancy')}&body=${encodeURIComponent(`${shareText} ${link}`)}`, '_blank')
  }

  return (
    <>
      <Navbar />
      <div className="pwnav fin-pwnav fade-in">
        <div className="fin-page">
          <header className="fin-hero">
            <button type="button" className="fin-back" onClick={goBack} aria-label="Voltar"><BackIcon /></button>
            <div className="fin-hero-text">
              <h1 className="fin-hero-title">Indique e ganhe</h1>
              <p className="fin-hero-sub">Convide amigos</p>
            </div>
          </header>

          <div className="fin-body">
            <section className="rf-hero" aria-label="Seu convite">
              {limitReached ? (
                <>
                  <h2 className="rf-title">Você garantiu todos os bônus!</h2>
                  <p className="rf-sub">Você completou {max} de {max} indicações com bônus. Obrigado por divulgar o Nancy!</p>
                </>
              ) : (
                <>
                  <h2 className="rf-title">Ganhe {bonusDays} dias de Pro por amigo.</h2>
                  <p className="rf-sub">Seu amigo ganha 14 dias de teste, o dobro do normal. Até {max} amigos com bônus.</p>
                  <div className="rf-code">
                    {code ? <span className="rf-code-text">{code}</span> : <span className="rf-code-wait">Gerando…</span>}
                    <button type="button" className={`rf-copy${copied ? ' done' : ''}`} onClick={handleCopy} disabled={!link}>
                      {copied ? <CheckIcon /> : <CopyIcon />}
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="fin-card rf-prog" aria-label="Seus convites">
              {hasError ? (
                <p className="rf-note rf-err">Não foi possível carregar seus convites agora. Recarregue a página.</p>
              ) : loading ? (
                <div className="rf-wait"><span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /></div>
              ) : (
                <>
                  <div className="rf-prog-head">
                    <h2 className="rf-prog-title">Seus convites</h2>
                    <span className="rf-prog-count">{rewarded} de {max}</span>
                  </div>
                  <div className="rf-bar" role="progressbar" aria-label="Convites com bônus" aria-valuemin={0} aria-valuemax={max} aria-valuenow={rewarded}>
                    <div className={`rf-bar-fill${limitReached ? ' full' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="rf-note">
                    {limitReached
                      ? 'Limite de bônus alcançado.'
                      : referred === 0
                        ? 'Nenhum amigo cadastrado ainda. Compartilhe seu convite!'
                        : `Mais ${plural(left, 'amigo', 'amigos')} e você completa o limite de bônus.`}
                  </p>
                  {pending > 0 && !limitReached && (
                    <p className="rf-note rf-pending">
                      {plural(pending, 'amigo cadastrado aguarda', 'amigos cadastrados aguardam')} confirmar o e-mail para liberar seu bônus. O bônus entra sozinho quando ele confirmar.
                    </p>
                  )}
                </>
              )}
            </section>

            {!limitReached && (
              <>
                <button type="button" className="rf-share" onClick={handleShare} disabled={!link}>
                  <ShareIcon />
                  Compartilhar convite
                </button>
                <button type="button" className="rf-mail" onClick={handleMail} disabled={!link}>ou enviar por e-mail</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
