import { useState, useEffect } from 'react'
import { getInstallPrompt, clearInstallPrompt, isInstalled } from '../../services/installPrompt.js'

const DISMISS_KEY  = 'install-banner-dismissed'
const DISMISS_DAYS = 7

function detectPlatform() {
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) // iPadOS 13+
  const isAndroid = /Android/.test(ua)
  return { isIOS, isAndroid }
}

export default function InstallBanner() {
  const [visible,         setVisible]         = useState(false)
  const [hiding,          setHiding]          = useState(false)
  const [installing,      setInstalling]      = useState(false)
  const [hasNativePrompt, setHasNativePrompt] = useState(() => !!getInstallPrompt())
  const [isMobile,        setIsMobile]        = useState(false)
  const [platform,        setPlatform]        = useState({ isIOS: false, isAndroid: false })

  useEffect(() => {
    setIsMobile(window.innerWidth <= 768)
    setPlatform(detectPlatform())
    if (isInstalled()) return

    // No iOS não há prompt nativo — o card em Configurações já cobre essa necessidade
    const { isIOS } = detectPlatform()
    if (isIOS) return

    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && (Date.now() - Number(dismissed)) / 86400000 < DISMISS_DAYS) return

    setVisible(true)

    const onPrompt = (e) => { e.preventDefault(); window.__installPrompt = e; setHasNativePrompt(true) }
    const onInstalled = () => animateHide()
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const animateHide = () => {
    setHiding(true)
    setTimeout(() => { setVisible(false); setHiding(false) }, 300)
  }

  const handleClose = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    animateHide()
  }

  const handleInstall = async () => {
    const prompt = getInstallPrompt()
    if (!prompt) { setHasNativePrompt(false); return }
    setInstalling(true)
    try {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      clearInstallPrompt()
      if (outcome === 'accepted') animateHide()
      else setHasNativePrompt(false)
    } finally {
      setInstalling(false)
    }
  }

  if (!visible) return null

  const posDesktop = { position: 'fixed', bottom: 24, right: 84, width: 300, zIndex: 210 }
  const posMobile  = {
    position: 'fixed',
    bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)', maxWidth: 400, zIndex: 210,
  }
  const anim = { animation: `${hiding ? 'bannerOut .28s' : 'bannerIn .32s cubic-bezier(.34,1.56,.64,1)'} forwards` }

  const isDesktop = !platform.isIOS && !platform.isAndroid && !isMobile
  const props = { hasPrompt: hasNativePrompt, installing, platform, isDesktop, onInstall: handleInstall, onClose: handleClose }

  return (
    <div style={isMobile ? posMobile : posDesktop}>
      <div style={anim}>
        {isMobile ? <MobileBanner {...props} /> : <DesktopBanner {...props} />}
      </div>
    </div>
  )
}

function Instructions({ platform, isDesktop }) {
  if (platform.isIOS) {
    return (
      <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
        <span style={{ display: 'block' }}>1. Toque em <ShareIcon /> no Safari</span>
        <span style={{ display: 'block' }}>2. Escolha <strong style={{ color: 'var(--c)' }}>"Adicionar à Tela de Início"</strong></span>
      </div>
    )
  }
  if (isDesktop) {
    return (
      <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
        <span style={{ display: 'block' }}>Clique em <strong style={{ color: 'var(--c)' }}>⊕</strong> na barra de endereço do Chrome</span>
        <span style={{ display: 'block' }}>e selecione <strong style={{ color: 'var(--c)' }}>"Instalar"</strong></span>
      </div>
    )
  }
  return (
    <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
      <span style={{ display: 'block' }}>1. Toque no menu <strong style={{ color: 'var(--t1)', fontSize: 15 }}>⋮</strong> do Chrome</span>
      <span style={{ display: 'block' }}>2. Escolha <strong style={{ color: 'var(--c)' }}>"Instalar app"</strong></span>
    </div>
  )
}

function MobileBanner({ hasPrompt, installing, platform, isDesktop, onInstall, onClose }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid rgba(74,226,172,.3)', borderRadius: 20,
      padding: '14px 16px', backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,.18)',
    }}>
      {hasPrompt ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/icon-192.png" alt="" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,.3)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)', marginBottom: 2 }}>Instalar Nancy</div>
            <div style={{ fontSize: 11.5, color: 'var(--t2)' }}>Acesso rápido na tela inicial</div>
          </div>
          <button
            onClick={onInstall} disabled={installing}
            style={{
              flexShrink: 0,
              background: installing ? 'rgba(74,226,172,.3)' : 'linear-gradient(135deg, var(--c), #2bbf96)',
              color: '#000000', border: 'none', borderRadius: 12,
              padding: '8px 14px', fontSize: 12, fontWeight: 800,
              fontFamily: 'var(--fd)', cursor: installing ? 'default' : 'pointer',
              WebkitTapHighlightColor: 'transparent', transition: 'transform .1s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onTouchStart={e => { if (!installing) e.currentTarget.style.transform = 'scale(.93)' }}
            onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {installing ? <><Spinner /> Aguarde</> : 'Instalar'}
          </button>
          <button onClick={onClose} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }} aria-label="Fechar">
            <XIcon />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>📲</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)', marginBottom: 6 }}>
              Instalar Nancy
            </div>
            <Instructions platform={platform} isDesktop={isDesktop} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4, flexShrink: 0 }} aria-label="Fechar">
            <XIcon />
          </button>
        </div>
      )}
    </div>
  )
}

function DesktopBanner({ hasPrompt, installing, platform, isDesktop, onInstall, onClose }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid rgba(74,226,172,.3)',
      borderRadius: 16, padding: '14px 16px', backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasPrompt ? 12 : 0 }}>
        {hasPrompt
          ? <img src="/icon-192.png" alt="" style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0 }} />
          : <span style={{ fontSize: 20 }}>📲</span>
        }
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--fd)', marginBottom: hasPrompt ? 2 : 6 }}>
            Instalar Nancy
          </div>
          {hasPrompt
            ? <div style={{ fontSize: 11, color: 'var(--t2)' }}>Acesso rápido na tela inicial</div>
            : <Instructions platform={platform} />
          }
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2, flexShrink: 0 }} aria-label="Fechar">
          <XIcon size={14} />
        </button>
      </div>
      {hasPrompt && (
        <button
          onClick={onInstall} disabled={installing}
          style={{
            width: '100%',
            background: installing ? 'rgba(74,226,172,.3)' : 'linear-gradient(135deg, var(--c), #2bbf96)',
            color: '#000000', border: 'none', borderRadius: 10,
            padding: '9px 0', fontSize: 13, fontWeight: 800,
            fontFamily: 'var(--fd)', cursor: installing ? 'default' : 'pointer',
            transition: 'transform .1s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}
          onMouseDown={e => { if (!installing) e.currentTarget.style.transform = 'scale(.97)' }}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {installing ? <><Spinner /> Aguarde...</> : '⚡ Instalar app'}
        </button>
      )}
    </div>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"
      style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px', color: 'var(--c)' }}>
      <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
    </svg>
  )
}

function Spinner() {
  return <span style={{ width: 10, height: 10, border: '2px solid #000000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .7s linear infinite', display: 'inline-block' }} />
}

function XIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
    </svg>
  )
}
